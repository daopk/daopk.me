import type { ComputedRef, Ref } from "vue";

interface PreserveHiddenControlsOptions {
  readonly preserveHiddenControls?: boolean;
}

interface UseMoviePlayerKeyboardShortcutsOptions {
  readonly cancelSeekPreview: () => void;
  readonly controlsHidden: ComputedRef<boolean>;
  readonly exitFallbackFullscreen: () => void;
  readonly fallbackFullscreen: Ref<boolean>;
  readonly keyboardSeekDeltaSeconds: (key: string) => number | null;
  readonly onSeekKeydownBase: (
    event: KeyboardEvent,
    options?: PreserveHiddenControlsOptions,
  ) => void;
  readonly playerControlsContain: (target: EventTarget | null) => boolean;
  readonly playing: Ref<boolean>;
  readonly seekBy: (deltaSeconds: number, options?: PreserveHiddenControlsOptions) => void;
  readonly setVolume: (nextVolume: number) => void;
  readonly suppressControlsRevealForKeyboardSeek: () => void;
  readonly toggleFullscreen: () => Promise<void>;
  readonly toggleMute: () => void;
  readonly togglePlayback: () => void;
  readonly volume: Ref<number>;
}

export interface UseMoviePlayerKeyboardShortcutsBindings {
  handleAppKeydown(event: KeyboardEvent): void;
  onSeekKeydown(event: KeyboardEvent): void;
  onStageKeydown(event: KeyboardEvent): void;
  onStageKeydownCapture(event: KeyboardEvent): void;
}

const VOLUME_STEP = 0.1;

export function useMoviePlayerKeyboardShortcuts({
  cancelSeekPreview,
  controlsHidden,
  exitFallbackFullscreen,
  fallbackFullscreen,
  keyboardSeekDeltaSeconds,
  onSeekKeydownBase,
  playerControlsContain,
  playing,
  seekBy,
  setVolume,
  suppressControlsRevealForKeyboardSeek,
  toggleFullscreen,
  toggleMute,
  togglePlayback,
  volume,
}: UseMoviePlayerKeyboardShortcutsOptions): UseMoviePlayerKeyboardShortcutsBindings {
  function shouldPreserveHiddenControls(): boolean {
    return controlsHidden.value && playing.value;
  }

  function preserveHiddenControlsForKeyboardSeek(): boolean {
    const preserveHiddenControls = shouldPreserveHiddenControls();
    if (preserveHiddenControls) {
      suppressControlsRevealForKeyboardSeek();
    }
    return preserveHiddenControls;
  }

  function onSeekKeydown(event: KeyboardEvent): void {
    onSeekKeydownBase(event, {
      preserveHiddenControls: shouldBeginSeekPreviewForKey(event.key)
        ? preserveHiddenControlsForKeyboardSeek()
        : false,
    });
  }

  function shouldBeginSeekPreviewForKey(key: string): boolean {
    return (
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "Home" ||
      key === "End" ||
      key === "PageUp" ||
      key === "PageDown"
    );
  }

  function onStageKeydownCapture(event: KeyboardEvent): void {
    const seekDeltaSeconds = keyboardSeekDeltaSeconds(event.key);
    if (
      event.defaultPrevented ||
      seekDeltaSeconds === null ||
      isTypingTarget(event.target) ||
      !preserveHiddenControlsForKeyboardSeek()
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    seekBy(seekDeltaSeconds, { preserveHiddenControls: true });
  }

  function handleKeyboardShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === " " || event.key.toLowerCase() === "k") {
      event.preventDefault();
      togglePlayback();
      return;
    }

    const seekDeltaSeconds = keyboardSeekDeltaSeconds(event.key);
    if (seekDeltaSeconds !== null) {
      event.preventDefault();
      seekBy(seekDeltaSeconds, {
        preserveHiddenControls: preserveHiddenControlsForKeyboardSeek(),
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setVolume(volume.value + VOLUME_STEP);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setVolume(volume.value - VOLUME_STEP);
      return;
    }

    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      toggleMute();
      return;
    }

    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen();
      return;
    }

    if (event.key === "Escape") {
      if (fallbackFullscreen.value) {
        event.preventDefault();
        exitFallbackFullscreen();
        return;
      }

      cancelSeekPreview();
    }
  }

  function handleAppKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target) || playerControlsContain(event.target)) {
      return;
    }

    handleKeyboardShortcut(event);
  }

  function onStageKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) {
      return;
    }

    handleKeyboardShortcut(event);
  }

  return {
    handleAppKeydown,
    onSeekKeydown,
    onStageKeydown,
    onStageKeydownCapture,
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
