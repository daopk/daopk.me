/**
 * Structured-clone-safe MiniSearch index core shared by the main-thread
 * fallback adapter and the search worker.
 */

import MiniSearch from "minisearch";

import type { AppManifest } from "~/types/app";
import type { CommandManifest } from "~/types/command";
import type { SearchHit, SearchKind, SearchQueryOptions, SearchVfsMetadata } from "~/types/search";

export interface SearchIndexedDoc {
  docId: string;
  kind: SearchKind;
  rawId: string;
  title: string;
  hint: string;
  keywords: string;
  rawIdSearchable: string;
  body?: string;
  vfs?: SearchVfsMetadata;
}

export interface VfsSearchDocInput {
  readonly path: string;
  readonly title: string;
  readonly hint?: string;
  readonly keywords?: readonly string[];
  readonly body?: string;
  readonly metadata: SearchVfsMetadata;
}

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const DEFAULT_INCLUDED_KINDS: readonly SearchKind[] = ["app", "command"];

export function commandToSearchDoc(
  manifest: Pick<CommandManifest, "id" | "title" | "hint" | "keywords">,
): SearchIndexedDoc {
  return {
    docId: searchDocId("command", manifest.id),
    kind: "command",
    rawId: manifest.id,
    title: manifest.title,
    hint: manifest.hint ?? "",
    keywords: (manifest.keywords ?? []).join(" "),
    rawIdSearchable: manifest.id,
  };
}

export function appToSearchDoc(
  manifest: Pick<AppManifest, "id" | "name" | "category" | "keywords">,
): SearchIndexedDoc {
  return {
    docId: searchDocId("app", manifest.id),
    kind: "app",
    rawId: manifest.id,
    title: manifest.name,
    hint: manifest.category,
    keywords: (manifest.keywords ?? []).join(" "),
    rawIdSearchable: manifest.id,
  };
}

export function searchDocId(kind: SearchKind, id: string): string {
  return `${kind}:${id}`;
}

export function vfsSearchDocId(path: string): string {
  return searchDocId("vfs", path);
}

export function vfsToSearchDoc(input: VfsSearchDocInput): SearchIndexedDoc {
  return {
    docId: vfsSearchDocId(input.path),
    kind: "vfs",
    rawId: input.path,
    title: input.title,
    hint: input.hint ?? input.path,
    keywords: (input.keywords ?? []).join(" "),
    rawIdSearchable: input.path,
    ...(input.body === undefined ? {} : { body: input.body }),
    vfs: input.metadata,
  };
}

export class MiniSearchIndex {
  private mini: MiniSearch<SearchIndexedDoc> | null = makeMiniSearch();

  private readonly docIds = new Set<string>();

  rebuild(docs: readonly SearchIndexedDoc[]): void {
    if (!this.mini) {
      return;
    }

    this.mini.removeAll();
    this.mini.addAll([...docs]);
    this.docIds.clear();
    for (const doc of docs) {
      this.docIds.add(doc.docId);
    }
  }

  replace(doc: SearchIndexedDoc): void {
    if (!this.mini) {
      return;
    }

    if (this.mini.has(doc.docId)) {
      this.mini.discard(doc.docId);
    }

    this.mini.add(doc);
    this.docIds.add(doc.docId);
  }

  replaceMany(docs: readonly SearchIndexedDoc[]): void {
    if (!this.mini) {
      return;
    }

    for (const doc of docs) {
      this.replace(doc);
    }
  }

  remove(docId: string): void {
    if (!this.mini) {
      return;
    }

    if (this.mini.has(docId)) {
      this.mini.discard(docId);
    }
    this.docIds.delete(docId);
  }

  removeVfsSubtree(path: string): void {
    if (!this.mini) {
      return;
    }

    const rootDocId = vfsSearchDocId(path);
    const descendantPrefix = `${rootDocId}/`;
    for (const docId of this.docIds) {
      if (docId === rootDocId || docId.startsWith(descendantPrefix)) {
        this.remove(docId);
      }
    }
  }

  query(text: string, options?: SearchQueryOptions): SearchHit[] {
    if (!this.mini) {
      return [];
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const limit = Math.max(1, Math.min(options?.limit ?? DEFAULT_LIMIT, HARD_LIMIT));
    const allowedKinds = includedKinds(options);
    const perKindLimit = normalizedPerKindLimit(options?.perKindLimit);
    const seenByKind: Partial<Record<SearchKind, number>> = {};

    const raw = this.mini.search(trimmed, {
      filter: (doc): boolean => allowedKinds.has(doc.kind),
    });

    const hits: SearchHit[] = [];

    for (const r of raw) {
      if (hits.length >= limit) {
        break;
      }

      const kind = r.kind as SearchKind;
      if (!shouldTake(kind)) {
        continue;
      }

      hits.push({
        kind,
        id: r.rawId as string,
        title: r.title as string,
        hint: (r.hint as string) || undefined,
        score: r.score,
        ...(r.kind === "vfs" && r.vfs !== undefined ? { vfs: r.vfs as SearchVfsMetadata } : {}),
      });
      seenByKind[kind] = (seenByKind[kind] ?? 0) + 1;
    }

    return hits;

    function shouldTake(kind: SearchKind): boolean {
      const cap = perKindLimit[kind];
      return cap === undefined || (seenByKind[kind] ?? 0) < cap;
    }
  }

  dispose(): void {
    this.mini = null;
    this.docIds.clear();
  }
}

function makeMiniSearch(): MiniSearch<SearchIndexedDoc> {
  return new MiniSearch<SearchIndexedDoc>({
    idField: "docId",
    fields: ["title", "hint", "keywords", "rawIdSearchable", "body"],
    storeFields: ["kind", "rawId", "title", "hint", "vfs"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { title: 4, hint: 2, keywords: 1.5, rawIdSearchable: 0.5, body: 0.35 },
      // OR (the MiniSearch default) — multi-word queries do NOT require
      combineWith: "OR",
    },
  });
}

function includedKinds(options?: SearchQueryOptions): Set<SearchKind> {
  if (options?.kind !== undefined) {
    return new Set([options.kind]);
  }

  const include = options?.include ?? DEFAULT_INCLUDED_KINDS;
  return new Set(include);
}

function normalizedPerKindLimit(
  caps: SearchQueryOptions["perKindLimit"],
): Partial<Record<SearchKind, number>> {
  if (caps === undefined) {
    return {};
  }

  const normalized: Partial<Record<SearchKind, number>> = {};
  for (const kind of ["app", "command", "vfs"] satisfies SearchKind[]) {
    const cap = caps[kind];
    if (cap !== undefined) {
      normalized[kind] = Math.max(0, Math.min(cap, HARD_LIMIT));
    }
  }
  return normalized;
}
