import type { VfsPath } from "~/core/vfs/path";

export type VfsNodeKind = "file" | "directory" | "symlink";

export interface VfsInode {
  readonly id: string;
  readonly kind: VfsNodeKind;
  readonly bytes?: Uint8Array;
  readonly targets?: readonly string[];
}

export interface VfsStat {
  readonly path: VfsPath;
  readonly kind: VfsNodeKind;
  readonly size: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly readonly: boolean;
  readonly etag?: string;
  readonly mimeType?: string;
}

export interface VfsDirEntry {
  readonly name: string;
  readonly path: VfsPath;
  readonly kind: VfsNodeKind;
  readonly size: number;
  readonly updatedAt: number;
  readonly readonly: boolean;
  readonly mimeType?: string;
}

export interface VfsReadResult {
  readonly path: VfsPath;
  readonly bytes: Uint8Array;
  readonly stat: VfsStat;
}
