import {
  basename,
  normalizeVfsPath,
  VfsError,
  type VfsDirEntry,
  type VfsPath,
  type VfsStat,
} from "@daopk/sdk";

import {
  SLIDES_ROOT,
  deckDirectoryFromSlug,
  deckPathFromSlug,
  normalizeSlideDeckSlug,
  parseSlideDeckPath,
} from "./paths";

export const SLIDE_DECK_MIME_TYPE = "text/markdown;charset=utf-8";

export type SlidesLibraryErrorCode =
  | "INVALID_DECK"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "READ_ONLY"
  | "WRITE_FAILED";

export interface SlidesDeck {
  readonly slug: string;
  readonly title: string;
  readonly directoryPath: VfsPath;
  readonly filePath: VfsPath;
  readonly updatedAt: number;
  readonly size: number;
}

export interface SlidesLibraryVfsClient {
  stat(path: string): Promise<VfsStat | null>;
  list(path: string): Promise<readonly VfsDirEntry[] | null>;
  readText(path: string): Promise<string | null>;
  writeText(
    path: string,
    text: string,
    options?: { overwrite?: boolean; mimeType?: string },
  ): Promise<VfsStat | null>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<VfsStat | null>;
}

export interface SlidesLibraryBindings {
  ensureRoot(): Promise<void>;
  listDecks(): Promise<readonly SlidesDeck[]>;
  createDeck(title: string): Promise<SlidesDeck>;
  openDeck(target: string): Promise<{ readonly deck: SlidesDeck; readonly source: string }>;
  saveDeck(target: string, source: string): Promise<SlidesDeck>;
}

export class SlidesLibraryError extends Error {
  readonly code: SlidesLibraryErrorCode;
  readonly path?: string;

  constructor(code: SlidesLibraryErrorCode, message: string, options?: { path?: string }) {
    super(message);
    this.name = "SlidesLibraryError";
    this.code = code;
    this.path = options?.path;
  }
}

export function useSlidesLibrary({
  vfs,
}: {
  readonly vfs: SlidesLibraryVfsClient;
}): SlidesLibraryBindings {
  async function ensureRoot(): Promise<void> {
    try {
      const root = await vfs.stat(SLIDES_ROOT);
      if (root === null) {
        throw permissionDenied(SLIDES_ROOT);
      }
      if (root.kind !== "directory") {
        throw new SlidesLibraryError("INVALID_DECK", "Slides root is not a folder.", {
          path: SLIDES_ROOT,
        });
      }
    } catch (error) {
      if (!isVfsNotFound(error)) {
        throw mapError(error, SLIDES_ROOT);
      }

      const created = await vfs.mkdir(SLIDES_ROOT, { recursive: true });
      if (created === null) {
        throw permissionDenied(SLIDES_ROOT);
      }
    }
  }

  async function listDecks(): Promise<readonly SlidesDeck[]> {
    await ensureRoot();
    const entries = await vfs.list(SLIDES_ROOT);
    if (entries === null) {
      throw permissionDenied(SLIDES_ROOT);
    }

    const decks: SlidesDeck[] = [];
    for (const entry of entries) {
      if (entry.kind !== "directory") {
        continue;
      }

      let deck: SlidesDeck | null = null;
      try {
        deck = await deckFromSlug(entry.name);
      } catch (error) {
        if (!isNotFoundLike(error)) {
          throw error;
        }
      }
      if (deck !== null) {
        decks.push(deck);
      }
    }

    return decks.sort((a, b) => a.title.localeCompare(b.title));
  }

  async function createDeck(title: string): Promise<SlidesDeck> {
    await ensureRoot();
    const slug = await nextAvailableSlug(title);
    const directoryPath = deckDirectoryFromSlug(slug);
    const filePath = deckPathFromSlug(slug);

    const dirStat = await vfs.mkdir(directoryPath, { recursive: false });
    if (dirStat === null) {
      throw permissionDenied(directoryPath);
    }

    const fileStat = await vfs.writeText(filePath, starterDeckSource(title), {
      overwrite: false,
      mimeType: SLIDE_DECK_MIME_TYPE,
    });
    if (fileStat === null) {
      throw permissionDenied(filePath);
    }

    return deckFromStat(slug, directoryPath, fileStat, title);
  }

  async function openDeck(
    target: string,
  ): Promise<{ readonly deck: SlidesDeck; readonly source: string }> {
    const resolved = resolveDeckTarget(target);
    const stat = await requireDeckFile(resolved.filePath);
    const source = await vfs.readText(resolved.filePath);
    if (source === null) {
      throw permissionDenied(resolved.filePath);
    }

    return {
      deck: deckFromStat(
        resolved.slug,
        resolved.directoryPath,
        stat,
        extractSlideDeckTitle(source, resolved.slug),
      ),
      source,
    };
  }

  async function saveDeck(target: string, source: string): Promise<SlidesDeck> {
    const resolved = resolveDeckTarget(target);
    const existing = await requireDeckFile(resolved.filePath);
    if (existing.readonly) {
      throw new SlidesLibraryError("READ_ONLY", "This slide deck is read-only.", {
        path: resolved.filePath,
      });
    }

    const stat = await vfs.writeText(resolved.filePath, source, {
      overwrite: true,
      mimeType: existing.mimeType ?? SLIDE_DECK_MIME_TYPE,
    });
    if (stat === null) {
      throw permissionDenied(resolved.filePath);
    }

    return deckFromStat(
      resolved.slug,
      resolved.directoryPath,
      stat,
      extractSlideDeckTitle(source, resolved.slug),
    );
  }

  async function nextAvailableSlug(title: string): Promise<string> {
    const baseSlug = normalizeSlideDeckSlug(title || "untitled");
    let slug = baseSlug;
    let suffix = 2;

    while (await deckExists(slug)) {
      slug = normalizeSlideDeckSlug(`${baseSlug}-${suffix}`);
      suffix += 1;
    }

    return slug;
  }

  async function deckExists(slug: string): Promise<boolean> {
    try {
      const stat = await vfs.stat(deckPathFromSlug(slug));
      return stat !== null;
    } catch (error) {
      if (isVfsNotFound(error)) {
        return false;
      }

      throw mapError(error, deckPathFromSlug(slug));
    }
  }

  async function deckFromSlug(slug: string): Promise<SlidesDeck> {
    const filePath = deckPathFromSlug(slug);
    const stat = await requireDeckFile(filePath);
    const source = await vfs.readText(filePath);
    if (source === null) {
      throw permissionDenied(filePath);
    }

    return deckFromStat(
      slug,
      deckDirectoryFromSlug(slug),
      stat,
      extractSlideDeckTitle(source, slug),
    );
  }

  async function requireDeckFile(filePath: VfsPath): Promise<VfsStat> {
    let stat: VfsStat | null;
    try {
      stat = await vfs.stat(filePath);
    } catch (error) {
      throw mapError(error, filePath);
    }

    if (stat === null) {
      throw permissionDenied(filePath);
    }
    if (stat.kind !== "file") {
      throw new SlidesLibraryError("INVALID_DECK", "Slide deck path is not a file.", {
        path: filePath,
      });
    }

    return stat;
  }

  return {
    ensureRoot,
    listDecks,
    createDeck,
    openDeck,
    saveDeck,
  };
}

export function resolveDeckTarget(target: string): {
  readonly slug: string;
  readonly directoryPath: VfsPath;
  readonly filePath: VfsPath;
} {
  const parsed = parseSlideDeckPath(target);
  if (parsed !== null) {
    return parsed;
  }

  const slug = normalizeSlideDeckSlug(target);
  return {
    slug,
    directoryPath: deckDirectoryFromSlug(slug),
    filePath: deckPathFromSlug(slug),
  };
}

export function starterDeckSource(title: string): string {
  const deckTitle = title.trim() || "Untitled Slides";
  return `---
theme: default
title: ${quoteFrontmatterString(deckTitle)}
---

# ${deckTitle}

Start writing your Slidev deck.

---

## Next Slide

- Edit Markdown
- Save to VFS
- Preview with Slidev
`;
}

export function extractSlideDeckTitle(source: string, fallback: string): string {
  const frontmatterTitle = source.match(/^---\n[\s\S]*?\ntitle:\s*(.+?)\n[\s\S]*?\n---/);
  if (frontmatterTitle?.[1] !== undefined) {
    return cleanTitle(frontmatterTitle[1], fallback);
  }

  const heading = source.match(/^#\s+(.+)$/m);
  if (heading?.[1] !== undefined) {
    return cleanTitle(heading[1], fallback);
  }

  return titleFromSlug(fallback);
}

function deckFromStat(
  slug: string,
  directoryPath: VfsPath,
  stat: VfsStat,
  title: string,
): SlidesDeck {
  return {
    slug,
    title,
    directoryPath,
    filePath: normalizeVfsPath(stat.path),
    updatedAt: stat.updatedAt,
    size: stat.size,
  };
}

function quoteFrontmatterString(value: string): string {
  return JSON.stringify(value);
}

function cleanTitle(title: string, fallback: string): string {
  const cleaned = title.trim().replace(/^["']|["']$/g, "");
  return cleaned.length > 0 ? cleaned : titleFromSlug(fallback);
}

function titleFromSlug(slug: string): string {
  return basename(normalizeVfsPath(`/${slug}`))
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function permissionDenied(path: string): SlidesLibraryError {
  return new SlidesLibraryError("PERMISSION_DENIED", "Slides does not have access to this path.", {
    path,
  });
}

function mapError(error: unknown, path: string): Error {
  if (error instanceof SlidesLibraryError) {
    return error;
  }

  if (error instanceof VfsError) {
    switch (error.code) {
      case "NOT_FOUND":
        return new SlidesLibraryError("NOT_FOUND", "Slide deck was not found.", { path });
      case "READ_ONLY":
        return new SlidesLibraryError("READ_ONLY", "This slide deck is read-only.", { path });
      case "PERMISSION_DENIED":
        return permissionDenied(path);
      default:
        return new SlidesLibraryError("WRITE_FAILED", error.message, { path });
    }
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isNotFoundLike(error: unknown): boolean {
  return (
    (error instanceof VfsError && error.code === "NOT_FOUND") ||
    (error instanceof SlidesLibraryError && error.code === "NOT_FOUND")
  );
}

function isVfsNotFound(error: unknown): boolean {
  return error instanceof VfsError && error.code === "NOT_FOUND";
}
