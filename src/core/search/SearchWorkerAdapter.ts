import { JobQueue, type JobOptions } from "~/core/background/JobQueue";
import { debugWarn } from "~/core/debug";
import { RpcRelay, unwrapRpcEnvelope, type Remote, type RpcEnvelope } from "~/core/ipc/rpc";
import type { SearchAdapter } from "~/core/search/SearchAdapter";
import {
  appToSearchDoc,
  commandToSearchDoc,
  searchDocId,
  type SearchIndexedDoc,
} from "~/core/search/MiniSearchIndex";
import type { Kernel } from "~/types/kernel";
import type { SearchHit, SearchQueryOptions } from "~/types/search";
import type { VfsSearchIndexer } from "~/core/search/VfsSearchIndexer";

function searchableCommands(kernel: Kernel) {
  return kernel.commands.list().filter((command) => command.scope !== "shell");
}

function searchableApps(kernel: Kernel) {
  return kernel.apps.list().filter((app) => app.hidden !== true);
}

export interface SearchWorkerApi {
  ready(): Promise<RpcEnvelope<void>>;
  rebuild(docs: SearchIndexedDoc[]): Promise<RpcEnvelope<void>>;
  replace(doc: SearchIndexedDoc): Promise<RpcEnvelope<void>>;
  replaceMany(docs: SearchIndexedDoc[]): Promise<RpcEnvelope<void>>;
  remove(docId: string): Promise<RpcEnvelope<void>>;
  removeVfsSubtree(path: string): Promise<RpcEnvelope<void>>;
  query(text: string, options?: SearchQueryOptions): Promise<RpcEnvelope<SearchHit[]>>;
}

export interface SearchWorkerClient {
  readonly api: SearchWorkerApi | Remote<SearchWorkerApi>;
  terminate(): void;
}

export interface SearchWorkerAdapterOptions {
  createClient?: () => SearchWorkerClient;
  readyTimeoutMs?: number;
  vfsIndexer?: VfsSearchIndexer;
}

export interface ReadySearchAdapter extends SearchAdapter {
  readonly ready: Promise<void>;
  readonly vfsReady?: Promise<void>;
  startVfsIndexing(): void;
  query(text: string, options?: SearchQueryOptions): Promise<SearchHit[]>;
}

const DEFAULT_SEARCH_WORKER_READY_TIMEOUT_MS = 1_000;

export function canUseSearchWorker(): boolean {
  return typeof Worker !== "undefined";
}

function createDefaultSearchWorkerClient(): SearchWorkerClient {
  const worker = new Worker(new URL("../../workers/search.worker.ts", import.meta.url), {
    name: "daopk-search-index",
    type: "module",
  });
  const relay = new RpcRelay();

  return {
    api: relay.wrap<SearchWorkerApi>(worker),
    terminate: () => worker.terminate(),
  };
}

export function createSearchWorkerAdapter(
  kernel: Kernel,
  options: SearchWorkerAdapterOptions = {},
): ReadySearchAdapter {
  const client = (options.createClient ?? createDefaultSearchWorkerClient)();
  const queue = new JobQueue({ concurrency: 1 });
  const disposers: Array<() => void> = [];
  let disposed = false;
  let vfsStarted = false;
  let vfsReady: Promise<void> | undefined;
  let vfsInitializing = false;
  const pendingVfsSync: Array<() => void> = [];

  function docs(): SearchIndexedDoc[] {
    return [
      ...searchableCommands(kernel).map(commandToSearchDoc),
      ...searchableApps(kernel).map(appToSearchDoc),
    ];
  }

  async function callWorker<T>(
    call: () => Promise<RpcEnvelope<T>>,
    jobOptions?: JobOptions,
  ): Promise<T> {
    const handle = queue.enqueue(async () => unwrapRpcEnvelope(await call()), jobOptions);

    return handle.promise;
  }

  function enqueueSync(call: () => Promise<RpcEnvelope<unknown>>): void {
    void callWorker(call).catch((error) => {
      if (!disposed) {
        debugWarn("[search-worker]", "index sync failed", error);
      }
    });
  }

  function enqueueVfsSync(work: () => void): void {
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

  function syncCommand(id: string): void {
    const cmd = searchableCommands(kernel).find((c) => c.id === id);

    enqueueSync(() =>
      cmd
        ? client.api.replace(commandToSearchDoc(cmd))
        : client.api.remove(searchDocId("command", id)),
    );
  }

  function syncApp(id: string): void {
    const app = searchableApps(kernel).find((a) => a.id === id);

    enqueueSync(() =>
      app ? client.api.replace(appToSearchDoc(app)) : client.api.remove(searchDocId("app", id)),
    );
  }

  const ready = callWorker(
    async () => {
      unwrapRpcEnvelope(await client.api.ready());

      return client.api.rebuild(docs());
    },
    {
      priority: "user-critical",
      timeoutMs: options.readyTimeoutMs ?? DEFAULT_SEARCH_WORKER_READY_TIMEOUT_MS,
    },
  );

  void ready.catch(() => undefined);

  disposers.push(
    kernel.events.on("command.registered", ({ id }) => syncCommand(id)),
    kernel.events.on("command.unregistered", ({ id }) => syncCommand(id)),
    kernel.events.on("app.registered", ({ id }) => syncApp(id)),
    kernel.events.on("app.unregistered", ({ id }) => syncApp(id)),
  );

  return {
    ready,

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
        .then((vfsDocs) => {
          if (disposed) {
            return undefined;
          }

          return callWorker(() => client.api.replaceMany(vfsDocs));
        })
        .catch((error) => {
          if (!disposed) {
            debugWarn("[search-worker]", "VFS crawl failed", error);
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
            enqueueVfsSync(() => enqueueSync(() => client.api.replace(doc)));
          },
          removeVfsSubtree(path): void {
            enqueueVfsSync(() => enqueueSync(() => client.api.removeVfsSubtree(path)));
          },
        }),
      );
    },

    async query(text, options): Promise<SearchHit[]> {
      if (disposed) {
        return [];
      }

      try {
        return await callWorker(() => client.api.query(text, options));
      } catch (error) {
        if (!disposed) {
          debugWarn("[search-worker]", "query failed", error);
        }

        return [];
      }
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
      queue.dispose();
      client.terminate();
    },
  };
}
