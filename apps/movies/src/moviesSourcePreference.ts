import { activeProfileKvNamespace, KVStore } from "@daopk/sdk";

import type { MoviePlaySource } from "./moviesApi";

const MOVIES_SOURCE_PREFERENCE_KV_NAMESPACE = "movies";
export const MOVIES_SOURCE_PREFERENCE_KV_KEY = "source-preference";

export interface MoviesSourcePreferenceSnapshot {
  readonly filename: string;
  readonly index: number;
  readonly name: string;
  readonly serverName: string;
  readonly slug: string;
}

export interface MoviesSourcePreferenceState {
  readonly source: MoviesSourcePreferenceSnapshot;
  readonly updatedAt: number;
}

export interface CreateMoviesSourcePreferenceStoreOptions {
  readonly now?: () => number;
  readonly storageNamespace?: string;
}

export function moviesSourcePreferenceSnapshot(
  source: MoviePlaySource,
  index: number,
): MoviesSourcePreferenceSnapshot {
  return {
    filename: source.filename,
    index: normalizedSourceIndex(index),
    name: source.name,
    serverName: source.serverName,
    slug: source.slug,
  };
}

export function createMoviesSourcePreferenceStore(
  options: CreateMoviesSourcePreferenceStoreOptions = {},
): {
  clear: () => void;
  dispose: () => void;
  get: () => MoviesSourcePreferenceSnapshot | null;
  save: (source: MoviesSourcePreferenceSnapshot) => void;
  snapshot: () => MoviesSourcePreferenceState | null;
} {
  const now = options.now ?? (() => Date.now());
  const kv = new KVStore<MoviesSourcePreferenceState>(
    options.storageNamespace ?? activeProfileKvNamespace(MOVIES_SOURCE_PREFERENCE_KV_NAMESPACE),
    { version: 1 },
  );
  let state = coerceMoviesSourcePreferenceState(kv.get(MOVIES_SOURCE_PREFERENCE_KV_KEY));

  if (state === null && kv.has(MOVIES_SOURCE_PREFERENCE_KV_KEY)) {
    kv.remove(MOVIES_SOURCE_PREFERENCE_KV_KEY);
  }

  function clear(): void {
    state = null;
    kv.remove(MOVIES_SOURCE_PREFERENCE_KV_KEY);
  }

  function get(): MoviesSourcePreferenceSnapshot | null {
    return state?.source ?? null;
  }

  function save(source: MoviesSourcePreferenceSnapshot): void {
    state = { source, updatedAt: now() };
    kv.set(MOVIES_SOURCE_PREFERENCE_KV_KEY, state);
  }

  function snapshot(): MoviesSourcePreferenceState | null {
    return state;
  }

  return {
    clear,
    dispose: () => kv.dispose(),
    get,
    save,
    snapshot,
  };
}

function coerceMoviesSourcePreferenceState(candidate: unknown): MoviesSourcePreferenceState | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const source = coerceSourcePreferenceSnapshot(candidate.source);
  const updatedAt = normalizedTimestamp(candidate.updatedAt);
  return source === null || updatedAt === null ? null : { source, updatedAt };
}

function coerceSourcePreferenceSnapshot(candidate: unknown): MoviesSourcePreferenceSnapshot | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const source: MoviesSourcePreferenceSnapshot = {
    filename: normalizedString(candidate.filename),
    index: normalizedSourceIndex(candidate.index),
    name: normalizedString(candidate.name),
    serverName: normalizedString(candidate.serverName),
    slug: normalizedString(candidate.slug),
  };

  return source.slug.length === 0 && source.serverName.length === 0 && source.name.length === 0
    ? null
    : source;
}

function normalizedSourceIndex(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizedString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizedTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
