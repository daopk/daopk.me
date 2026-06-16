import type {
  VfsAdapter,
  VfsMkdirOptions,
  VfsRemoveOptions,
  VfsWalkOptions,
  VfsWriteOptions,
} from "~/core/vfs/adapter";
import { compareEntries } from "~/core/vfs/entrySort";
import { VfsError } from "~/core/vfs/errors";
import type { VfsDirEntry, VfsNodeKind, VfsReadResult, VfsStat } from "~/core/vfs/nodes";
import {
  basename,
  dirname,
  isDescendant,
  isDirectChild,
  normalizeVfsPath,
  withinDepth,
  type VfsPath,
} from "~/core/vfs/path";

interface RemoteHTTPIndexEntry {
  readonly key: string;
  readonly kind?: "file" | "directory";
  readonly url?: string;
  readonly size?: number;
  readonly uploaded?: string;
  readonly contentType?: string;
}

export interface RemoteHTTPIndexAdapterOptions {
  readonly id?: string;
  readonly indexUrl: string;
  readonly fetch?: typeof globalThis.fetch;
}

interface RemoteNode {
  readonly path: VfsPath;
  readonly kind: Exclude<VfsNodeKind, "symlink">;
  readonly size: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly url?: string;
  readonly mimeType?: string;
}

function statFromNode(node: RemoteNode, sizeOverride?: number, mimeTypeOverride?: string): VfsStat {
  const mimeType = mimeTypeOverride ?? node.mimeType;

  return {
    path: node.path,
    kind: node.kind,
    size: sizeOverride ?? node.size,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    readonly: true,
    ...(mimeType === undefined ? {} : { mimeType }),
  };
}

function entryFromNode(node: RemoteNode): VfsDirEntry {
  return {
    name: basename(node.path),
    path: node.path,
    kind: node.kind,
    size: node.size,
    updatedAt: node.updatedAt,
    readonly: true,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asSize(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function timestamp(value: unknown): number {
  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIndexEntry(candidate: unknown): RemoteHTTPIndexEntry | null {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const key = asString(record.key);
  if (key === null) {
    return null;
  }

  const kind = record.kind === "directory" || key.endsWith("/") ? "directory" : "file";

  return {
    key,
    kind,
    ...(asString(record.url) === null ? {} : { url: asString(record.url) as string }),
    size: asSize(record.size),
    ...(asString(record.uploaded) === null
      ? {}
      : { uploaded: asString(record.uploaded) as string }),
    ...(asString(record.contentType) === null
      ? {}
      : { contentType: asString(record.contentType) as string }),
  };
}

function keySegments(key: string, kind: "file" | "directory"): string[] | null {
  const normalizedKey = kind === "directory" ? key.replace(/\/+$/, "") : key;
  if (normalizedKey.length === 0 || hasControlChars(normalizedKey)) {
    return null;
  }

  const segments = normalizedKey.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }

  return segments;
}

function pathFromSegments(segments: readonly string[]): VfsPath {
  return normalizeVfsPath(`/${segments.join("/")}`);
}

function parentPaths(path: VfsPath): VfsPath[] {
  const paths: VfsPath[] = [];
  let current = dirname(path);

  while (current !== "/") {
    paths.push(current);
    current = dirname(current);
  }

  return paths.reverse();
}

export class RemoteHTTPIndexAdapter implements VfsAdapter {
  readonly id: string;

  readonly readonly = true;

  private readonly indexUrl: string;

  private readonly fetchImpl?: typeof globalThis.fetch;

  constructor(options: RemoteHTTPIndexAdapterOptions) {
    this.id = options.id ?? "remote-http-index";
    this.indexUrl = options.indexUrl;
    this.fetchImpl =
      options.fetch ??
      (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
  }

  async stat(path: VfsPath): Promise<VfsStat> {
    return statFromNode(this.requireNode(await this.loadNodes(), path));
  }

  async list(path: VfsPath): Promise<readonly VfsDirEntry[]> {
    const nodes = await this.loadNodes();
    const node = this.requireNode(nodes, path);
    if (node.kind !== "directory") {
      throw new VfsError("NOT_DIRECTORY", `Not a directory: ${path}`, { path });
    }

    return [...nodes.values()]
      .filter((candidate) => isDirectChild(path, candidate.path))
      .map(entryFromNode)
      .sort(compareEntries);
  }

  async walk(path: VfsPath, options?: VfsWalkOptions): Promise<readonly VfsDirEntry[]> {
    const nodes = await this.loadNodes();
    const node = this.requireNode(nodes, path);
    if (node.kind !== "directory") {
      throw new VfsError("NOT_DIRECTORY", `Not a directory: ${path}`, { path });
    }

    options?.signal?.throwIfAborted();
    if (options?.maxEntries !== undefined && options.maxEntries <= 0) {
      return [];
    }

    const entries = [...nodes.values()]
      .filter((candidate) => isDescendant(path, candidate.path))
      .filter((candidate) => withinDepth(path, candidate.path, options?.maxDepth))
      .map(entryFromNode)
      .sort(compareEntries);

    return options?.maxEntries === undefined ? entries : entries.slice(0, options.maxEntries);
  }

  async read(path: VfsPath): Promise<VfsReadResult> {
    const node = this.requireNode(await this.loadNodes(), path);
    if (node.kind === "directory") {
      throw new VfsError("IS_DIRECTORY", `Cannot read directory: ${path}`, { path });
    }
    if (node.url === undefined) {
      throw new VfsError("NOT_FOUND", `No URL for remote file: ${path}`, { path });
    }
    if (this.fetchImpl === undefined) {
      throw new VfsError("ADAPTER_UNAVAILABLE", "fetch unavailable for remote VFS adapter", {
        path,
      });
    }

    const response = await this.fetchImpl(node.url);
    if (!response.ok) {
      throw new VfsError(
        response.status === 404 ? "NOT_FOUND" : "ADAPTER_UNAVAILABLE",
        `Remote file fetch failed: ${node.url}`,
        { path },
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") ?? node.mimeType;

    return {
      path,
      bytes,
      stat: statFromNode(node, bytes.byteLength, mimeType),
    };
  }

  async write(_path: VfsPath, _bytes: Uint8Array, _options?: VfsWriteOptions): Promise<VfsStat> {
    throw new VfsError("READ_ONLY", "RemoteHTTPIndexAdapter is read-only", { path: _path });
  }

  async mkdir(_path: VfsPath, _options?: VfsMkdirOptions): Promise<VfsStat> {
    throw new VfsError("READ_ONLY", "RemoteHTTPIndexAdapter is read-only", { path: _path });
  }

  async remove(_path: VfsPath, _options?: VfsRemoveOptions): Promise<void> {
    throw new VfsError("READ_ONLY", "RemoteHTTPIndexAdapter is read-only", { path: _path });
  }

  private async loadNodes(): Promise<Map<VfsPath, RemoteNode>> {
    if (this.fetchImpl === undefined) {
      throw new VfsError("ADAPTER_UNAVAILABLE", "fetch unavailable for remote VFS adapter");
    }

    const response = await this.fetchImpl(this.indexUrl, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new VfsError("ADAPTER_UNAVAILABLE", `Remote index fetch failed: ${this.indexUrl}`);
    }

    const payload: unknown = await response.json();
    const entries = Array.isArray(payload)
      ? payload.map(toIndexEntry).filter((entry): entry is RemoteHTTPIndexEntry => entry !== null)
      : [];

    return this.nodesFromEntries(entries);
  }

  private nodesFromEntries(entries: readonly RemoteHTTPIndexEntry[]): Map<VfsPath, RemoteNode> {
    const nodes = new Map<VfsPath, RemoteNode>();
    const directoryTimes = new Map<VfsPath, number>();
    const fileEntries: Array<{
      readonly entry: RemoteHTTPIndexEntry;
      readonly path: VfsPath;
      readonly updatedAt: number;
    }> = [];

    directoryTimes.set(normalizeVfsPath("/"), 0);

    for (const entry of entries) {
      const kind = entry.kind ?? (entry.key.endsWith("/") ? "directory" : "file");
      const segments = keySegments(entry.key, kind);
      if (segments === null) {
        continue;
      }

      const path = pathFromSegments(segments);
      const updatedAt = timestamp(entry.uploaded);
      for (const parentPath of parentPaths(path)) {
        directoryTimes.set(parentPath, Math.max(directoryTimes.get(parentPath) ?? 0, updatedAt));
      }

      if (kind === "directory") {
        directoryTimes.set(path, Math.max(directoryTimes.get(path) ?? 0, updatedAt));
        continue;
      }

      fileEntries.push({ entry, path, updatedAt });
    }

    for (const [path, updatedAt] of [...directoryTimes.entries()].sort(
      ([a], [b]) => a.length - b.length,
    )) {
      nodes.set(path, {
        path,
        kind: "directory",
        size: 0,
        createdAt: updatedAt,
        updatedAt,
      });
    }

    for (const { entry, path, updatedAt } of fileEntries) {
      if (nodes.has(path)) {
        continue;
      }

      nodes.set(path, {
        path,
        kind: "file",
        size: entry.size ?? 0,
        createdAt: updatedAt,
        updatedAt,
        ...(entry.url === undefined ? {} : { url: entry.url }),
        ...(entry.contentType === undefined ? {} : { mimeType: entry.contentType }),
      });
    }

    return nodes;
  }

  private requireNode(nodes: ReadonlyMap<VfsPath, RemoteNode>, path: VfsPath): RemoteNode {
    const node = nodes.get(path);
    if (node === undefined) {
      throw new VfsError("NOT_FOUND", `Path not found: ${path}`, { path });
    }

    return node;
  }
}
