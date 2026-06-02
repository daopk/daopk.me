import { computed, ref, watch } from "vue";

import { DEFAULT_SETTINGS } from "./babyTouchSettingsDefaults";
import { STICKER_SETS } from "./babyTouchStickerSets";
import { defaultStorage, loadSettings, persistSettings } from "./babyTouchSettingsStorage";
import type { BabyTouchScene, BabyTouchSettings } from "./babyTouchTypes";
import { clamp } from "./babyTouchUtils";

interface BabyTouchSettingsOptions {
  readonly storage?: Storage;
}

export function useBabyTouchSettings(options: BabyTouchSettingsOptions = {}) {
  const storage = options.storage ?? defaultStorage();
  const settings = ref<BabyTouchSettings>(loadSettings(storage));

  function sceneLabelFor(scene: BabyTouchScene): string {
    return STICKER_SETS.find((stickerSet) => stickerSet.scene === scene)?.label ?? scene;
  }

  const settingsLabel = computed(() => {
    return `${sceneLabelFor(settings.value.scene)} scene`;
  });

  watch(
    settings,
    (next) => {
      persistSettings(storage, next);
    },
    { deep: true },
  );

  function updateSettings(partial: Partial<BabyTouchSettings>): void {
    settings.value = {
      ...settings.value,
      ...partial,
      volume:
        partial.volume === undefined
          ? settings.value.volume
          : clamp(Math.round(partial.volume), 0, 100),
    };
  }

  function resetSettings(): void {
    settings.value = { ...DEFAULT_SETTINGS };
  }

  return {
    resetSettings,
    settings,
    settingsLabel,
    updateSettings,
  };
}
