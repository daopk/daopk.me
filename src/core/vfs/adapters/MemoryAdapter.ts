import type {
  VfsAdapter,
  VfsMkdirOptions,
  VfsRemoveOptions,
  VfsWalkOptions,
  VfsWriteOptions,
} from "~/core/vfs/adapter";
import { VfsError } from "~/core/vfs/errors";
import type { VfsDirEntry, VfsNodeKind, VfsReadResult, VfsStat } from "~/core/vfs/nodes";
import {
  basename,
  compareVfsNames,
  dirname,
  isDirectChild,
  normalizeVfsPath,
  type VfsPath,
} from "~/core/vfs/path";

interface MemoryFileSeed {
  readonly bytes?: Uint8Array;
  readonly text?: string;
  readonly mimeType?: string;
  readonly now?: number;
}

export interface MemoryAdapterSeed {
  readonly directories?: readonly string[];
  readonly files?: Readonly<Record<string, MemoryFileSeed | string | Uint8Array>>;
}

export interface MemoryAdapterOptions {
  readonly id?: string;
  readonly seed?: MemoryAdapterSeed;
  readonly now?: number;
}

interface MemoryNode {
  readonly path: VfsPath;
  readonly kind: Exclude<VfsNodeKind, "symlink">;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly bytes?: Uint8Array;
  readonly mimeType?: string;
}

const KIND_RANK: Record<VfsNodeKind, number> = {
  directory: 0,
  file: 1,
  symlink: 2,
};

const TEXT_ENCODER = new TextEncoder();

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function seedBytes(seed: MemoryFileSeed | string | Uint8Array): {
  bytes: Uint8Array;
  mimeType?: string;
  now?: number;
} {
  if (typeof seed === "string") {
    return { bytes: TEXT_ENCODER.encode(seed) };
  }

  if (seed instanceof Uint8Array) {
    return { bytes: copyBytes(seed) };
  }

  const bytes =
    seed.bytes ?? (seed.text === undefined ? new Uint8Array() : TEXT_ENCODER.encode(seed.text));
  return {
    bytes: copyBytes(bytes),
    ...(seed.mimeType === undefined ? {} : { mimeType: seed.mimeType }),
    ...(seed.now === undefined ? {} : { now: seed.now }),
  };
}

function statFromNode(node: MemoryNode): VfsStat {
  return {
    path: node.path,
    kind: node.kind,
    size: node.kind === "file" ? (node.bytes?.byteLength ?? 0) : 0,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    readonly: false,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function entryFromNode(node: MemoryNode): VfsDirEntry {
  return {
    name: basename(node.path),
    path: node.path,
    kind: node.kind,
    size: node.kind === "file" ? (node.bytes?.byteLength ?? 0) : 0,
    updatedAt: node.updatedAt,
    readonly: false,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

export class MemoryAdapter implements VfsAdapter {
  readonly id: string;

  readonly readonly = false;

  private readonly nodes = new Map<VfsPath, MemoryNode>();

  constructor(options?: MemoryAdapterOptions) {
    this.id = options?.id ?? "memory";
    const now = options?.now ?? 0;
    const rootPath = normalizeVfsPath("/");
    this.nodes.set(rootPath, {
      path: rootPath,
      kind: "directory",
      createdAt: now,
      updatedAt: now,
    });

    for (const dir of options?.seed?.directories ?? []) {
      this.mkdirSync(normalizeVfsPath(dir), options?.now ?? now);
    }

    for (const [path, seed] of Object.entries(options?.seed?.files ?? {})) {
      const normalized = normalizeVfsPath(path);
      const seeded = seedBytes(seed);
      this.mkdirSync(dirname(normalized), seeded.now ?? options?.now ?? now);
      this.nodes.set(normalized, {
        path: normalized,
        kind: "file",
        bytes: seeded.bytes,
        createdAt: seeded.now ?? options?.now ?? now,
        updatedAt: seeded.now ?? options?.now ?? now,
        ...(seeded.mimeType === undefined ? {} : { mimeType: seeded.mimeType }),
      });
    }
  }

  async stat(path: VfsPath): Promise<VfsStat> {
    const node = this.requireNode(path);
    return statFromNode(node);
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

  async walk(path: VfsPath, options?: VfsWalkOptions): Promise<readonly VfsDirEntry[]> {
    const node = this.requireNode(path);
    if (node.kind !== "directory") {
      throw new VfsError("NOT_DIRECTORY", `Not a directory: ${path}`, { path });
    }

    options?.signal?.throwIfAborted();
    if (options?.maxEntries !== undefined && options.maxEntries <= 0) {
      return [];
    }

    const entries = [...this.nodes.values()]
      .filter((candidate) => isDescendant(path, candidate.path))
      .filter((candidate) => withinDepth(path, candidate.path, options?.maxDepth))
      .map(entryFromNode)
      .sort(compareEntries);

    return options?.maxEntries === undefined ? entries : entries.slice(0, options.maxEntries);
  }

  async read(path: VfsPath): Promise<VfsReadResult> {
    const node = this.requireNode(path);
    if (node.kind === "directory") {
      throw new VfsError("IS_DIRECTORY", `Cannot read directory: ${path}`, { path });
    }

    return {
      path,
      bytes: copyBytes(node.bytes ?? new Uint8Array()),
      stat: statFromNode(node),
    };
  }

  async write(path: VfsPath, bytes: Uint8Array, options?: VfsWriteOptions): Promise<VfsStat> {
    const existing = this.nodes.get(path);
    if (existing?.kind === "directory") {
      throw new VfsError("IS_DIRECTORY", `Cannot write directory: ${path}`, { path });
    }
    if (existing !== undefined && options?.overwrite === false) {
      throw new VfsError("ALREADY_EXISTS", `Path already exists: ${path}`, { path });
    }

    const parent = this.nodes.get(dirname(path));
    if (parent === undefined) {
      throw new VfsError("NOT_FOUND", `Parent directory does not exist: ${dirname(path)}`, {
        path,
      });
    }
    if (parent.kind !== "directory") {
      throw new VfsError("NOT_DIRECTORY", `Parent is not a directory: ${dirname(path)}`, { path });
    }

    const now = options?.now ?? Date.now();
    const next: MemoryNode = {
      path,
      kind: "file",
      bytes: copyBytes(bytes),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(options?.mimeType === undefined
        ? existing?.mimeType === undefined
          ? {}
          : { mimeType: existing.mimeType }
        : { mimeType: options.mimeType }),
    };
    this.nodes.set(path, next);

    return statFromNode(next);
  }

  async mkdir(path: VfsPath, options?: VfsMkdirOptions): Promise<VfsStat> {
    const existing = this.nodes.get(path);
    if (existing !== undefined) {
      if (existing.kind !== "directory") {
        throw new VfsError("ALREADY_EXISTS", `Path already exists: ${path}`, { path });
      }

      return statFromNode(existing);
    }

    if (options?.recursive === true) {
      this.mkdirSync(path, options.now ?? Date.now());
      return statFromNode(this.requireNode(path));
    }

    const parentPath = dirname(path);
    const parent = this.nodes.get(parentPath);
    if (parent === undefined) {
      throw new VfsError("NOT_FOUND", `Parent directory does not exist: ${parentPath}`, { path });
    }
    if (parent.kind !== "directory") {
      throw new VfsError("NOT_DIRECTORY", `Parent is not a directory: ${parentPath}`, { path });
    }

    const now = options?.now ?? Date.now();
    const node: MemoryNode = {
      path,
      kind: "directory",
      createdAt: now,
      updatedAt: now,
    };
    this.nodes.set(path, node);

    return statFromNode(node);
  }

  async remove(path: VfsPath, options?: VfsRemoveOptions): Promise<void> {
    if (path === "/") {
      throw new VfsError("CONFLICT", "Cannot remove adapter root", { path });
    }

    const node = this.requireNode(path);
    const descendants = [...this.nodes.keys()].filter((candidate) =>
      candidate.startsWith(`${path}/`),
    );

    if (node.kind === "directory" && descendants.length > 0 && options?.recursive !== true) {
      throw new VfsError("CONFLICT", `Directory is not empty: ${path}`, { path });
    }

    for (const descendant of descendants) {
      this.nodes.delete(descendant);
    }
    this.nodes.delete(path);
  }

  private requireNode(path: VfsPath): MemoryNode {
    const node = this.nodes.get(path);
    if (node === undefined) {
      throw new VfsError("NOT_FOUND", `Path not found: ${path}`, { path });
    }

    return node;
  }

  private mkdirSync(path: VfsPath, now: number): void {
    if (this.nodes.has(path)) {
      const node = this.nodes.get(path);
      if (node?.kind !== "directory") {
        throw new VfsError("ALREADY_EXISTS", `Path already exists: ${path}`, { path });
      }
      return;
    }

    const parentPath = dirname(path);
    if (parentPath !== path) {
      const parent = this.nodes.get(parentPath);
      if (parent === undefined) {
        this.mkdirSync(parentPath, now);
      } else if (parent.kind !== "directory") {
        throw new VfsError("NOT_DIRECTORY", `Parent is not a directory: ${parentPath}`, { path });
      }
    }

    this.nodes.set(path, {
      path,
      kind: "directory",
      createdAt: now,
      updatedAt: now,
    });
  }
}

function compareEntries(a: VfsDirEntry, b: VfsDirEntry): number {
  const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (rank !== 0) {
    return rank;
  }

  return compareVfsNames(a.name, b.name);
}

function isDescendant(parent: VfsPath, candidate: VfsPath): boolean {
  if (parent === candidate) {
    return false;
  }

  const prefix = parent === "/" ? "/" : `${parent}/`;
  return candidate.startsWith(prefix);
}

function withinDepth(parent: VfsPath, candidate: VfsPath, maxDepth?: number): boolean {
  if (maxDepth === undefined) {
    return true;
  }

  return depthBetween(parent, candidate) <= maxDepth;
}

function depthBetween(parent: VfsPath, candidate: VfsPath): number {
  const prefix = parent === "/" ? "/" : `${parent}/`;
  const rest = candidate.slice(prefix.length);
  return rest.split("/").filter(Boolean).length;
}
