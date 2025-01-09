import { RpcRelay } from "~/core/ipc/rpc";
import { MiniSearchIndex, type SearchIndexedDoc } from "~/core/search/MiniSearchIndex";
import type { SearchQueryOptions } from "~/types/search";

export function createSearchWorkerApi(index = new MiniSearchIndex()) {
  return {
    ready(): void {
      return undefined;
    },

    rebuild(docs: unknown): void {
      index.rebuild(Array.isArray(docs) ? (docs as SearchIndexedDoc[]) : []);
    },

    replace(doc: unknown): void {
      index.replace(doc as SearchIndexedDoc);
    },

    replaceMany(docs: unknown): void {
      index.replaceMany(Array.isArray(docs) ? (docs as SearchIndexedDoc[]) : []);
    },

    remove(docId: unknown): void {
      index.remove(String(docId));
    },

    removeVfsSubtree(path: unknown): void {
      index.removeVfsSubtree(String(path));
    },

    query(text: unknown, options?: unknown) {
      return index.query(String(text), options as SearchQueryOptions | undefined);
    },
  };
}

if (typeof document === "undefined" && typeof self !== "undefined") {
  new RpcRelay().expose(createSearchWorkerApi());
}
