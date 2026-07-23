import type { MoviePlaySource } from "./moviesApi";
import {
  createMoviesPlaybackProgressStore,
  type MoviesPlaybackProgressSourceSnapshot,
} from "./moviesPlaybackProgress";
import {
  createMoviesSourcePreferenceStore,
  moviesSourcePreferenceSnapshot,
  type MoviesSourcePreferenceSnapshot,
} from "./moviesSourcePreference";

type MoviesSourceIdentity = MoviesPlaybackProgressSourceSnapshot | MoviesSourcePreferenceSnapshot;

/** In-memory source choice carried by related watch views, never serialized into the public URL. */
export interface MoviesSourceSelectionSession {
  preference: MoviesSourcePreferenceSnapshot | null;
}

export interface MoviesSourceSelection {
  dispose(): void;
  restore(progressKey: string, sources: readonly MoviePlaySource[]): number;
  select(sources: readonly MoviePlaySource[], index: number): number;
  readonly session: MoviesSourceSelectionSession;
}

export function createMoviesSourceSelectionSession(): MoviesSourceSelectionSession {
  return { preference: null };
}

export function createMoviesSourceSelection(
  session: MoviesSourceSelectionSession = createMoviesSourceSelectionSession(),
): MoviesSourceSelection {
  const playbackProgressStore = createMoviesPlaybackProgressStore();
  const sourcePreferenceStore = createMoviesSourcePreferenceStore();

  function restore(progressKey: string, sources: readonly MoviePlaySource[]): number {
    const progress = playbackProgressStore.get(progressKey);
    const savedSource = session.preference ?? progress?.source ?? sourcePreferenceStore.get();
    return resolveSourceIndex(savedSource, sources);
  }

  function select(sources: readonly MoviePlaySource[], index: number): number {
    const selectedIndex = normalizedSourceIndex(index, sources.length);
    const source = sources[selectedIndex];
    if (source === undefined) {
      session.preference = null;
      return 0;
    }

    session.preference = moviesSourcePreferenceSnapshot(source, selectedIndex);
    sourcePreferenceStore.save(session.preference);
    return selectedIndex;
  }

  function dispose(): void {
    playbackProgressStore.dispose();
    sourcePreferenceStore.dispose();
  }

  return {
    dispose,
    restore,
    select,
    session,
  };
}

function resolveSourceIndex(
  savedSource: MoviesSourceIdentity | null | undefined,
  sources: readonly MoviePlaySource[],
): number {
  if (savedSource === null || savedSource === undefined || sources.length === 0) {
    return 0;
  }

  if ("m3u8Url" in savedSource && savedSource.m3u8Url.length > 0) {
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

function normalizedSourceIndex(index: number, sourceCount: number): number {
  return Number.isSafeInteger(index) && index >= 0 && index < sourceCount ? index : 0;
}

function sourceIndexBy(
  sources: readonly MoviePlaySource[],
  predicate: (source: MoviePlaySource) => boolean,
): number | null {
  const index = sources.findIndex(predicate);
  return index === -1 ? null : index;
}
