import type { ComputedRef, Ref } from "vue";

import { clampNumber } from "../utils/number";

const SEEK_STEP_SECONDS = 10;

interface UseMoviePlayerSeekOptions {
  readonly clearHideControlsTimer: () => void;
  readonly controlsHidden: ComputedRef<boolean>;
  readonly controlsVisible: Ref<boolean>;
  readonly currentTime: Ref<number>;
  readonly duration: Ref<number>;
  readonly hasDuration: ComputedRef<boolean>;
  readonly persistPlaybackProgress: (options?: { readonly force?: boolean }) => void;
  readonly playing: Ref<boolean>;
  readonly progressRoot: Readonly<Ref<HTMLElement | null>>;
  readonly scheduleAutoHideControls: () => void;
  readonly seekPointerPreview: Ref<{ leftPx: number; seconds: number } | null>;
  readonly seekPosition: Ref<number>;
  readonly seekPreviewThumbSizePx: number;
  readonly seeking: Ref<boolean>;
  readonly showControls: (options?: { readonly force?: boolean }) => void;
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
}

export interface UseMoviePlayerSeekBindings {
  beginSeekPreview(options?: { readonly preserveHiddenControls?: boolean }): void;
  cancelSeekPreview(): void;
  clearSeekPointerPreview(): void;
  commitSeek(nextValue: number, options?: { readonly preserveHiddenControls?: boolean }): void;
  keyboardSeekDeltaSeconds(key: string): number | null;
  onSeekKeydown(
    event: KeyboardEvent,
    options?: { readonly preserveHiddenControls?: boolean },
  ): void;
  onSeekPointerCancel(): void;
  onSeekPointerDown(event: PointerEvent): void;
  onSeekPointerLeave(): void;
  onSeekPointerMove(event: PointerEvent): void;
  onSeekPointerUp(event: PointerEvent): void;
  previewSeek(nextValue: number): void;
  seekBy(deltaSeconds: number, options?: { readonly preserveHiddenControls?: boolean }): void;
}

export function useMoviePlayerSeek({
  clearHideControlsTimer,
  controlsHidden,
  controlsVisible,
  currentTime,
  duration,
  hasDuration,
  persistPlaybackProgress,
  playing,
  progressRoot,
  scheduleAutoHideControls,
  seekPointerPreview,
  seekPosition,
  seekPreviewThumbSizePx,
  seeking,
  showControls,
  videoElement,
}: UseMoviePlayerSeekOptions): UseMoviePlayerSeekBindings {
  let seekPointerActive = false;

  function shouldPreserveHiddenControls(): boolean {
    return controlsHidden.value && playing.value;
  }

  function beginSeekPreview(options: { readonly preserveHiddenControls?: boolean } = {}): void {
    if (!hasDuration.value) {
      return;
    }

    const preserveHiddenControls =
      options.preserveHiddenControls === true || shouldPreserveHiddenControls();
    seeking.value = true;
    seekPosition.value = Math.round(currentTime.value);
    if (preserveHiddenControls) {
      clearHideControlsTimer();
      return;
    }
    showControls({ force: true });
  }

  function previewSeek(nextValue: number): void {
    if (!hasDuration.value) {
      return;
    }

    seeking.value = true;
    seekPosition.value = Math.round(clampNumber(nextValue, 0, duration.value));
  }

  function commitSeek(
    nextValue: number,
    options: { readonly preserveHiddenControls?: boolean } = {},
  ): void {
    if (!hasDuration.value) {
      seeking.value = false;
      return;
    }

    const video = videoElement.value;
    const nextTime = clampNumber(nextValue, 0, duration.value);
    if (video !== null) {
      video.currentTime = nextTime;
    }

    currentTime.value = nextTime;
    seekPosition.value = Math.round(nextTime);
    seeking.value = false;
    clearSeekPointerPreview();
    persistPlaybackProgress({ force: true });
    if (options.preserveHiddenControls && playing.value) {
      controlsVisible.value = false;
      clearHideControlsTimer();
      return;
    }
    scheduleAutoHideControls();
  }

  function cancelSeekPreview(): void {
    seeking.value = false;
    seekPosition.value = Math.round(currentTime.value);
    clearSeekPointerPreview();
  }

  function seekBy(
    deltaSeconds: number,
    options: { readonly preserveHiddenControls?: boolean } = {},
  ): void {
    if (!hasDuration.value) {
      return;
    }

    commitSeek(currentTime.value + deltaSeconds, options);
  }

  function keyboardSeekDeltaSeconds(key: string): number | null {
    if (key === "ArrowLeft") {
      return -SEEK_STEP_SECONDS;
    }

    if (key === "ArrowRight") {
      return SEEK_STEP_SECONDS;
    }

    return null;
  }

  function onSeekKeydown(
    event: KeyboardEvent,
    options: { readonly preserveHiddenControls?: boolean } = {},
  ): void {
    if (event.key === "Escape") {
      cancelSeekPreview();
      return;
    }

    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "Home" ||
      event.key === "End" ||
      event.key === "PageUp" ||
      event.key === "PageDown"
    ) {
      beginSeekPreview(options);
    }
  }

  function pointerPreviewFromEvent(
    event: PointerEvent,
  ): { leftPx: number; seconds: number } | null {
    if (!hasDuration.value) {
      return null;
    }

    const root = progressRoot.value;
    if (root === null) {
      return null;
    }

    const rect = root.getBoundingClientRect();
    if (rect.width <= seekPreviewThumbSizePx) {
      return null;
    }

    const trackStartPx = seekPreviewThumbSizePx / 2;
    const trackWidthPx = rect.width - seekPreviewThumbSizePx;
    const trackEndPx = trackStartPx + trackWidthPx;
    const pointerX = clampNumber(event.clientX - rect.left, trackStartPx, trackEndPx);
    const fraction = (pointerX - trackStartPx) / trackWidthPx;
    const seconds = Math.round(clampNumber(fraction, 0, 1) * duration.value);

    return { leftPx: pointerX, seconds };
  }

  function updateSeekPointerPreview(event: PointerEvent): void {
    seekPointerPreview.value = pointerPreviewFromEvent(event);
  }

  function clearSeekPointerPreview(): void {
    seekPointerPreview.value = null;
  }

  function previewSeekFromPointer(event: PointerEvent): void {
    const preview = pointerPreviewFromEvent(event);
    seekPointerPreview.value = preview;
    if (preview !== null) {
      previewSeek(preview.seconds);
    }
  }

  function onSeekPointerDown(event: PointerEvent): void {
    seekPointerActive = true;
    beginSeekPreview();
    previewSeekFromPointer(event);
  }

  function onSeekPointerMove(event: PointerEvent): void {
    if (seekPointerActive) {
      previewSeekFromPointer(event);
      return;
    }

    updateSeekPointerPreview(event);
  }

  function onSeekPointerLeave(): void {
    if (!seekPointerActive) {
      clearSeekPointerPreview();
    }
  }

  function onSeekPointerUp(event: PointerEvent): void {
    if (!seekPointerActive) {
      return;
    }

    seekPointerActive = false;
    const preview = pointerPreviewFromEvent(event);
    if (preview === null) {
      cancelSeekPreview();
      return;
    }

    commitSeek(preview.seconds);
  }

  function onSeekPointerCancel(): void {
    seekPointerActive = false;
    cancelSeekPreview();
  }

  return {
    beginSeekPreview,
    cancelSeekPreview,
    clearSeekPointerPreview,
    commitSeek,
    keyboardSeekDeltaSeconds,
    onSeekKeydown,
    onSeekPointerCancel,
    onSeekPointerDown,
    onSeekPointerLeave,
    onSeekPointerMove,
    onSeekPointerUp,
    previewSeek,
    seekBy,
  };
}
