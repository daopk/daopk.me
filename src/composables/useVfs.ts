import { inject } from "vue";

import { useKernel } from "~/composables/useKernel";

import { AppContextInjectionKey } from "~/types/app";
import type { KernelVfsDirectoryOptions, KernelVfsWriteOptions } from "~/types/kernel";

type BoundWriteOptions = Omit<KernelVfsWriteOptions, "handleId">;
type BoundDirectoryOptions = Omit<KernelVfsDirectoryOptions, "handleId">;

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
