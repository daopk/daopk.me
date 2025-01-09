import type { Kernel } from "~/types/kernel";
import type { SearchAdapter } from "~/core/search/SearchAdapter";
import { debugWarn } from "~/core/debug";
import type { VfsSearchIndexer } from "~/core/search/VfsSearchIndexer";

import {
  appToSearchDoc,
  commandToSearchDoc,
  MiniSearchIndex,
  searchDocId,
} from "./MiniSearchIndex";

function searchableCommands(kernel: Kernel) {
  return kernel.commands.list().filter((command) => command.scope !== "shell");
}

function searchableApps(kernel: Kernel) {
  return kernel.apps.list().filter((app) => app.hidden !== true);
}

export interface MiniSearchAdapterOptions {
  readonly vfsIndexer?: VfsSearchIndexer;
}

export function createMiniSearchAdapter(
  kernel: Kernel,
  options: MiniSearchAdapterOptions = {},
): SearchAdapter {
  const index = new MiniSearchIndex();
  const disposers: Array<() => void> = [];
  let disposed = false;
  let vfsStarted = false;
  let vfsReady: Promise<void> | undefined;
  let vfsInitializing = false;
  const pendingVfsSync: Array<() => void> = [];

  function rebuildAll(): void {
    index.rebuild([
      ...searchableCommands(kernel).map(commandToSearchDoc),
      ...searchableApps(kernel).map(appToSearchDoc),
    ]);
  }

  function syncCommand(id: string): void {
    const cmd = searchableCommands(kernel).find((c) => c.id === id);

    if (cmd) {
      index.replace(commandToSearchDoc(cmd));
    } else {
      index.remove(searchDocId("command", id));
    }
  }

  function syncApp(id: string): void {
    const app = searchableApps(kernel).find((a) => a.id === id);

    if (app) {
      index.replace(appToSearchDoc(app));
    } else {
      index.remove(searchDocId("app", id));
    }
  }

  function applyVfsSync(work: () => void): void {
    if (vfsInitializing) {
      pendingVfsSync.push(work);
      return;
    }

    work();
  }

  function flushPendingVfsSync(): void {
    const pending = pendingVfsSync.splice(0);

    for (const work of pending) {
      work();
    }
  }

  rebuildAll();

  disposers.push(
    kernel.events.on("command.registered", ({ id }) => syncCommand(id)),
    kernel.events.on("command.unregistered", ({ id }) => syncCommand(id)),
    kernel.events.on("app.registered", ({ id }) => syncApp(id)),
    kernel.events.on("app.unregistered", ({ id }) => syncApp(id)),
  );

  return {
    get vfsReady(): Promise<void> | undefined {
      return vfsReady;
    },

    startVfsIndexing(): void {
      if (disposed || vfsStarted || options.vfsIndexer === undefined) {
        return;
      }

      vfsStarted = true;
      vfsInitializing = true;
      vfsReady = options
        .vfsIndexer!.crawl()
        .then((docs) => {
          if (!disposed) {
            index.replaceMany(docs);
          }
        })
        .catch((error) => {
          if (!disposed) {
            debugWarn("[search]", "VFS crawl failed", error);
          }
        })
        .finally(() => {
          vfsInitializing = false;
          if (!disposed) {
            flushPendingVfsSync();
          } else {
            pendingVfsSync.length = 0;
          }
        });
      void vfsReady.catch(() => undefined);

      disposers.push(
        options.vfsIndexer.subscribe({
          replace(doc): void {
            if (!disposed) {
              applyVfsSync(() => index.replace(doc));
            }
          },
          removeVfsSubtree(path): void {
            if (!disposed) {
              applyVfsSync(() => index.removeVfsSubtree(path));
            }
          },
        }),
      );
    },

    query(text, options) {
      if (disposed) {
        return [];
      }

      return index.query(text, options);
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      for (const off of disposers) {
        off();
      }

      disposers.length = 0;
      index.dispose();
    },
  };
}
