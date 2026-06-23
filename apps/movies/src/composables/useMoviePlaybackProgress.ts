import type { ComputedRef, Ref } from "vue";

import {
  createMoviesPlaybackProgressStore,
  isResumableMoviePlaybackTime,
  moviesPlaybackProgressSourceSnapshot,
} from "../moviesPlaybackProgress";
import type { MoviePlayInfo } from "../moviesApi";

const PROGRESS_PERSIST_INTERVAL_MS = 5000;

interface UseMoviePlaybackProgressOptions {
  readonly currentTime: Ref<number>;
  readonly duration: Ref<number>;
  readonly hasDuration: ComputedRef<boolean>;
  readonly metadataLoaded: Ref<boolean>;
  readonly play: Readonly<Ref<MoviePlayInfo>>;
  readonly progressKey: Readonly<Ref<string>>;
  readonly seekPosition: Ref<number>;
  readonly sourceIndex: Readonly<Ref<number>>;
  readonly syncMediaState: () => void;
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
}

export interface UseMoviePlaybackProgressBindings {
  applySavedPlaybackProgress(): void;
  clearPlaybackProgress(): void;
  disposePlaybackProgress(): void;
  persistPlaybackProgress(options?: { readonly force?: boolean }): void;
  resetPlaybackProgressState(): void;
}

export function useMoviePlaybackProgress({
  currentTime,
  duration,
  hasDuration,
  metadataLoaded,
  play,
  progressKey,
  seekPosition,
  sourceIndex,
  syncMediaState,
  videoElement,
}: UseMoviePlaybackProgressOptions): UseMoviePlaybackProgressBindings {
  const playbackProgressStore = createMoviesPlaybackProgressStore();

  let lastProgressPersistedAtMs = 0;
  let resumeProgressApplied = false;

  function selectedSourceIndex(): number {
    const sources = play.value.sources;
    if (sources.length === 0) {
      return 0;
    }
    const index = sourceIndex.value;
    return Number.isInteger(index) && index >= 0 && index < sources.length ? index : 0;
  }

  function activeSource(): MoviePlayInfo["sources"][number] | null {
    return play.value.sources[selectedSourceIndex()] ?? play.value.sources[0] ?? null;
  }

  function normalizedProgressKey(): string | null {
    const key = progressKey.value.trim();
    return key.length === 0 ? null : key;
  }

  function applySavedPlaybackProgress(): void {
    if (resumeProgressApplied) {
      return;
    }

    resumeProgressApplied = true;

    const key = normalizedProgressKey();
    const video = videoElement.value;
    if (key === null || video === null || !hasDuration.value) {
      return;
    }

    const progress = playbackProgressStore.get(key);
    if (progress === null) {
      return;
    }

    if (!isResumableMoviePlaybackTime(progress.currentTime, duration.value)) {
      playbackProgressStore.clear(key);
      return;
    }

    video.currentTime = progress.currentTime;
    currentTime.value = progress.currentTime;
    seekPosition.value = Math.round(progress.currentTime);
  }

  function persistPlaybackProgress(options: { readonly force?: boolean } = {}): void {
    const key = normalizedProgressKey();
    const video = videoElement.value;
    if (key === null || video === null || !metadataLoaded.value) {
      return;
    }

    const now = Date.now();
    if (!options.force && now - lastProgressPersistedAtMs < PROGRESS_PERSIST_INTERVAL_MS) {
      return;
    }

    syncMediaState();
    const source = activeSource();
    playbackProgressStore.save(key, {
      currentTime: currentTime.value,
      duration: duration.value,
      source:
        source === null
          ? null
          : moviesPlaybackProgressSourceSnapshot(source, selectedSourceIndex()),
    });
    lastProgressPersistedAtMs = now;
  }

  function clearPlaybackProgress(): void {
    const key = normalizedProgressKey();
    if (key !== null) {
      playbackProgressStore.clear(key);
    }
  }

  function resetPlaybackProgressState(): void {
    lastProgressPersistedAtMs = 0;
    resumeProgressApplied = false;
  }

  function disposePlaybackProgress(): void {
    playbackProgressStore.dispose();
  }

  return {
    applySavedPlaybackProgress,
    clearPlaybackProgress,
    disposePlaybackProgress,
    persistPlaybackProgress,
    resetPlaybackProgressState,
  };
}
