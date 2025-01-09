import type { SearchHit, SearchQueryOptions } from "~/types/search";

export interface SearchAdapter {
  /** Empty/whitespace text MUST return `[]`; worker adapters may resolve asynchronously. */
  query(text: string, options?: SearchQueryOptions): SearchHit[] | Promise<SearchHit[]>;
  startVfsIndexing?(): void;
  readonly vfsReady?: Promise<void>;
  dispose(): void;
}
