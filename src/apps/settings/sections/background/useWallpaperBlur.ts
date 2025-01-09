import { computed, onMounted, onUnmounted, ref } from "vue";

import type { Kernel } from "~/types/kernel";

export const WALLPAPER_BLUR_VALUE = "12px";
export const WALLPAPER_BLUR_SCALE = "1.04";

const WALLPAPER_BLUR_TOKEN = "--wallpaper-blur";
const WALLPAPER_BLUR_SCALE_TOKEN = "--wallpaper-blur-scale";
const STALE_WALLPAPER_DIM_TOKEN = "--wallpaper-dim";

export function useWallpaperBlur(kernel: Kernel) {
  const blurEnabled = ref(false);

  function readBlurFromOverrides(): boolean {
    const overrides = kernel.theme.currentOverrides();
    return overrides[WALLPAPER_BLUR_TOKEN] === WALLPAPER_BLUR_VALUE;
  }

  function syncBlurFromOverrides(): void {
    blurEnabled.value = readBlurFromOverrides();
  }

  function clearStaleDimOverride(): void {
    if (STALE_WALLPAPER_DIM_TOKEN in kernel.theme.currentOverrides()) {
      kernel.theme.unsetOverride(STALE_WALLPAPER_DIM_TOKEN);
    }
  }

  onMounted(() => {
    syncBlurFromOverrides();
    clearStaleDimOverride();
  });

  const stopTokensListener = kernel.events.on("tokens.changed", (payload) => {
    if (
      payload.keys.includes(WALLPAPER_BLUR_TOKEN) ||
      payload.keys.includes(WALLPAPER_BLUR_SCALE_TOKEN)
    ) {
      syncBlurFromOverrides();
    }
  });

  onUnmounted(() => {
    stopTokensListener();
  });

  function setBlurEnabled(next: boolean): void {
    blurEnabled.value = next;
    if (next) {
      kernel.theme.setOverride(WALLPAPER_BLUR_TOKEN, WALLPAPER_BLUR_VALUE);
      kernel.theme.setOverride(WALLPAPER_BLUR_SCALE_TOKEN, WALLPAPER_BLUR_SCALE);
      return;
    }
    kernel.theme.unsetOverride(WALLPAPER_BLUR_TOKEN);
    kernel.theme.unsetOverride(WALLPAPER_BLUR_SCALE_TOKEN);
  }

  const blurPreviewStyle = computed<Record<string, string>>(() => {
    if (!blurEnabled.value) {
      return {} as Record<string, string>;
    }
    return {
      filter: `blur(${WALLPAPER_BLUR_VALUE})`,
      transform: `scale(${WALLPAPER_BLUR_SCALE})`,
    };
  });

  return {
    blurEnabled,
    blurPreviewStyle,
    setBlurEnabled,
  };
}
