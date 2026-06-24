import { computed, ref, type ComputedRef, type Ref } from "vue";

export const MOVIE_PLAYBACK_SPEED_OPTIONS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface UseMoviePlaybackStateOptions {
  readonly emitPlaybackSpeed: (speed: number) => void;
  readonly initialPlaybackSpeed: number;
  readonly showControls: (options?: { readonly force?: boolean }) => void;
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
}

export interface UseMoviePlaybackStateBindings {
  readonly muted: Ref<boolean>;
  readonly mutedOrSilent: ComputedRef<boolean>;
  readonly playbackSpeed: Ref<number>;
  readonly volume: Ref<number>;
  readonly volumeSliderValue: ComputedRef<number>;
  applyPlaybackSpeed(video: HTMLVideoElement | null): void;
  setPlaybackSpeed(nextSpeed: number): void;
  setVolume(nextVolume: number): void;
  setVolumeFromSlider(nextValue: number): void;
  syncVolumeState(video: HTMLVideoElement): void;
  toggleMute(): void;
}

export function safeMediaNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function normalizedMoviePlaybackSpeed(value: number): number {
  return MOVIE_PLAYBACK_SPEED_OPTIONS.includes(value) ? value : 1;
}

export function moviePlaybackSpeedLabel(speed: number): string {
  return `${speed}x`;
}

export function useMoviePlaybackState({
  emitPlaybackSpeed,
  initialPlaybackSpeed,
  showControls,
  videoElement,
}: UseMoviePlaybackStateOptions): UseMoviePlaybackStateBindings {
  const volume = ref(1);
  const previousVolume = ref(1);
  const muted = ref(false);
  const playbackSpeed = ref(normalizedMoviePlaybackSpeed(initialPlaybackSpeed));

  const volumeSliderValue = computed(() => Math.round(volume.value * 100));
  const mutedOrSilent = computed(() => muted.value || volume.value <= 0);

  function setVolumeFromSlider(nextValue: number): void {
    setVolume(nextValue / 100);
  }

  function setVolume(nextVolume: number): void {
    const video = videoElement.value;
    const normalized = clamp(nextVolume, 0, 1);
    volume.value = normalized;
    if (normalized > 0) {
      previousVolume.value = normalized;
      muted.value = false;
    }
    if (video !== null) {
      video.volume = normalized;
      video.muted = normalized === 0 ? true : muted.value;
    }
    if (normalized === 0) {
      muted.value = true;
    }
    showControls({ force: true });
  }

  function toggleMute(): void {
    const video = videoElement.value;
    const nextMuted = !mutedOrSilent.value;

    if (nextMuted) {
      previousVolume.value = volume.value > 0 ? volume.value : previousVolume.value;
      muted.value = true;
      if (video !== null) {
        video.muted = true;
      }
    } else {
      const restoredVolume = volume.value > 0 ? volume.value : previousVolume.value || 1;
      muted.value = false;
      volume.value = restoredVolume;
      if (video !== null) {
        video.muted = false;
        video.volume = restoredVolume;
      }
    }

    showControls({ force: true });
  }

  function setPlaybackSpeed(nextSpeed: number): void {
    const speed = normalizedMoviePlaybackSpeed(nextSpeed);
    playbackSpeed.value = speed;
    applyPlaybackSpeed(videoElement.value);
    emitPlaybackSpeed(speed);
    showControls({ force: true });
  }

  function applyPlaybackSpeed(video: HTMLVideoElement | null): void {
    if (video !== null) {
      video.defaultPlaybackRate = playbackSpeed.value;
      video.playbackRate = playbackSpeed.value;
    }
  }

  function syncVolumeState(video: HTMLVideoElement): void {
    muted.value = video.muted;
    volume.value = clamp(video.volume, 0, 1);
  }

  return {
    muted,
    mutedOrSilent,
    playbackSpeed,
    volume,
    volumeSliderValue,
    applyPlaybackSpeed,
    setPlaybackSpeed,
    setVolume,
    setVolumeFromSlider,
    syncVolumeState,
    toggleMute,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
