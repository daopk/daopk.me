import type {
  VfsAdapter,
  VfsMkdirOptions,
  VfsRemoveOptions,
  VfsWalkOptions,
  VfsWriteOptions,
} from "~/core/vfs/adapter";
import { MemoryAdapter } from "~/core/vfs/adapters/MemoryAdapter";
import { compareEntries } from "~/core/vfs/entrySort";
import { VfsError } from "~/core/vfs/errors";
import type { VfsDirEntry, VfsReadResult, VfsStat } from "~/core/vfs/nodes";
import {
  basename,
  depthBetween,
  dirname,
  isDescendantOrSelf,
  normalizeVfsPath,
  withinDepth,
  type VfsPath,
} from "~/core/vfs/path";

export interface VfsMount {
  readonly id: string;
  readonly path: VfsPath;
  readonly adapter: VfsAdapter;
}

interface ResolvedMount {
  readonly mount: VfsMount;
  readonly adapterPath: VfsPath;
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export class VFS {
  private readonly mountTable: VfsMount[] = [];

  mount(path: string, adapter: VfsAdapter, options?: { id?: string }): () => void {
    const mountPath = normalizeVfsPath(path);
    const id = options?.id ?? adapter.id;

    if (this.mountTable.some((mount) => mount.path === mountPath)) {
      throw new VfsError("CONFLICT", `VFS mount path already exists: ${mountPath}`, {
        path: mountPath,
      });
    }
    if (this.mountTable.some((mount) => mount.id === id)) {
      throw new VfsError("CONFLICT", `VFS mount id already exists: ${id}`, { path: mountPath });
    }

    this.mountTable.push({ id, path: mountPath, adapter });
    this.mountTable.sort((a, b) => b.path.length - a.path.length);

    return (): void => {
      this.unmount(id);
    };
  }

  unmount(idOrPath: string): boolean {
    const normalized = idOrPath.startsWith("/") ? normalizeVfsPath(idOrPath) : null;
    const index = this.mountTable.findIndex(
      (mount) => mount.id === idOrPath || (normalized !== null && mount.path === normalized),
    );

    if (index === -1) {
      return false;
    }

    const [mount] = this.mountTable.splice(index, 1);
    if (mount.path === "/" && this.mountTable.length > 0) {
      this.mountTable.splice(index, 0, mount);
      throw new VfsError("CONFLICT", "Cannot unmount root while other mounts exist", {
        path: mount.path,
      });
    }

    mount.adapter.dispose?.();
    return true;
  }

  // fallow-ignore-next-line unused-class-member
  mounts(): readonly VfsMount[] {
    return this.mountTable.slice();
  }

  async stat(path: string): Promise<VfsStat> {
    const resolved = this.resolve(path);
    const stat = await resolved.mount.adapter.stat(resolved.adapterPath);
    return this.toGlobalStat(resolved.mount.path, stat);
  }

  async list(path: string): Promise<readonly VfsDirEntry[]> {
    const resolved = this.resolve(path);
    const entries = await resolved.mount.adapter.list(resolved.adapterPath);
    const merged = new Map<string, VfsDirEntry>();

    for (const entry of entries) {
      const globalEntry = this.toGlobalEntry(resolved.mount.path, entry);
      merged.set(globalEntry.path, globalEntry);
    }

    for (const mountEntry of this.childMountEntries(normalizeVfsPath(path))) {
      merged.set(mountEntry.path, mountEntry);
    }

    return [...merged.values()].sort(compareEntries);
  }

  async walk(path: string, options?: VfsWalkOptions): Promise<readonly VfsDirEntry[]> {
    const root = normalizeVfsPath(path);
    if (options?.maxEntries !== undefined && options.maxEntries <= 0) {
      return [];
    }

    const resolved = this.resolve(root);

    if (resolved.mount.adapter.walk !== undefined) {
      return this.walkFast(root, resolved, options);
    }

    return this.walkFallback(root, options);
  }

  async read(path: string): Promise<VfsReadResult> {
    const resolved = this.resolve(path);
    const result = await resolved.mount.adapter.read(resolved.adapterPath);
    const globalStat = this.toGlobalStat(resolved.mount.path, result.stat);
    return {
      path: globalStat.path,
      bytes: result.bytes,
      stat: globalStat,
    };
  }

  async readText(path: string): Promise<string> {
    const result = await this.read(path);
    return TEXT_DECODER.decode(result.bytes);
  }

  async write(path: string, bytes: Uint8Array, options?: VfsWriteOptions): Promise<VfsStat> {
    const resolved = this.resolve(path);
    const stat = await resolved.mount.adapter.write(resolved.adapterPath, bytes, options);
    return this.toGlobalStat(resolved.mount.path, stat);
  }

  async writeText(
    path: string,
    text: string,
    options?: Omit<VfsWriteOptions, "mimeType"> & { mimeType?: string },
  ): Promise<VfsStat> {
    return this.write(path, TEXT_ENCODER.encode(text), {
      ...options,
      mimeType: options?.mimeType ?? "text/plain;charset=utf-8",
    });
  }

  async mkdir(path: string, options?: VfsMkdirOptions): Promise<VfsStat> {
    const resolved = this.resolve(path);
    const stat = await resolved.mount.adapter.mkdir(resolved.adapterPath, options);
    return this.toGlobalStat(resolved.mount.path, stat);
  }

  async remove(path: string, options?: VfsRemoveOptions): Promise<void> {
    const resolved = this.resolve(path);
    await resolved.mount.adapter.remove(resolved.adapterPath, options);
  }

  // fallow-ignore-next-line unused-class-member
  dispose(): void {
    for (const mount of this.mountTable) {
      mount.adapter.dispose?.();
    }
    this.mountTable.length = 0;
  }

  private resolve(path: string): ResolvedMount {
    const normalized = normalizeVfsPath(path);
    const mount = this.mountTable.find((candidate) => matchesMount(candidate.path, normalized));

    if (mount === undefined) {
      throw new VfsError("MOUNT_NOT_FOUND", `No VFS mount for path: ${normalized}`, {
        path: normalized,
      });
    }

    return {
      mount,
      adapterPath: toAdapterPath(mount.path, normalized),
    };
  }

  private toGlobalStat(mountPath: VfsPath, stat: VfsStat): VfsStat {
    return {
      ...stat,
      path: toGlobalPath(mountPath, stat.path),
    };
  }

  private toGlobalEntry(mountPath: VfsPath, entry: VfsDirEntry): VfsDirEntry {
    const path = toGlobalPath(mountPath, entry.path);
    return {
      ...entry,
      name: basename(path),
      path,
    };
  }

  private childMountEntries(path: VfsPath): readonly VfsDirEntry[] {
    return this.mountTable
      .filter((mount) => mount.path !== "/" && dirname(mount.path) === path)
      .map((mount) => ({
        name: basename(mount.path),
        path: mount.path,
        kind: "directory" as const,
        size: 0,
        updatedAt: 0,
        readonly: mount.adapter.readonly,
      }));
  }

  private async walkFast(
    root: VfsPath,
    resolved: ResolvedMount,
    options?: VfsWalkOptions,
  ): Promise<readonly VfsDirEntry[]> {
    options?.signal?.throwIfAborted();

    const descendants = new Map<string, VfsDirEntry>();
    const childMounts = this.descendantMounts(root, resolved.mount.path);

    const adapterEntries = await resolved.mount.adapter.walk?.(resolved.adapterPath, options);
    for (const entry of adapterEntries ?? []) {
      const globalEntry = this.toGlobalEntry(resolved.mount.path, entry);
      if (this.isShadowedByMount(globalEntry.path, childMounts)) {
        continue;
      }
      if (withinDepth(root, globalEntry.path, options?.maxDepth)) {
        descendants.set(globalEntry.path, globalEntry);
      }
    }

    for (const mount of childMounts) {
      const mountDepth = depthBetween(root, mount.path);
      if (options?.maxDepth !== undefined && mountDepth > options.maxDepth) {
        continue;
      }

      descendants.set(mount.path, {
        name: basename(mount.path),
        path: mount.path,
        kind: "directory",
        size: 0,
        updatedAt: 0,
        readonly: mount.adapter.readonly,
      });

      const remainingDepth =
        options?.maxDepth === undefined ? undefined : Math.max(0, options.maxDepth - mountDepth);
      if (remainingDepth === 0) {
        continue;
      }

      const mountedDescendants = await this.walk(mount.path, {
        ...(remainingDepth === undefined ? {} : { maxDepth: remainingDepth }),
        ...(options?.maxEntries === undefined
          ? {}
          : { maxEntries: Math.max(0, options.maxEntries - descendants.size) }),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      });
      for (const entry of mountedDescendants) {
        if (withinDepth(root, entry.path, options?.maxDepth)) {
          descendants.set(entry.path, entry);
          if (options?.maxEntries !== undefined && descendants.size >= options.maxEntries) {
            return [...descendants.values()].sort(compareEntries);
          }
        }
      }
    }

    const sorted = [...descendants.values()].sort(compareEntries);
    return options?.maxEntries === undefined ? sorted : sorted.slice(0, options.maxEntries);
  }

  private async walkFallback(
    root: VfsPath,
    options?: VfsWalkOptions,
  ): Promise<readonly VfsDirEntry[]> {
    const descendants = new Map<string, VfsDirEntry>();
    const queue: Array<{ path: VfsPath; depth: number }> = [{ path: root, depth: 0 }];

    while (queue.length > 0) {
      options?.signal?.throwIfAborted();
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      if (options?.maxDepth !== undefined && current.depth >= options.maxDepth) {
        continue;
      }

      const entries = await this.list(current.path);
      for (const entry of entries) {
        const depth = current.depth + 1;
        descendants.set(entry.path, entry);
        if (options?.maxEntries !== undefined && descendants.size >= options.maxEntries) {
          return [...descendants.values()].sort(compareEntries);
        }
        if (entry.kind === "directory") {
          queue.push({ path: entry.path, depth });
        }
      }
    }

    const sorted = [...descendants.values()].sort(compareEntries);
    return options?.maxEntries === undefined ? sorted : sorted.slice(0, options.maxEntries);
  }

  private descendantMounts(root: VfsPath, currentMountPath: VfsPath): readonly VfsMount[] {
    return this.mountTable
      .filter(
        (mount) =>
          mount.path !== currentMountPath &&
          mount.path !== "/" &&
          isDescendantOrSelf(root, mount.path),
      )
      .sort((a, b) => a.path.length - b.path.length);
  }

  private isShadowedByMount(path: VfsPath, mounts: readonly VfsMount[]): boolean {
    return mounts.some((mount) => isDescendantOrSelf(mount.path, path));
  }
}

export function createMemoryVfsBootstrap(): VFS {
  const vfs = new VFS();
  vfs.mount(
    "/",
    new MemoryAdapter({
      id: "root-memory",
      seed: {
        directories: ["/home", "/tmp"],
      },
    }),
    { id: "root" },
  );
  return vfs;
}

function matchesMount(mountPath: VfsPath, path: VfsPath): boolean {
  return mountPath === "/" || path === mountPath || path.startsWith(`${mountPath}/`);
}

function toAdapterPath(mountPath: VfsPath, path: VfsPath): VfsPath {
  if (mountPath === "/") {
    return path;
  }
  if (path === mountPath) {
    return normalizeVfsPath("/");
  }

  return normalizeVfsPath(path.slice(mountPath.length));
}

function toGlobalPath(mountPath: VfsPath, adapterPath: VfsPath): VfsPath {
  if (mountPath === "/") {
    return adapterPath;
  }
  if (adapterPath === "/") {
    return mountPath;
  }

  return normalizeVfsPath(`${mountPath}${adapterPath}`);
}
