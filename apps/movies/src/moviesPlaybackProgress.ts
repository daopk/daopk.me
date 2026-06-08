import { activeProfileKvNamespace, KVStore } from "@daopk/sdk";

export const MOVIES_PLAYBACK_PROGRESS_KV_NAMESPACE = "movies";
export const MOVIES_PLAYBACK_PROGRESS_KV_KEY = "playback-progress";
export const MOVIES_PLAYBACK_PROGRESS_MIN_RESUME_SECONDS = 5;
export const MOVIES_PLAYBACK_PROGRESS_NEAR_END_SECONDS = 15;

const MOVIES_PLAYBACK_PROGRESS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180;
const MOVIES_PLAYBACK_PROGRESS_MAX_ENTRIES = 200;

export interface MoviesPlaybackProgressEntry {
  readonly currentTime: number;
  readonly duration: number;
  readonly updatedAt: number;
}

export interface MoviesPlaybackProgressState {
  readonly entries: Record<string, MoviesPlaybackProgressEntry>;
}

export interface CreateMoviesPlaybackProgressStoreOptions {
  readonly now?: () => number;
  readonly storageNamespace?: string;
}

interface CoerceResult {
  readonly changed: boolean;
  readonly state: MoviesPlaybackProgressState;
}

const EMPTY_STATE: MoviesPlaybackProgressState = { entries: {} };

export function moviePlaybackProgressKey(tmdbId: number): string {
  return `movie:${tmdbId}`;
}

export function episodePlaybackProgressKey(
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): string {
  return `tv:${tmdbId}:s${seasonNumber}:e${episodeNumber}`;
}

export function isResumableMoviePlaybackTime(currentTime: number, duration: number): boolean {
  return (
    Number.isFinite(currentTime) &&
    Number.isFinite(duration) &&
    currentTime >= MOVIES_PLAYBACK_PROGRESS_MIN_RESUME_SECONDS &&
    duration > 0 &&
    duration - currentTime > MOVIES_PLAYBACK_PROGRESS_NEAR_END_SECONDS
  );
}

export function createMoviesPlaybackProgressStore(
  options: CreateMoviesPlaybackProgressStoreOptions = {},
): {
  clear: (key: string) => void;
  dispose: () => void;
  get: (key: string) => MoviesPlaybackProgressEntry | null;
  save: (key: string, progress: { currentTime: number; duration: number }) => void;
  snapshot: () => MoviesPlaybackProgressState;
} {
  const now = options.now ?? (() => Date.now());
  const kv = new KVStore<MoviesPlaybackProgressState>(
    options.storageNamespace ?? activeProfileKvNamespace(MOVIES_PLAYBACK_PROGRESS_KV_NAMESPACE),
    { version: 1 },
  );
  const loaded = coerceMoviesPlaybackProgress(kv.get(MOVIES_PLAYBACK_PROGRESS_KV_KEY), now());
  let state = loaded.state;

  if (loaded.changed) {
    persist();
  }

  function persist(): void {
    state = pruneMoviesPlaybackProgress(state, now());
    kv.set(MOVIES_PLAYBACK_PROGRESS_KV_KEY, state);
  }

  function snapshot(): MoviesPlaybackProgressState {
    return {
      entries: { ...state.entries },
    };
  }

  function get(key: string): MoviesPlaybackProgressEntry | null {
    const entry = state.entries[key];
    if (entry === undefined) {
      return null;
    }

    if (!isValidProgressEntry(entry, now())) {
      clear(key);
      return null;
    }

    return entry;
  }

  function save(key: string, progress: { currentTime: number; duration: number }): void {
    const currentTime = normalizedMediaTime(progress.currentTime);
    const duration = normalizedMediaTime(progress.duration);

    if (!isResumableMoviePlaybackTime(currentTime, duration)) {
      clear(key);
      return;
    }

    state = {
      entries: {
        ...state.entries,
        [key]: {
          currentTime,
          duration,
          updatedAt: now(),
        },
      },
    };
    persist();
  }

  function clear(key: string): void {
    if (!(key in state.entries)) {
      return;
    }

    const entries = { ...state.entries };
    delete entries[key];
    state = { entries };
    persist();
  }

  return {
    clear,
    dispose: () => kv.dispose(),
    get,
    save,
    snapshot,
  };
}

export function coerceMoviesPlaybackProgress(candidate: unknown, nowMs = Date.now()): CoerceResult {
  if (!isRecord(candidate) || !isRecord(candidate.entries)) {
    return { changed: candidate !== null, state: EMPTY_STATE };
  }

  let changed = false;
  const entries: Record<string, MoviesPlaybackProgressEntry> = {};

  for (const [key, value] of Object.entries(candidate.entries)) {
    const entry = coerceProgressEntry(value);
    if (entry === null || !isValidProgressEntry(entry, nowMs)) {
      changed = true;
      continue;
    }

    entries[key] = entry;
  }

  const pruned = pruneMoviesPlaybackProgress({ entries }, nowMs);
  changed ||= Object.keys(pruned.entries).length !== Object.keys(entries).length;

  return { changed, state: pruned };
}

function coerceProgressEntry(candidate: unknown): MoviesPlaybackProgressEntry | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const currentTime = normalizedMediaTime(candidate.currentTime);
  const duration = normalizedMediaTime(candidate.duration);
  const updatedAt = normalizedTimestamp(candidate.updatedAt);

  if (updatedAt === null) {
    return null;
  }

  return { currentTime, duration, updatedAt };
}

function pruneMoviesPlaybackProgress(
  state: MoviesPlaybackProgressState,
  nowMs: number,
): MoviesPlaybackProgressState {
  const entries = Object.entries(state.entries)
    .filter(([, entry]) => isValidProgressEntry(entry, nowMs))
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, MOVIES_PLAYBACK_PROGRESS_MAX_ENTRIES);

  return { entries: Object.fromEntries(entries) };
}

function isValidProgressEntry(entry: MoviesPlaybackProgressEntry, nowMs: number): boolean {
  return (
    isResumableMoviePlaybackTime(entry.currentTime, entry.duration) &&
    entry.updatedAt > 0 &&
    nowMs - entry.updatedAt <= MOVIES_PLAYBACK_PROGRESS_MAX_AGE_MS
  );
}

function normalizedMediaTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizedTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
