import type { Ref } from "vue";

import { safeMediaNumber } from "./useMoviePlaybackState";

const MAX_ASPECT_RATIO_PRECISION = 6;

interface UseMoviePlayerMediaStateOptions {
  readonly bufferedEnd: Ref<number>;
  readonly currentTime: Ref<number>;
  readonly duration: Ref<number>;
  readonly playerShell: Readonly<Ref<HTMLElement | null>>;
  readonly seeking: Ref<boolean>;
  readonly seekPosition: Ref<number>;
  readonly syncVolumeState: (video: HTMLVideoElement) => void;
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
}

export interface UseMoviePlayerMediaStateBindings {
  resetVideoAspectRatio(): void;
  syncMediaState(): void;
  syncVideoAspectRatio(): void;
  updateBufferedEnd(): void;
}

export function useMoviePlayerMediaState({
  bufferedEnd,
  currentTime,
  duration,
  playerShell,
  seeking,
  seekPosition,
  syncVolumeState,
  videoElement,
}: UseMoviePlayerMediaStateOptions): UseMoviePlayerMediaStateBindings {
  function syncMediaState(): void {
    const video = videoElement.value;
    if (video === null) {
      return;
    }

    currentTime.value = safeMediaNumber(video.currentTime);
    duration.value = safeMediaNumber(video.duration);
    syncVolumeState(video);
    updateBufferedEnd();

    if (!seeking.value) {
      seekPosition.value = Math.round(currentTime.value);
    }
  }

  function updateBufferedEnd(): void {
    const video = videoElement.value;
    if (video === null) {
      bufferedEnd.value = 0;
      return;
    }

    const buffered = video.buffered;
    if (buffered.length === 0) {
      bufferedEnd.value = 0;
      return;
    }

    bufferedEnd.value = safeMediaNumber(buffered.end(buffered.length - 1));
  }

  function syncVideoAspectRatio(): void {
    const stage = playerShell.value;
    const video = videoElement.value;
    if (stage === null || video === null) {
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      resetVideoAspectRatio();
      return;
    }

    stage.style.setProperty("--movies-player-stage-aspect-ratio", `${width} / ${height}`);
    stage.style.setProperty(
      "--movies-player-stage-aspect-ratio-value",
      String(Number((width / height).toFixed(MAX_ASPECT_RATIO_PRECISION))),
    );
  }

  function resetVideoAspectRatio(): void {
    const stage = playerShell.value;
    if (stage === null) {
      return;
    }

    stage.style.removeProperty("--movies-player-stage-aspect-ratio");
    stage.style.removeProperty("--movies-player-stage-aspect-ratio-value");
  }

  return {
    resetVideoAspectRatio,
    syncMediaState,
    syncVideoAspectRatio,
    updateBufferedEnd,
  };
}
