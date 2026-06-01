/**
 * Host SDK for external (installed) apps — the public `@daopk/sdk` surface.
 *
 * This module is the SINGLE definition site for the kernel injection keys and
 * `useKernel`. The host imports these symbols (directly or via the `~/types/*`
 * re-exports) and external apps import them at runtime via the import map the
 * host injects into `index.html`. Because both resolve to THIS one module, the
 * host and every external app share ONE set of injection-key symbols and ONE
 * Vue instance (the import map also maps the bare `vue` specifier to the
 * host's Vue chunk). Without that, `inject()` / `useKernel()` silently fail
 * across the boundary.
 *
 * External-app build preset (Vite/Rollup):
 *
 *   // vite.config.ts of the external app
 *   build: { rollupOptions: { external: ["vue", "@daopk/sdk"] } }
 *
 * The app entry module must `export default` a Vue component and import Vue
 * from `"vue"` (resolved to the host instance via the import map). Serve the
 * built module over HTTPS with permissive CORS — the host page runs under COEP
 * `credentialless`, so cross-origin module scripts must send CORS headers.
 *
 * See `src/runtime/README.md` for the full authoring guide.
 */
import { inject, type InjectionKey } from "vue";

import type { AppChromeController, AppContext } from "~/types/app";
import type {
  Kernel,
  KernelVfsDirectoryOptions,
  KernelVfsWriteOptions,
} from "~/types/kernel";

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

export type {
  AppChromeBackAction,
  AppChromeController,
  AppContext,
  AppHandle,
  AppManifest,
  AppPermission,
} from "~/types/app";
export type { Kernel } from "~/types/kernel";
export type {
  VfsDirEntry,
  VfsInode,
  VfsNodeKind,
  VfsReadResult,
  VfsStat,
} from "~/core/vfs/nodes";
export type { VfsPath } from "~/core/vfs/path";
export type { VfsFileTypeInput, VfsRenderableFileType } from "~/core/vfs/fileTypes";
export type { TrashItem, TrashItemKind } from "~/types/trash";
