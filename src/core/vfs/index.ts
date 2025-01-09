export type {
  VfsAdapter,
  VfsMkdirOptions,
  VfsRemoveOptions,
  VfsWalkOptions,
  VfsWriteOptions,
} from "~/core/vfs/adapter";
export { IDBAdapter } from "~/core/vfs/adapters/IDBAdapter";
export type { IDBAdapterOptions } from "~/core/vfs/adapters/IDBAdapter";
export { MemoryAdapter } from "~/core/vfs/adapters/MemoryAdapter";
export type { MemoryAdapterOptions, MemoryAdapterSeed } from "~/core/vfs/adapters/MemoryAdapter";
export { StaticHTTPAdapter } from "~/core/vfs/adapters/StaticHTTPAdapter";
export type {
  StaticHTTPAdapterOptions,
  StaticHttpEntry,
} from "~/core/vfs/adapters/StaticHTTPAdapter";
export { VfsError } from "~/core/vfs/errors";
export type { VfsErrorCode } from "~/core/vfs/errors";
export {
  defaultTextMimeTypeForPath,
  detectVfsFileType,
  isEditableVfsTextFile,
  normalizedVfsMimeType,
  vfsFileExtension,
  vfsFileTypeInputFromPath,
} from "~/core/vfs/fileTypes";
export type { VfsFileTypeInput, VfsRenderableFileType } from "~/core/vfs/fileTypes";
export { createMemoryVfsBootstrap, VFS } from "~/core/vfs/VFS";
export type { VfsDirEntry, VfsInode, VfsNodeKind, VfsReadResult, VfsStat } from "~/core/vfs/nodes";
export {
  assertAbsoluteVfsPath,
  basename,
  dirname,
  joinVfsPath,
  normalizeVfsPath,
} from "~/core/vfs/path";
export type { VfsPath } from "~/core/vfs/path";
