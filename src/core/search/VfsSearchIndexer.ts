import { debugWarn } from "~/core/debug";
import { vfsToSearchDoc, type SearchIndexedDoc } from "~/core/search/MiniSearchIndex";
import { VfsError } from "~/core/vfs/errors";
import type { VFS } from "~/core/vfs/VFS";
import type { VfsDirEntry, VfsStat } from "~/core/vfs/nodes";
import { basename, normalizeVfsPath, type VfsPath } from "~/core/vfs/path";
import type { KernelEventMap, KernelEventsFacade } from "~/types/kernel";

export interface VfsSearchIndexerOptions {
  readonly vfs: VFS;
  readonly events: Pick<KernelEventsFacade, "on">;
  readonly roots?: readonly string[];
  readonly maxDocs?: number;
  readonly maxDepth?: number;
  readonly maxTextBytes?: number;
  readonly snippetChars?: number;
}

export interface VfsSearchIndexSink {
  replace(doc: SearchIndexedDoc): void | Promise<void>;
  removeVfsSubtree(path: string): void | Promise<void>;
}

const DEFAULT_ROOTS = ["/home"] as const;
const DEFAULT_MAX_DOCS = 500;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_TEXT_BYTES = 128 * 1024;
const DEFAULT_SNIPPET_CHARS = 180;
const TEXT_EXTENSIONS = new Set([
  "css",
  "js",
  "json",
  "log",
  "markdown",
  "md",
  "scss",
  "ts",
  "tsx",
  "txt",
  "vue",
]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

export class VfsSearchIndexer {
  private readonly vfs: VFS;

  private readonly events: Pick<KernelEventsFacade, "on">;

  private readonly roots: readonly string[];

  private readonly maxDocs: number;

  private readonly maxDepth: number;

  private readonly maxTextBytes: number;

  private readonly snippetChars: number;

  constructor(options: VfsSearchIndexerOptions) {
    this.vfs = options.vfs;
    this.events = options.events;
    this.roots = options.roots ?? DEFAULT_ROOTS;
    this.maxDocs = options.maxDocs ?? DEFAULT_MAX_DOCS;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxTextBytes = options.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES;
    this.snippetChars = options.snippetChars ?? DEFAULT_SNIPPET_CHARS;
  }

  // fallow-ignore-next-line unused-class-member
  async crawl(): Promise<SearchIndexedDoc[]> {
    const docs: SearchIndexedDoc[] = [];

    for (const root of this.roots) {
      if (docs.length >= this.maxDocs) {
        break;
      }

      try {
        const rootDoc = await this.docForPath(root);
        if (rootDoc !== null) {
          docs.push(rootDoc);
        }

        const entries = await this.vfs.walk(root, {
          maxDepth: this.maxDepth,
          maxEntries: Math.max(0, this.maxDocs - docs.length),
        });
        for (const entry of entries) {
          if (docs.length >= this.maxDocs) {
            break;
          }

          const doc = await this.docForEntry(entry);
          if (doc !== null) {
            docs.push(doc);
          }
        }
      } catch (error) {
        debugWarn("[vfs-search]", "crawl root failed", root, error);
      }
    }

    return docs.sort((a, b) => (a.rawId < b.rawId ? -1 : a.rawId > b.rawId ? 1 : 0));
  }

  // fallow-ignore-next-line unused-class-member
  subscribe(sink: VfsSearchIndexSink): () => void {
    return this.events.on("vfs.changed", (payload) => {
      void this.handleChange(payload, sink);
    });
  }

  private async handleChange(
    payload: KernelEventMap["vfs.changed"],
    sink: VfsSearchIndexSink,
  ): Promise<void> {
    const path = safeNormalize(payload.path);
    if (path === null) {
      return;
    }

    if (payload.operation === "remove") {
      await sink.removeVfsSubtree(path);
      return;
    }

    const doc = await this.docForPath(path);
    if (doc === null) {
      await sink.removeVfsSubtree(path);
      return;
    }

    await sink.replace(doc);
  }

  private async docForEntry(entry: VfsDirEntry): Promise<SearchIndexedDoc | null> {
    const stat: VfsStat = {
      path: entry.path,
      kind: entry.kind,
      size: entry.size,
      createdAt: entry.updatedAt,
      updatedAt: entry.updatedAt,
      readonly: entry.readonly,
      ...(entry.mimeType === undefined ? {} : { mimeType: entry.mimeType }),
    };

    return this.docFromStat(stat);
  }

  private async docForPath(path: string): Promise<SearchIndexedDoc | null> {
    try {
      return await this.docFromStat(await this.vfs.stat(path));
    } catch (error) {
      if (error instanceof VfsError && error.code === "NOT_FOUND") {
        return null;
      }

      debugWarn("[vfs-search]", "stat failed", path, error);
      return null;
    }
  }

  private async docFromStat(stat: VfsStat): Promise<SearchIndexedDoc | null> {
    if (stat.kind !== "file" && stat.kind !== "directory") {
      return null;
    }

    const path = normalizeVfsPath(stat.path);
    const entryKind = stat.kind === "directory" ? "directory" : "file";
    const ext = extension(path);
    const mimeType = normalizedMimeType(stat.mimeType);
    let title = titleFromPath(path);
    let body: string | undefined;
    let snippet: string | undefined;

    if (stat.kind === "file" && stat.size <= this.maxTextBytes && isTextLike(ext, mimeType)) {
      const source = await this.readText(path);
      if (source !== null) {
        const plain = plainText(source);
        body = plain;
        snippet = clip(plain, this.snippetChars);
        if (isMarkdown(ext, mimeType)) {
          title = markdownTitle(source) ?? title;
        }
      }
    }

    return vfsToSearchDoc({
      path,
      title,
      hint: path,
      keywords: keywordsFor(stat, ext, mimeType),
      ...(body === undefined ? {} : { body }),
      metadata: {
        path,
        entryKind,
        ...(mimeType === undefined ? {} : { mimeType }),
        size: stat.size,
        updatedAt: stat.updatedAt,
        ...(snippet === undefined ? {} : { snippet }),
      },
    });
  }

  private async readText(path: VfsPath): Promise<string | null> {
    try {
      return await this.vfs.readText(path);
    } catch (error) {
      debugWarn("[vfs-search]", "read failed", path, error);
      return null;
    }
  }
}

function safeNormalize(path: string): VfsPath | null {
  try {
    return normalizeVfsPath(path);
  } catch {
    return null;
  }
}

function titleFromPath(path: VfsPath): string {
  return path === "/" ? "/" : basename(path);
}

function extension(path: VfsPath): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function normalizedMimeType(mimeType: string | undefined): string | undefined {
  return mimeType?.split(";")[0]?.trim().toLowerCase() || undefined;
}

function isTextLike(ext: string, mimeType: string | undefined): boolean {
  return mimeType?.startsWith("text/") === true || TEXT_EXTENSIONS.has(ext);
}

function isMarkdown(ext: string, mimeType: string | undefined): boolean {
  return MARKDOWN_EXTENSIONS.has(ext) || mimeType === "text/markdown";
}

function markdownTitle(source: string): string | null {
  for (const line of source.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function plainText(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text: string, chars: number): string | undefined {
  if (text.length === 0 || chars <= 0) {
    return undefined;
  }

  return text.length > chars ? `${text.slice(0, Math.max(0, chars - 3)).trimEnd()}...` : text;
}

function keywordsFor(stat: VfsStat, ext: string, mimeType: string | undefined): readonly string[] {
  const keywords = [stat.kind === "directory" ? "folder directory" : "file"];
  if (ext.length > 0) {
    keywords.push(ext);
  }
  if (mimeType !== undefined) {
    keywords.push(mimeType, mimeType.split("/")[0] ?? "");
  }

  return keywords.filter((keyword) => keyword.length > 0);
}
