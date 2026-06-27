import type { Ref } from "vue";

import type { MoviePlaybackErrorKey } from "./useMovieHlsSource";

interface UseMoviePlayerMediaEventsOptions {
  readonly applyPlaybackSpeed: (video: HTMLVideoElement | null) => void;
  readonly applySavedPlaybackProgress: () => void;
  readonly clearControlsRevealSuppression: () => void;
  readonly clearHideControlsTimer: () => void;
  readonly clearPlaybackProgress: () => void;
  readonly controlsVisible: Ref<boolean>;
  readonly metadataLoaded: Ref<boolean>;
  readonly persistPlaybackProgress: (options?: { readonly force?: boolean }) => void;
  readonly playing: Ref<boolean>;
  readonly scheduleAutoHideControls: () => void;
  readonly setPlaybackError: (key: MoviePlaybackErrorKey) => void;
  readonly showControls: (options?: { readonly force?: boolean }) => void;
  readonly syncMediaState: () => void;
  readonly syncVideoAspectRatio: () => void;
  readonly updateBufferedEnd: () => void;
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
  readonly waiting: Ref<boolean>;
}

export interface UseMoviePlayerMediaEventsBindings {
  onLoadedMetadata(): void;
  onProgress(): void;
  onTimeUpdate(): void;
  onVideoCanPlay(): void;
  onVideoEnded(): void;
  onVideoError(): void;
  onVideoPause(): void;
  onVideoPlay(): void;
  onVideoWaiting(): void;
}

export function useMoviePlayerMediaEvents({
  applyPlaybackSpeed,
  applySavedPlaybackProgress,
  clearControlsRevealSuppression,
  clearHideControlsTimer,
  clearPlaybackProgress,
  controlsVisible,
  metadataLoaded,
  persistPlaybackProgress,
  playing,
  scheduleAutoHideControls,
  setPlaybackError,
  showControls,
  syncMediaState,
  syncVideoAspectRatio,
  updateBufferedEnd,
  videoElement,
  waiting,
}: UseMoviePlayerMediaEventsOptions): UseMoviePlayerMediaEventsBindings {
  function onLoadedMetadata(): void {
    metadataLoaded.value = true;
    applyPlaybackSpeed(videoElement.value);
    syncVideoAspectRatio();
    syncMediaState();
    applySavedPlaybackProgress();
  }

  function onTimeUpdate(): void {
    syncMediaState();
    persistPlaybackProgress();
  }

  function onProgress(): void {
    updateBufferedEnd();
  }

  function onVideoPlay(): void {
    applyPlaybackSpeed(videoElement.value);
    playing.value = true;
    waiting.value = false;
    scheduleAutoHideControls();
  }

  function onVideoPause(): void {
    playing.value = false;
    waiting.value = false;
    clearControlsRevealSuppression();
    controlsVisible.value = true;
    clearHideControlsTimer();
    syncMediaState();
    persistPlaybackProgress({ force: true });
  }

  function onVideoWaiting(): void {
    waiting.value = true;
    showControls();
  }

  function onVideoCanPlay(): void {
    applyPlaybackSpeed(videoElement.value);
    waiting.value = false;
    clearControlsRevealSuppression();
    syncMediaState();
  }

  function onVideoEnded(): void {
    playing.value = false;
    waiting.value = false;
    clearControlsRevealSuppression();
    controlsVisible.value = true;
    clearHideControlsTimer();
    syncMediaState();
    clearPlaybackProgress();
  }

  function onVideoError(): void {
    setPlaybackError("movies.player.error.streamFailed");
    waiting.value = false;
    clearControlsRevealSuppression();
    showControls({ force: true });
  }

  return {
    onLoadedMetadata,
    onProgress,
    onTimeUpdate,
    onVideoCanPlay,
    onVideoEnded,
    onVideoError,
    onVideoPause,
    onVideoPlay,
    onVideoWaiting,
  };
}
