import { computed, ref, type ComputedRef, type Ref } from "vue";

const AUTO_HIDE_CONTROLS_DELAY_MS = 3200;

type ShowControlsOptions = {
  readonly force?: boolean;
};

interface UseMoviePlayerControlsOptions {
  readonly controlsFocused: Ref<boolean>;
  readonly playbackError: ComputedRef<string>;
  readonly playing: Ref<boolean>;
  readonly seeking: Ref<boolean>;
  readonly shouldRevealControls: () => boolean;
  readonly waiting: Ref<boolean>;
}

export interface UseMoviePlayerControlsBindings {
  readonly controlsHidden: ComputedRef<boolean>;
  readonly controlsVisible: Ref<boolean>;
  clearHideControlsTimer(): void;
  resetControlsVisibility(): void;
  scheduleAutoHideControls(): void;
  showControls(eventOrOptions?: Event | ShowControlsOptions): void;
}

export function useMoviePlayerControls({
  controlsFocused,
  playbackError,
  playing,
  seeking,
  shouldRevealControls,
  waiting,
}: UseMoviePlayerControlsOptions): UseMoviePlayerControlsBindings {
  const controlsVisible = ref(true);
  const controlsHidden = computed(() => !controlsVisible.value && !controlsFocused.value);

  let hideControlsTimer: number | undefined;

  function clearHideControlsTimer(): void {
    if (hideControlsTimer === undefined || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(hideControlsTimer);
    hideControlsTimer = undefined;
  }

  function canHideControls(): boolean {
    return (
      playing.value &&
      playbackError.value.length === 0 &&
      !controlsFocused.value &&
      !seeking.value &&
      !waiting.value
    );
  }

  function scheduleAutoHideControls(): void {
    clearHideControlsTimer();
    if (!canHideControls() || typeof window === "undefined") {
      controlsVisible.value = true;
      return;
    }

    hideControlsTimer = window.setTimeout(() => {
      if (canHideControls()) {
        controlsVisible.value = false;
      }
    }, AUTO_HIDE_CONTROLS_DELAY_MS);
  }

  function showControls(eventOrOptions?: Event | ShowControlsOptions): void {
    const force =
      typeof eventOrOptions === "object" &&
      eventOrOptions !== null &&
      "force" in eventOrOptions &&
      eventOrOptions.force === true;

    if (!force && !shouldRevealControls()) {
      return;
    }

    controlsVisible.value = true;
    scheduleAutoHideControls();
  }

  function resetControlsVisibility(): void {
    controlsVisible.value = true;
  }

  return {
    controlsHidden,
    controlsVisible,
    clearHideControlsTimer,
    resetControlsVisibility,
    scheduleAutoHideControls,
    showControls,
  };
}
