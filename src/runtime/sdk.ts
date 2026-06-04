/**
 * Host SDK for independently-published first-party apps — the public
 * `@daopk/sdk` surface.
 *
 * This module is the SINGLE definition site for the kernel injection keys and
 * `useKernel`. The host imports these symbols (directly or via the `~/types/*`
 * re-exports) and published first-party apps import them at runtime via the
 * import map the host injects into `index.html`. Because both resolve to THIS
 * one module, the host and every published first-party app share ONE set of
 * injection-key symbols and ONE Vue instance (the import map also maps the bare
 * `vue` specifier to the
 * host's Vue chunk). Without that, `inject()` / `useKernel()` silently fail
 * across the boundary.
 *
 * First-party app package build preset (Vite/Rollup):
 *
 *   // apps/<id>/vite.config.ts
 *   build: { rollupOptions: { external: ["vue", "@daopk/sdk"] } }
 *
 * The app entry module must `export default` a Vue component and import Vue
 * from `"vue"` (resolved to the host instance via the import map). Serve the
 * built module from a versioned same-origin `/apps/<id>/...` URL.
 *
 * See `src/runtime/README.md` for the full authoring guide.
 */
import { inject, type InjectionKey } from "vue";

import type { AppChromeController, AppContext } from "~/types/app";
import type { Kernel, KernelVfsDirectoryOptions, KernelVfsWriteOptions } from "~/types/kernel";

/** Provided at the app root in `main.ts`; resolved by `useKernel`. */
export const KernelInjectionKey: InjectionKey<Kernel> = Symbol("daopk.kernel");

/** Provided per window/frame by the shell's app mount. */
export const AppContextInjectionKey: InjectionKey<AppContext> = Symbol("AppContext");

/** Provided by shells that surface app chrome (e.g. the mobile AppView header). */
export const AppChromeInjectionKey: InjectionKey<AppChromeController> = Symbol("AppChrome");

/** Resolve the running kernel. Throws if called before the kernel is provided. */
export function useKernel(): Kernel {
  const injected = inject(KernelInjectionKey, undefined);

  if (!injected) {
    throw new Error(
      "useKernel(): KernelInjectionKey missing — bootstrapKernel must run before mount.",
    );
  }

  return injected;
}

type BoundWriteOptions = Omit<KernelVfsWriteOptions, "handleId">;
type BoundDirectoryOptions = Omit<KernelVfsDirectoryOptions, "handleId">;

/**
 * App-scoped VFS client. Resolves the kernel + the per-window `AppContext` (so
 * every call is tagged with the running `handleId` for permission scoping) and
 * binds the kernel VFS facade to it. Defined here — not in `~/composables` — so
 * the host and externally-loaded first-party apps share ONE implementation
 * resolving the SAME injection keys.
 */
export function useVfs() {
  const kernel = useKernel();
  const context = inject(AppContextInjectionKey, null);

  if (context === null) {
    throw new Error("useVfs(): AppContextInjectionKey missing — VFS access is app-scoped.");
  }

  const access = { handleId: context.handleId };

  return {
    stat: (path: string) => kernel.vfs.stat(path, access),
    list: (path: string) => kernel.vfs.list(path, access),
    read: (path: string) => kernel.vfs.read(path, access),
    readText: (path: string) => kernel.vfs.readText(path, access),
    write: (path: string, bytes: Uint8Array, options?: BoundWriteOptions) =>
      kernel.vfs.write(path, bytes, { ...options, ...access }),
    writeText: (path: string, text: string, options?: BoundWriteOptions) =>
      kernel.vfs.writeText(path, text, { ...options, ...access }),
    mkdir: (path: string, options?: BoundDirectoryOptions) =>
      kernel.vfs.mkdir(path, { ...options, ...access }),
    remove: (path: string, options?: BoundDirectoryOptions) =>
      kernel.vfs.remove(path, { ...options, ...access }),
  };
}

// Pure helpers + types first-party apps may use without reaching into host
// internals. Re-exported from their narrow source modules (not the `~/core/vfs`
// barrel) so this SDK chunk never pulls in the heavy VFS adapters / VFS class.
export { formatBytes, formatDateTime } from "~/utils/format";
export { toActionErrorMessage, toErrorMessage } from "~/utils/errors";
export {
  assertAbsoluteVfsPath,
  basename,
  dirname,
  joinVfsPath,
  normalizeVfsPath,
} from "~/core/vfs/path";
export {
  defaultTextMimeTypeForPath,
  detectVfsFileType,
  isEditableVfsTextFile,
  normalizedVfsMimeType,
  vfsFileExtension,
  vfsFileTypeInputFromPath,
} from "~/core/vfs/fileTypes";
export { splitFilename } from "~/core/vfs/fileNames";
export { isNotesMarkdownPath, NOTES_ROOT } from "~/core/notes/notesPaths";
export { isFirstPartyAppProtocolUrl, parseAppProtocolIntent } from "~/core/routing/appUrlIntents";

// Shared composables + infra the satellite first-party apps reuse. Each resolves
// to ONE instance via this chunk, so `VfsError` `instanceof` checks, the profile
// session singleton behind `activeProfileKvNamespace`, etc. match the host.
// Added for the satellite-app migration — treat as stable ABI like the rest of
// this surface.
export { useBreakpoint } from "~/composables/useBreakpoint";
export { debugLog, debugWarn } from "~/core/debug";
export { VfsError } from "~/core/vfs/errors";
export { KVStore } from "~/core/storage/KVStore";
export { activeProfileKvNamespace } from "~/core/profile/storageScope";

export type {
  AppChromeBackAction,
  AppChromeContentSize,
  AppChromeController,
  AppChromeManifest,
  AppChromeTitlebarVisibility,
  AppContext,
  AppHandle,
  AppManifest,
  AppPermission,
} from "~/types/app";
export type { Kernel } from "~/types/kernel";
export type { VfsDirEntry, VfsInode, VfsNodeKind, VfsReadResult, VfsStat } from "~/core/vfs/nodes";
export type { VfsPath } from "~/core/vfs/path";
export type { VfsFileTypeInput, VfsRenderableFileType } from "~/core/vfs/fileTypes";
export type { VfsErrorCode } from "~/core/vfs/errors";
export type { KVStoreOptions } from "~/core/storage/KVStore";
export type { TrashItem, TrashItemKind } from "~/types/trash";
