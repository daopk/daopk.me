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
import { randomBytes } from "~/core/profile/encoding";
import { IndexedDBStore } from "~/core/storage/IndexedDBStore";
import { VFS_IDB_DB_NAME, VFS_IDB_STORE_NAME, VFS_IDB_VERSION } from "~/core/storage/constants";
import { StorageError } from "~/core/storage/types";

interface PersistedVfsNode {
  readonly path: string;
  readonly kind: Exclude<VfsNodeKind, "symlink">;
  readonly bytes?: ArrayBuffer;
  readonly size: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly mimeType?: string;
  readonly encryption?: {
    readonly name: "aes-gcm-v1";
    readonly iv: ArrayBuffer;
  };
}

export interface IDBAdapterOptions {
  readonly id?: string;
  readonly dbName?: string;
  readonly storeName?: string;
  readonly version?: number;
  readonly baseTimestamp?: number;
  readonly encryptionKey?: CryptoKey;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function copyArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0);
}

function bytesFromBuffer(buffer?: ArrayBuffer): Uint8Array {
  if (buffer === undefined) {
    return new Uint8Array();
  }

  return copyBytes(new Uint8Array(buffer));
}

function statFromNode(node: PersistedVfsNode): VfsStat {
  return {
    path: normalizeVfsPath(node.path),
    kind: node.kind,
    size: node.size,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    readonly: false,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function entryFromNode(node: PersistedVfsNode): VfsDirEntry {
  return {
    name: basename(normalizeVfsPath(node.path)),
    path: normalizeVfsPath(node.path),
    kind: node.kind,
    size: node.size,
    updatedAt: node.updatedAt,
    readonly: false,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function toVfsError(error: unknown, fallbackCode: "ADAPTER_UNAVAILABLE" | "NOT_FOUND"): VfsError {
  if (error instanceof VfsError) {
    return error;
  }

  if (error instanceof StorageError) {
    return new VfsError("ADAPTER_UNAVAILABLE", error.message, { cause: error });
  }

  return new VfsError(fallbackCode, "IndexedDB VFS adapter failed", {
    cause: error instanceof Error ? error : undefined,
  });
}

export class IDBAdapter implements VfsAdapter {
  readonly id: string;

  readonly readonly = false;

  private readonly store: IndexedDBStore<PersistedVfsNode>;

  private readonly baseTimestamp: number;

  private readonly encryptionKey?: CryptoKey;

  private rootLatch: Promise<void> | undefined;

  constructor(options?: IDBAdapterOptions) {
    this.id = options?.id ?? "idb";
    this.store = new IndexedDBStore<PersistedVfsNode>(
      options?.dbName ?? VFS_IDB_DB_NAME,
      options?.storeName ?? VFS_IDB_STORE_NAME,
      options?.version ?? VFS_IDB_VERSION,
    );
    this.baseTimestamp = options?.baseTimestamp ?? 0;
    this.encryptionKey = options?.encryptionKey;
  }

  async stat(path: VfsPath): Promise<VfsStat> {
    try {
      const node = await this.requireNode(path);
      return statFromNode(node);
    } catch (error: unknown) {
      throw toVfsError(error, "NOT_FOUND");
    }
  }

  async list(path: VfsPath): Promise<readonly VfsDirEntry[]> {
    try {
      const node = await this.requireNode(path);
      if (node.kind !== "directory") {
        throw new VfsError("NOT_DIRECTORY", `Not a directory: ${path}`, { path });
      }

      const keys = await this.store.keys();
      const nodes = await Promise.all(
        keys.map(async (key) => {
          const childPath = normalizeVfsPath(key);
          if (!isDirectChild(path, childPath)) {
            return null;
          }

          return await this.store.get(key);
        }),
      );

      return nodes
        .filter((candidate): candidate is PersistedVfsNode => candidate !== null)
        .map(entryFromNode)
        .sort(compareEntries);
    } catch (error: unknown) {
      throw toVfsError(error, "NOT_FOUND");
    }
  }

  async walk(path: VfsPath, options?: VfsWalkOptions): Promise<readonly VfsDirEntry[]> {
    try {
      const node = await this.requireNode(path);
      if (node.kind !== "directory") {
        throw new VfsError("NOT_DIRECTORY", `Not a directory: ${path}`, { path });
      }

      options?.signal?.throwIfAborted();
      if (options?.maxEntries !== undefined && options.maxEntries <= 0) {
        return [];
      }

      const nodes = await this.store.values(makeDescendantRange(path), {
        limit: options?.maxEntries,
      });
      const entries = nodes
        .filter((candidate) => isDescendant(path, normalizeVfsPath(candidate.path)))
        .filter((candidate) =>
          withinDepth(path, normalizeVfsPath(candidate.path), options?.maxDepth),
        )
        .map(entryFromNode)
        .sort(compareEntries);

      return options?.maxEntries === undefined ? entries : entries.slice(0, options.maxEntries);
    } catch (error: unknown) {
      throw toVfsError(error, "NOT_FOUND");
    }
  }

  async read(path: VfsPath): Promise<VfsReadResult> {
    try {
      const node = await this.requireNode(path);
      if (node.kind === "directory") {
        throw new VfsError("IS_DIRECTORY", `Cannot read directory: ${path}`, { path });
      }

      return {
        path,
        bytes: await this.decodeNodeBytes(node),
        stat: statFromNode(node),
      };
    } catch (error: unknown) {
      throw toVfsError(error, "NOT_FOUND");
    }
  }

  async write(path: VfsPath, bytes: Uint8Array, options?: VfsWriteOptions): Promise<VfsStat> {
    try {
      await this.ensureRoot();

      const existing = await this.store.get(path);
      if (existing?.kind === "directory") {
        throw new VfsError("IS_DIRECTORY", `Cannot write directory: ${path}`, { path });
      }
      if (existing !== null && options?.overwrite === false) {
        throw new VfsError("ALREADY_EXISTS", `Path already exists: ${path}`, { path });
      }

      const parent = await this.store.get(dirname(path));
      if (parent === null) {
        throw new VfsError("NOT_FOUND", `Parent directory does not exist: ${dirname(path)}`, {
          path,
        });
      }
      if (parent.kind !== "directory") {
        throw new VfsError("NOT_DIRECTORY", `Parent is not a directory: ${dirname(path)}`, {
          path,
        });
      }

      const now = options?.now ?? Date.now();
      const encoded = await this.encodeBytes(bytes);
      const node: PersistedVfsNode = {
        path,
        kind: "file",
        bytes: encoded.bytes,
        size: bytes.byteLength,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(encoded.encryption === undefined ? {} : { encryption: encoded.encryption }),
        ...(options?.mimeType === undefined
          ? existing?.mimeType === undefined
            ? {}
            : { mimeType: existing.mimeType }
          : { mimeType: options.mimeType }),
      };
      await this.store.set(path, node);
      return statFromNode(node);
    } catch (error: unknown) {
      throw toVfsError(error, "ADAPTER_UNAVAILABLE");
    }
  }

  async mkdir(path: VfsPath, options?: VfsMkdirOptions): Promise<VfsStat> {
    try {
      await this.ensureRoot();

      const existing = await this.store.get(path);
      if (existing !== null) {
        if (existing.kind !== "directory") {
          throw new VfsError("ALREADY_EXISTS", `Path already exists: ${path}`, { path });
        }

        return statFromNode(existing);
      }

      if (options?.recursive === true) {
        await this.mkdirRecursive(path, options.now ?? Date.now());
        return statFromNode(await this.requireNode(path));
      }

      const parentPath = dirname(path);
      const parent = await this.store.get(parentPath);
      if (parent === null) {
        throw new VfsError("NOT_FOUND", `Parent directory does not exist: ${parentPath}`, { path });
      }
      if (parent.kind !== "directory") {
        throw new VfsError("NOT_DIRECTORY", `Parent is not a directory: ${parentPath}`, { path });
      }

      const now = options?.now ?? Date.now();
      const node: PersistedVfsNode = {
        path,
        kind: "directory",
        size: 0,
        createdAt: now,
        updatedAt: now,
      };
      await this.store.set(path, node);
      return statFromNode(node);
    } catch (error: unknown) {
      throw toVfsError(error, "ADAPTER_UNAVAILABLE");
    }
  }

  async remove(path: VfsPath, options?: VfsRemoveOptions): Promise<void> {
    try {
      if (path === "/") {
        throw new VfsError("CONFLICT", "Cannot remove adapter root", { path });
      }

      const node = await this.requireNode(path);
      const descendants = (await this.store.keys()).filter((key) => key.startsWith(`${path}/`));
      if (node.kind === "directory" && descendants.length > 0 && options?.recursive !== true) {
        throw new VfsError("CONFLICT", `Directory is not empty: ${path}`, { path });
      }

      await Promise.all(descendants.map((key) => this.store.remove(key)));
      await this.store.remove(path);
    } catch (error: unknown) {
      throw toVfsError(error, "ADAPTER_UNAVAILABLE");
    }
  }

  dispose(): void {
    this.store.close();
    this.rootLatch = undefined;
  }

  private async requireNode(path: VfsPath): Promise<PersistedVfsNode> {
    await this.ensureRoot();

    const node = await this.store.get(path);
    if (node === null) {
      throw new VfsError("NOT_FOUND", `Path not found: ${path}`, { path });
    }

    return node;
  }

  private async ensureRoot(): Promise<void> {
    this.rootLatch ??= (async (): Promise<void> => {
      const root = await this.store.get("/");
      if (root !== null) {
        return;
      }

      await this.store.set("/", {
        path: "/",
        kind: "directory",
        size: 0,
        createdAt: this.baseTimestamp,
        updatedAt: this.baseTimestamp,
      });
    })();

    await this.rootLatch;
  }

  private async encodeBytes(bytes: Uint8Array): Promise<{
    bytes: ArrayBuffer;
    encryption?: PersistedVfsNode["encryption"];
  }> {
    if (!this.encryptionKey) {
      return { bytes: copyToArrayBuffer(bytes) };
    }

    const iv = randomBytes(12);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.encryptionKey,
      copyToArrayBuffer(bytes),
    );
    return {
      bytes: encrypted,
      encryption: {
        name: "aes-gcm-v1",
        iv: copyToArrayBuffer(iv),
      },
    };
  }

  private async decodeNodeBytes(node: PersistedVfsNode): Promise<Uint8Array> {
    if (node.encryption === undefined) {
      return bytesFromBuffer(node.bytes);
    }

    if (!this.encryptionKey) {
      throw new VfsError("ADAPTER_UNAVAILABLE", `Encrypted file requires an unlocked profile`, {
        path: node.path,
      });
    }

    const encrypted = node.bytes ?? new ArrayBuffer(0);
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(node.encryption.iv),
      },
      this.encryptionKey,
      encrypted,
    );

    return bytesFromBuffer(plain);
  }

  private async mkdirRecursive(path: VfsPath, now: number): Promise<void> {
    const existing = await this.store.get(path);
    if (existing !== null) {
      if (existing.kind !== "directory") {
        throw new VfsError("ALREADY_EXISTS", `Path already exists: ${path}`, { path });
      }
      return;
    }

    const parentPath = dirname(path);
    if (parentPath !== path) {
      const parent = await this.store.get(parentPath);
      if (parent === null) {
        await this.mkdirRecursive(parentPath, now);
      } else if (parent.kind !== "directory") {
        throw new VfsError("NOT_DIRECTORY", `Parent is not a directory: ${parentPath}`, { path });
      }
    }

    await this.store.set(path, {
      path,
      kind: "directory",
      size: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function makeDescendantRange(path: VfsPath): IDBKeyRange {
  const prefix = path === "/" ? "/" : `${path}/`;
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`, false, false);
}
