import type { AppHandle, AppLifecycleEvent, AppManifest } from "~/types/app";
import type { AppRegistrationSource } from "~/types/kernel";

export class AppRegistry {
  readonly manifests = new Map<string, AppManifest>();

  private readonly systemAppIds = new Set<string>();

  upsertManifest(manifest: AppManifest, options: { source?: AppRegistrationSource } = {}): void {
    this.manifests.set(manifest.id, manifest);
    if (options.source === "system") {
      this.systemAppIds.add(manifest.id);
    } else {
      this.systemAppIds.delete(manifest.id);
    }
  }

  unregister(id: string): void {
    this.manifests.delete(id);
    this.systemAppIds.delete(id);
  }

  isSystemApp(id: string): boolean {
    return this.systemAppIds.has(id);
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
