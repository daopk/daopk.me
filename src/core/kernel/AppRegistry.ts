import type { AppHandle, AppLifecycleEvent, AppManifest } from "~/types/app";

export class AppRegistry {
  readonly manifests = new Map<string, AppManifest>();

  upsertManifest(manifest: AppManifest): void {
    this.manifests.set(manifest.id, manifest);
  }

  unregister(id: string): void {
    this.manifests.delete(id);
  }
}

export function createPlaceholderHandle(opts: Pick<AppHandle, "manifestId">): AppHandle {
  const listeners = new Map<AppLifecycleEvent, Set<() => void>>();
  const pseudoId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${opts.manifestId}-stub-process`;

  return {
    id: pseudoId,
    manifestId: opts.manifestId,
    on(event, listener) {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(listener);
      listeners.set(event, bucket);

      return () => {
        const current = listeners.get(event);
        if (!current) {
          return;
        }

        current.delete(listener);
      };
    },
    postMessage() {},
  };
}
