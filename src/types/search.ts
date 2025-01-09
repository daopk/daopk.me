/**
 * Public types for the kernel search façade.
 *
 * Hits are intentionally **structured-clone safe** — no `Component` refs,
 * no callback functions — so can swap the adapter into a Comlink
 * worker invisibly. UI consumers (Spotlight) re-resolve icons + run
 * targets from the original registry by `kind` + `id`.
 */

export type SearchKind = "command" | "app" | "vfs";

export type SearchVfsEntryKind = "file" | "directory";

export interface SearchVfsMetadata {
  readonly path: string;
  readonly entryKind: SearchVfsEntryKind;
  readonly mimeType?: string;
  readonly size?: number;
  readonly updatedAt?: number;
  readonly snippet?: string;
}

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  hint?: string;
  score: number;
  vfs?: SearchVfsMetadata;
}

export interface SearchQueryOptions {
  limit?: number;
  kind?: SearchKind;
  include?: readonly SearchKind[];
  perKindLimit?: Partial<Record<SearchKind, number>>;
}

export interface KernelSearchFacade {
  query(text: string, options?: SearchQueryOptions): Promise<SearchHit[]>;
}
