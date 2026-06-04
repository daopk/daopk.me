import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";

export const AUTO_HIDE_CONTROLS_DELAY_MS = 2400;

export interface UseAutoHideControlsOptions {
  readonly playing: Readonly<Ref<boolean>>;
}

export function useAutoHideControls(options: UseAutoHideControlsOptions) {
  const controlsVisible = ref(true);
  const controlsFocused = ref(false);

  let hideTimer: number | undefined;

  const controlsHidden = computed(() => !controlsVisible.value);

  function clearHideTimer(): void {
    if (hideTimer === undefined || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }

  function canHideControls(): boolean {
    return options.playing.value && !controlsFocused.value;
  }

  function scheduleAutoHide(): void {
    clearHideTimer();

    if (!canHideControls() || typeof window === "undefined") {
      controlsVisible.value = true;
      return;
    }

    hideTimer = window.setTimeout(() => {
      if (canHideControls()) {
        controlsVisible.value = false;
      }
    }, AUTO_HIDE_CONTROLS_DELAY_MS);
  }

  function showControls(): void {
    controlsVisible.value = true;
    scheduleAutoHide();
  }

  function setControlsFocused(focused: boolean): void {
    controlsFocused.value = focused;
    controlsVisible.value = true;

    if (focused) {
      clearHideTimer();
    } else {
      scheduleAutoHide();
    }
  }

  watch(
    options.playing,
    (nextPlaying) => {
      if (nextPlaying) {
        scheduleAutoHide();
      } else {
        clearHideTimer();
        controlsVisible.value = true;
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(clearHideTimer);

  return {
    controlsHidden,
    controlsVisible,
    setControlsFocused,
    showControls,
  };
}
