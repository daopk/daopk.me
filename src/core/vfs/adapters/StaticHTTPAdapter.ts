import type {
  VfsAdapter,
  VfsMkdirOptions,
  VfsRemoveOptions,
  VfsWriteOptions,
} from "~/core/vfs/adapter";
import { compareEntries } from "~/core/vfs/entrySort";
import { VfsError } from "~/core/vfs/errors";
import type { VfsDirEntry, VfsNodeKind, VfsReadResult, VfsStat } from "~/core/vfs/nodes";
import { basename, dirname, isDirectChild, normalizeVfsPath, type VfsPath } from "~/core/vfs/path";

export interface StaticHttpEntry {
  readonly path: string;
  readonly url: string;
  readonly size?: number;
  readonly mimeType?: string;
  readonly etag?: string;
}

export interface StaticHTTPAdapterOptions {
  readonly id?: string;
  readonly entries: readonly StaticHttpEntry[];
  readonly baseTimestamp?: number;
}

interface StaticNode {
  readonly path: VfsPath;
  readonly kind: Exclude<VfsNodeKind, "symlink">;
  readonly size: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly url?: string;
  readonly mimeType?: string;
  readonly etag?: string;
}

function statFromNode(node: StaticNode, sizeOverride?: number, mimeTypeOverride?: string): VfsStat {
  const mimeType = mimeTypeOverride ?? node.mimeType;

  return {
    path: node.path,
    kind: node.kind,
    size: sizeOverride ?? node.size,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    readonly: true,
    ...(node.etag === undefined ? {} : { etag: node.etag }),
    ...(mimeType === undefined ? {} : { mimeType }),
  };
}

function entryFromNode(node: StaticNode): VfsDirEntry {
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

export class StaticHTTPAdapter implements VfsAdapter {
  readonly id: string;

  readonly readonly = true;

  private readonly nodes = new Map<VfsPath, StaticNode>();

  constructor(options: StaticHTTPAdapterOptions) {
    this.id = options.id ?? "static-http";
    const baseTimestamp = options.baseTimestamp ?? 0;
    const rootPath = normalizeVfsPath("/");

    this.nodes.set(rootPath, {
      path: rootPath,
      kind: "directory",
      size: 0,
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
    });

    for (const entry of options.entries) {
      const path = normalizeVfsPath(entry.path);
      this.ensureDirectories(dirname(path), baseTimestamp);
      this.nodes.set(path, {
        path,
        kind: "file",
        size: entry.size ?? 0,
        createdAt: baseTimestamp,
        updatedAt: baseTimestamp,
        url: entry.url,
        ...(entry.mimeType === undefined ? {} : { mimeType: entry.mimeType }),
        ...(entry.etag === undefined ? {} : { etag: entry.etag }),
      });
    }
  }

  async stat(path: VfsPath): Promise<VfsStat> {
    return statFromNode(this.requireNode(path));
  }

  async list(path: VfsPath): Promise<readonly VfsDirEntry[]> {
    const node = this.requireNode(path);
    if (node.kind !== "directory") {
      throw new VfsError("NOT_DIRECTORY", `Not a directory: ${path}`, { path });
    }

    return [...this.nodes.values()]
      .filter((candidate) => isDirectChild(path, candidate.path))
      .map(entryFromNode)
      .sort(compareEntries);
  }

  async read(path: VfsPath): Promise<VfsReadResult> {
    const node = this.requireNode(path);
    if (node.kind === "directory") {
      throw new VfsError("IS_DIRECTORY", `Cannot read directory: ${path}`, { path });
    }
    if (node.url === undefined) {
      throw new VfsError("NOT_FOUND", `No URL for static file: ${path}`, { path });
    }
    if (typeof globalThis.fetch !== "function") {
      throw new VfsError("ADAPTER_UNAVAILABLE", "fetch unavailable for StaticHTTPAdapter", {
        path,
      });
    }

    const response = await globalThis.fetch(node.url);
    if (!response.ok) {
      throw new VfsError(
        response.status === 404 ? "NOT_FOUND" : "ADAPTER_UNAVAILABLE",
        `Static file fetch failed: ${node.url}`,
        { path },
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") ?? node.mimeType;
    const stat = statFromNode(node, bytes.byteLength, mimeType);

    return {
      path,
      bytes,
      stat,
    };
  }

  async write(_path: VfsPath, _bytes: Uint8Array, _options?: VfsWriteOptions): Promise<VfsStat> {
    throw new VfsError("READ_ONLY", "StaticHTTPAdapter is read-only", { path: _path });
  }

  async mkdir(_path: VfsPath, _options?: VfsMkdirOptions): Promise<VfsStat> {
    throw new VfsError("READ_ONLY", "StaticHTTPAdapter is read-only", { path: _path });
  }

  async remove(_path: VfsPath, _options?: VfsRemoveOptions): Promise<void> {
    throw new VfsError("READ_ONLY", "StaticHTTPAdapter is read-only", { path: _path });
  }

  private requireNode(path: VfsPath): StaticNode {
    const node = this.nodes.get(path);
    if (node === undefined) {
      throw new VfsError("NOT_FOUND", `Path not found: ${path}`, { path });
    }

    return node;
  }

  private ensureDirectories(path: VfsPath, timestamp: number): void {
    if (this.nodes.has(path)) {
      return;
    }

    const parent = dirname(path);
    if (parent !== path) {
      this.ensureDirectories(parent, timestamp);
    }

    this.nodes.set(path, {
      path,
      kind: "directory",
      size: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}
