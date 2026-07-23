import type { ComputedRef, Ref } from "vue";

import type { MoviePlayInfo } from "../moviesApi";
import type { MoviesWatchContinuity, MoviesWatchTarget } from "../moviesWatchContinuity";

const PROGRESS_PERSIST_INTERVAL_MS = 5000;

interface UseMoviePlaybackProgressOptions {
  readonly currentTime: Ref<number>;
  readonly duration: Ref<number>;
  readonly hasDuration: ComputedRef<boolean>;
  readonly metadataLoaded: Ref<boolean>;
  readonly play: Readonly<Ref<MoviePlayInfo>>;
  readonly seekPosition: Ref<number>;
  readonly sourceIndex: Readonly<Ref<number>>;
  readonly syncMediaState: () => void;
  readonly target: Readonly<Ref<MoviesWatchTarget>>;
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
  readonly watchContinuity: MoviesWatchContinuity;
}

export interface UseMoviePlaybackProgressBindings {
  applySavedPlaybackProgress(): void;
  clearPlaybackProgress(): void;
  persistPlaybackProgress(options?: { readonly force?: boolean }): void;
  resetPlaybackProgressState(): void;
}

export function useMoviePlaybackProgress({
  currentTime,
  duration,
  hasDuration,
  metadataLoaded,
  play,
  seekPosition,
  sourceIndex,
  syncMediaState,
  target,
  videoElement,
  watchContinuity,
}: UseMoviePlaybackProgressOptions): UseMoviePlaybackProgressBindings {
  let lastProgressPersistedAtMs = 0;
  let resumeProgressApplied = false;
  let progressPlay = play.value;
  let progressSourceIndex = sourceIndex.value;
  let progressTarget = target.value;

  function selectedSourceIndex(sourcePlay = progressPlay, index = progressSourceIndex): number {
    const sources = sourcePlay.sources;
    if (sources.length === 0) {
      return 0;
    }
    return Number.isInteger(index) && index >= 0 && index < sources.length ? index : 0;
  }

  function activeSource(
    sourcePlay = progressPlay,
    index = selectedSourceIndex(sourcePlay),
  ): MoviePlayInfo["sources"][number] | null {
    return sourcePlay.sources[index] ?? sourcePlay.sources[0] ?? null;
  }

  function applySavedPlaybackProgress(): void {
    if (resumeProgressApplied) {
      return;
    }

    resumeProgressApplied = true;

    const video = videoElement.value;
    if (video === null || !hasDuration.value) {
      return;
    }

    const progress = watchContinuity.progressFor(progressTarget, {
      duration: duration.value,
    });
    if (progress === null) {
      return;
    }

    video.currentTime = progress.currentTime;
    currentTime.value = progress.currentTime;
    seekPosition.value = Math.round(progress.currentTime);
  }

  function persistPlaybackProgress(options: { readonly force?: boolean } = {}): void {
    const video = videoElement.value;
    if (video === null || !metadataLoaded.value) {
      return;
    }

    const now = Date.now();
    if (!options.force && now - lastProgressPersistedAtMs < PROGRESS_PERSIST_INTERVAL_MS) {
      return;
    }

    syncMediaState();
    const currentTarget = target.value;
    const persistsCurrentTarget = sameWatchTarget(progressTarget, currentTarget);
    const persistedPlay = persistsCurrentTarget ? play.value : progressPlay;
    const persistedSourceIndex = selectedSourceIndex(
      persistedPlay,
      persistsCurrentTarget ? sourceIndex.value : progressSourceIndex,
    );
    const source = activeSource(persistedPlay, persistedSourceIndex);
    watchContinuity.saveProgress(progressTarget, {
      currentTime: currentTime.value,
      duration: duration.value,
      source,
      sourceIndex: persistedSourceIndex,
    });
    lastProgressPersistedAtMs = now;
  }

  function clearPlaybackProgress(): void {
    watchContinuity.complete(progressTarget);
  }

  function resetPlaybackProgressState(): void {
    lastProgressPersistedAtMs = 0;
    resumeProgressApplied = false;
    progressPlay = play.value;
    progressSourceIndex = sourceIndex.value;
    progressTarget = target.value;
  }

  return {
    applySavedPlaybackProgress,
    clearPlaybackProgress,
    persistPlaybackProgress,
    resetPlaybackProgressState,
  };
}

function sameWatchTarget(left: MoviesWatchTarget, right: MoviesWatchTarget): boolean {
  if (left.kind !== right.kind || left.tmdbId !== right.tmdbId) {
    return false;
  }

  return (
    left.kind === "movie" ||
    (right.kind === "episode" &&
      left.seasonNumber === right.seasonNumber &&
      left.episodeNumber === right.episodeNumber)
  );
}
