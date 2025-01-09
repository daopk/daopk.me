import { debugWarn } from "~/core/debug";
import type { SearchAdapter } from "~/core/search/SearchAdapter";
import { canUseSearchWorker, createSearchWorkerAdapter } from "~/core/search/SearchWorkerAdapter";
import type { VfsSearchIndexer } from "~/core/search/VfsSearchIndexer";
import type { Kernel } from "~/types/kernel";

export interface CreateSearchAdapterOptions {
  readonly vfsIndexer?: VfsSearchIndexer;
}

export async function createSearchAdapter(
  kernel: Kernel,
  options: CreateSearchAdapterOptions = {},
): Promise<SearchAdapter> {
  if (canUseSearchWorker()) {
    let workerAdapter: ReturnType<typeof createSearchWorkerAdapter> | undefined;

    try {
      workerAdapter = createSearchWorkerAdapter(kernel, { vfsIndexer: options.vfsIndexer });
      await workerAdapter.ready;

      return workerAdapter;
    } catch (error) {
      workerAdapter?.dispose();
      debugWarn("[search]", "worker adapter unavailable; falling back to MiniSearch", error);
    }
  }

  const { createMiniSearchAdapter } = await import("~/core/search/MiniSearchAdapter");

  return createMiniSearchAdapter(kernel, { vfsIndexer: options.vfsIndexer });
}
