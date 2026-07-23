import { activeProfileKvNamespace, KVStore } from "@daopk/sdk";

import type { MoviePlaySource } from "./moviesApi";

const MOVIES_KV_NAMESPACE = "movies";
const PLAYBACK_PROGRESS_KV_KEY = "playback-progress";
const SOURCE_PREFERENCE_KV_KEY = "source-preference";
const MIN_RESUME_SECONDS = 5;
const NEAR_END_SECONDS = 15;
const MAX_PROGRESS_AGE_MS = 1000 * 60 * 60 * 24 * 180;
const MAX_PROGRESS_ENTRIES = 200;

export type MoviesWatchTarget =
  | {
      readonly kind: "movie";
      readonly slug: string;
      readonly title?: string;
      readonly tmdbId: number;
    }
  | {
      readonly episodeNumber: number;
      readonly kind: "episode";
      readonly seasonNumber: number;
      readonly slug: string;
      readonly title?: string;
      readonly tmdbId: number;
    };

export interface MoviesWatchProgress {
  readonly currentTime: number;
  readonly duration: number;
  readonly updatedAt: number;
}

export interface MoviesContinueWatchingRecord {
  readonly progress: MoviesWatchProgress;
  readonly target: MoviesWatchTarget;
}

export interface MoviesWatchContinuity {
  complete(target: MoviesWatchTarget): void;
  continueWatching(options?: { readonly limit?: number }): readonly MoviesContinueWatchingRecord[];
  dispose(): void;
  progressFor(
    target: MoviesWatchTarget,
    options?: { readonly duration?: number },
  ): MoviesWatchProgress | null;
  removeFromContinueWatching(target: MoviesWatchTarget): void;
  restoreSource(target: MoviesWatchTarget, sources: readonly MoviePlaySource[]): number;
  saveProgress(
    target: MoviesWatchTarget,
    progress: {
      readonly currentTime: number;
      readonly duration: number;
      readonly source?: MoviePlaySource | null;
      readonly sourceIndex?: number;
    },
  ): void;
  selectSource(
    target: MoviesWatchTarget,
    sources: readonly MoviePlaySource[],
    index: number,
  ): number;
}

export interface CreateMoviesWatchContinuityOptions {
  readonly now?: () => number;
  readonly storageNamespace?: string;
}

interface StoredSourceIdentity {
  readonly filename: string;
  readonly index: number;
  readonly m3u8Url?: string;
  readonly name: string;
  readonly serverName: string;
  readonly slug: string;
}

interface StoredProgressEntry extends MoviesWatchProgress {
  readonly source?: StoredSourceIdentity;
}

interface StoredProgressState {
  readonly entries: Record<string, StoredProgressEntry>;
}

interface StoredSourcePreferenceState {
  readonly source: StoredSourceIdentity;
  readonly updatedAt: number;
}

interface CoerceProgressResult {
  readonly changed: boolean;
  readonly state: StoredProgressState;
}

const EMPTY_PROGRESS_STATE: StoredProgressState = { entries: {} };

export function createMoviesWatchContinuity(
  options: CreateMoviesWatchContinuityOptions = {},
): MoviesWatchContinuity {
  const now = options.now ?? (() => Date.now());
  const namespace = options.storageNamespace ?? activeProfileKvNamespace(MOVIES_KV_NAMESPACE);
  let progressState = EMPTY_PROGRESS_STATE;
  let sourcePreference: StoredSourcePreferenceState | null = null;
  const progressKv = new KVStore<StoredProgressState>(namespace, {
    onRemoteChange: () => {
      syncProgressFromKv();
    },
    version: 1,
  });
  const sourcePreferenceKv = new KVStore<StoredSourcePreferenceState>(namespace, {
    onRemoteChange: () => {
      syncSourcePreferenceFromKv();
    },
    version: 1,
  });
  const loadedProgress = syncProgressFromKv();
  syncSourcePreferenceFromKv();
  const sessionSourcePreferences = new Map<string, StoredSourceIdentity>();

  if (loadedProgress.changed) {
    writeProgress(loadedProgress.state);
  }
  if (sourcePreference === null && sourcePreferenceKv.has(SOURCE_PREFERENCE_KV_KEY)) {
    sourcePreferenceKv.remove(SOURCE_PREFERENCE_KV_KEY);
  }

  function syncProgressFromKv(): CoerceProgressResult {
    const loaded = coerceProgressState(progressKv.get(PLAYBACK_PROGRESS_KV_KEY), now());
    progressState = loaded.state;
    return loaded;
  }

  function syncSourcePreferenceFromKv(): void {
    sourcePreference = coerceSourcePreferenceState(
      sourcePreferenceKv.get(SOURCE_PREFERENCE_KV_KEY),
    );
  }

  function writeProgress(nextState: StoredProgressState): void {
    progressState = pruneProgress(nextState, now());
    progressKv.set(PLAYBACK_PROGRESS_KV_KEY, progressState);
  }

  function clearProgress(target: MoviesWatchTarget): void {
    syncProgressFromKv();
    const key = targetKey(target);
    if (!(key in progressState.entries)) {
      return;
    }

    const entries = { ...progressState.entries };
    delete entries[key];
    writeProgress({ entries });
  }

  function storedProgressFor(target: MoviesWatchTarget): StoredProgressEntry | null {
    syncProgressFromKv();
    const key = targetKey(target);
    const entry = progressState.entries[key];
    if (entry === undefined) {
      return null;
    }

    if (!isValidStoredProgress(entry, now())) {
      clearProgress(target);
      return null;
    }

    return entry;
  }

  function progressFor(
    target: MoviesWatchTarget,
    progressOptions: { readonly duration?: number } = {},
  ): MoviesWatchProgress | null {
    const progress = storedProgressFor(target);
    if (progress === null) {
      return null;
    }

    if (
      progressOptions.duration !== undefined &&
      !isResumableTime(progress.currentTime, progressOptions.duration)
    ) {
      clearProgress(target);
      return null;
    }

    return publicProgress(progress);
  }

  function saveProgress(
    target: MoviesWatchTarget,
    progress: {
      readonly currentTime: number;
      readonly duration: number;
      readonly source?: MoviePlaySource | null;
      readonly sourceIndex?: number;
    },
  ): void {
    const currentTime = normalizedMediaTime(progress.currentTime);
    const duration = normalizedMediaTime(progress.duration);
    if (!isResumableTime(currentTime, duration)) {
      clearProgress(target);
      return;
    }

    const source =
      progress.source === undefined || progress.source === null
        ? null
        : sourceIdentity(progress.source, progress.sourceIndex ?? 0, true);
    const entries = syncProgressFromKv().state.entries;
    writeProgress({
      entries: {
        ...entries,
        [targetKey(target)]: {
          currentTime,
          duration,
          ...(source === null ? {} : { source }),
          updatedAt: now(),
        },
      },
    });
  }

  function continueWatching(
    continueOptions: { readonly limit?: number } = {},
  ): readonly MoviesContinueWatchingRecord[] {
    syncProgressFromKv();
    const limit =
      continueOptions.limit === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Math.floor(continueOptions.limit));

    return Object.entries(progressState.entries)
      .map(([key, progress]) => {
        const target = targetFromKey(key);
        return target === null ? null : { progress: publicProgress(progress), target };
      })
      .filter((record): record is MoviesContinueWatchingRecord => record !== null)
      .sort((left, right) => right.progress.updatedAt - left.progress.updatedAt)
      .slice(0, limit);
  }

  function removeFromContinueWatching(target: MoviesWatchTarget): void {
    syncProgressFromKv();
    const group = targetGroupKey(target);
    const entries = Object.fromEntries(
      Object.entries(progressState.entries).filter(([key]) => {
        const storedTarget = targetFromKey(key);
        return storedTarget === null || targetGroupKey(storedTarget) !== group;
      }),
    );
    if (Object.keys(entries).length === Object.keys(progressState.entries).length) {
      return;
    }

    writeProgress({ entries });
  }

  function restoreSource(target: MoviesWatchTarget, sources: readonly MoviePlaySource[]): number {
    const progress = storedProgressFor(target);
    syncSourcePreferenceFromKv();
    const savedSource =
      sessionSourcePreferences.get(targetGroupKey(target)) ??
      progress?.source ??
      sourcePreference?.source;
    return resolveSourceIndex(savedSource, sources);
  }

  function selectSource(
    target: MoviesWatchTarget,
    sources: readonly MoviePlaySource[],
    index: number,
  ): number {
    const selectedIndex = normalizedSourceIndex(index, sources.length);
    const source = sources[selectedIndex];
    if (source === undefined) {
      sessionSourcePreferences.delete(targetGroupKey(target));
      return 0;
    }

    const selectedSource = sourceIdentity(source, selectedIndex, false);
    sessionSourcePreferences.set(targetGroupKey(target), selectedSource);
    sourcePreference = {
      source: selectedSource,
      updatedAt: now(),
    };
    sourcePreferenceKv.set(SOURCE_PREFERENCE_KV_KEY, sourcePreference);
    return selectedIndex;
  }

  return {
    complete: clearProgress,
    continueWatching,
    dispose: () => {
      progressKv.dispose();
      sourcePreferenceKv.dispose();
    },
    progressFor,
    removeFromContinueWatching,
    restoreSource,
    saveProgress,
    selectSource,
  };
}

function targetKey(target: MoviesWatchTarget): string {
  return target.kind === "movie"
    ? `movie:${target.tmdbId}`
    : `tv:${target.tmdbId}:s${target.seasonNumber}:e${target.episodeNumber}`;
}

function targetGroupKey(target: MoviesWatchTarget): string {
  return target.kind === "movie" ? `movie:${target.tmdbId}` : `tv:${target.tmdbId}`;
}

function targetFromKey(key: string): MoviesWatchTarget | null {
  const movieMatch = /^movie:([1-9]\d*)$/.exec(key);
  if (movieMatch !== null) {
    const tmdbId = positiveSafeInteger(movieMatch[1]);
    return tmdbId === null ? null : { kind: "movie", slug: `tmdb-${tmdbId}`, tmdbId };
  }

  const episodeMatch = /^tv:([1-9]\d*):s(0|[1-9]\d*):e([1-9]\d*)$/.exec(key);
  if (episodeMatch === null) {
    return null;
  }

  const tmdbId = positiveSafeInteger(episodeMatch[1]);
  const seasonNumber = nonNegativeSafeInteger(episodeMatch[2]);
  const episodeNumber = positiveSafeInteger(episodeMatch[3]);
  return tmdbId === null || seasonNumber === null || episodeNumber === null
    ? null
    : {
        episodeNumber,
        kind: "episode",
        seasonNumber,
        slug: `tmdb-${tmdbId}`,
        tmdbId,
      };
}

function publicProgress(progress: StoredProgressEntry): MoviesWatchProgress {
  return {
    currentTime: progress.currentTime,
    duration: progress.duration,
    updatedAt: progress.updatedAt,
  };
}

function sourceIdentity(
  source: MoviePlaySource,
  index: number,
  includeStreamUrl: boolean,
): StoredSourceIdentity {
  return {
    filename: source.filename,
    index: normalizedStoredSourceIndex(index),
    ...(includeStreamUrl ? { m3u8Url: source.m3u8Url } : {}),
    name: source.name,
    serverName: source.serverName,
    slug: source.slug,
  };
}

function resolveSourceIndex(
  savedSource: StoredSourceIdentity | null | undefined,
  sources: readonly MoviePlaySource[],
): number {
  if (savedSource === null || savedSource === undefined || sources.length === 0) {
    return 0;
  }

  if (savedSource.m3u8Url !== undefined && savedSource.m3u8Url.length > 0) {
    const streamMatch = sourceIndexBy(sources, (source) => source.m3u8Url === savedSource.m3u8Url);
    if (streamMatch !== null) {
      return streamMatch;
    }
  }

  const slugServerMatch = sourceIndexBy(
    sources,
    (source) =>
      savedSource.slug.length > 0 &&
      source.slug === savedSource.slug &&
      source.serverName === savedSource.serverName,
  );
  if (slugServerMatch !== null) {
    return slugServerMatch;
  }

  const serverNameMatch = sourceIndexBy(
    sources,
    (source) =>
      savedSource.serverName.length > 0 &&
      savedSource.name.length > 0 &&
      source.serverName === savedSource.serverName &&
      source.name === savedSource.name,
  );
  if (serverNameMatch !== null) {
    return serverNameMatch;
  }

  const serverOnlyMatch = sourceIndexBy(
    sources,
    (source) => savedSource.serverName.length > 0 && source.serverName === savedSource.serverName,
  );
  if (serverOnlyMatch !== null) {
    return serverOnlyMatch;
  }

  const slugMatch = sourceIndexBy(
    sources,
    (source) => savedSource.slug.length > 0 && source.slug === savedSource.slug,
  );
  return slugMatch ?? 0;
}

function coerceProgressState(candidate: unknown, nowMs: number): CoerceProgressResult {
  if (!isRecord(candidate) || !isRecord(candidate.entries)) {
    return { changed: candidate !== null, state: EMPTY_PROGRESS_STATE };
  }

  let changed = false;
  const entries: Record<string, StoredProgressEntry> = {};

  for (const [key, value] of Object.entries(candidate.entries)) {
    const entry = coerceProgressEntry(value);
    if (targetFromKey(key) === null || entry === null || !isValidStoredProgress(entry, nowMs)) {
      changed = true;
      continue;
    }
    entries[key] = entry;
  }

  const pruned = pruneProgress({ entries }, nowMs);
  changed ||= Object.keys(pruned.entries).length !== Object.keys(entries).length;
  return { changed, state: pruned };
}

function coerceProgressEntry(candidate: unknown): StoredProgressEntry | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const currentTime = normalizedMediaTime(candidate.currentTime);
  const duration = normalizedMediaTime(candidate.duration);
  const source = coerceSourceIdentity(candidate.source);
  const updatedAt = normalizedTimestamp(candidate.updatedAt);
  if (updatedAt === null) {
    return null;
  }

  return source === null
    ? { currentTime, duration, updatedAt }
    : { currentTime, duration, source, updatedAt };
}

function coerceSourcePreferenceState(candidate: unknown): StoredSourcePreferenceState | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const source = coerceSourceIdentity(candidate.source);
  const updatedAt = normalizedTimestamp(candidate.updatedAt);
  return source === null || updatedAt === null ? null : { source, updatedAt };
}

function coerceSourceIdentity(candidate: unknown): StoredSourceIdentity | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const m3u8Url = normalizedString(candidate.m3u8Url);
  const source: StoredSourceIdentity = {
    filename: normalizedString(candidate.filename),
    index: normalizedStoredSourceIndex(candidate.index),
    ...(m3u8Url.length === 0 ? {} : { m3u8Url }),
    name: normalizedString(candidate.name),
    serverName: normalizedString(candidate.serverName),
    slug: normalizedString(candidate.slug),
  };

  return source.m3u8Url === undefined &&
    source.slug.length === 0 &&
    source.serverName.length === 0 &&
    source.name.length === 0
    ? null
    : source;
}

function pruneProgress(state: StoredProgressState, nowMs: number): StoredProgressState {
  const entries = Object.entries(state.entries)
    .filter(([, entry]) => isValidStoredProgress(entry, nowMs))
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_PROGRESS_ENTRIES);
  return { entries: Object.fromEntries(entries) };
}

function isValidStoredProgress(progress: StoredProgressEntry, nowMs: number): boolean {
  return (
    isResumableTime(progress.currentTime, progress.duration) &&
    progress.updatedAt > 0 &&
    nowMs - progress.updatedAt <= MAX_PROGRESS_AGE_MS
  );
}

function isResumableTime(currentTime: number, duration: number): boolean {
  return (
    Number.isFinite(currentTime) &&
    Number.isFinite(duration) &&
    currentTime >= MIN_RESUME_SECONDS &&
    duration > 0 &&
    duration - currentTime > NEAR_END_SECONDS
  );
}

function normalizedMediaTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizedTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizedStoredSourceIndex(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizedSourceIndex(index: number, sourceCount: number): number {
  return Number.isSafeInteger(index) && index >= 0 && index < sourceCount ? index : 0;
}

function normalizedString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sourceIndexBy(
  sources: readonly MoviePlaySource[],
  predicate: (source: MoviePlaySource) => boolean,
): number | null {
  const index = sources.findIndex(predicate);
  return index === -1 ? null : index;
}

function positiveSafeInteger(value: string | undefined): number | null {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeSafeInteger(value: string | undefined): number | null {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
