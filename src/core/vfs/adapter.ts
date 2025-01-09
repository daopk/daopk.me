import type { VfsDirEntry, VfsReadResult, VfsStat } from "~/core/vfs/nodes";
import type { VfsPath } from "~/core/vfs/path";

export interface VfsWriteOptions {
  readonly overwrite?: boolean;
  readonly mimeType?: string;
  readonly now?: number;
}

export interface VfsMkdirOptions {
  readonly recursive?: boolean;
  readonly now?: number;
}

export interface VfsRemoveOptions {
  readonly recursive?: boolean;
}

export interface VfsWalkOptions {
  readonly maxDepth?: number;
  readonly maxEntries?: number;
  readonly signal?: AbortSignal;
}

export interface VfsAdapter {
  readonly id: string;
  readonly readonly: boolean;
  stat(path: VfsPath): Promise<VfsStat>;
  list(path: VfsPath): Promise<readonly VfsDirEntry[]>;
  walk?(path: VfsPath, options?: VfsWalkOptions): Promise<readonly VfsDirEntry[]>;
  read(path: VfsPath): Promise<VfsReadResult>;
  write(path: VfsPath, bytes: Uint8Array, options?: VfsWriteOptions): Promise<VfsStat>;
  mkdir(path: VfsPath, options?: VfsMkdirOptions): Promise<VfsStat>;
  remove(path: VfsPath, options?: VfsRemoveOptions): Promise<void>;
  dispose?(): void;
}
