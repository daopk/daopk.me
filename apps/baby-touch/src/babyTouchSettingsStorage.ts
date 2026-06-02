import { DEFAULT_SETTINGS, STORAGE_KEY } from "./babyTouchSettingsDefaults";
import type { BabyTouchSettings } from "./babyTouchTypes";
import { clamp, isRecord } from "./babyTouchUtils";
import {
  isBabyTouchBackground,
  isBabyTouchIntensity,
  isBabyTouchScene,
} from "./babyTouchValidation";

export function defaultStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadSettings(storage: Storage | undefined): BabyTouchSettings {
  if (storage === undefined) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { ...DEFAULT_SETTINGS };
    }

    return {
      background: isBabyTouchBackground(parsed.background)
        ? parsed.background
        : DEFAULT_SETTINGS.background,
      scene: isBabyTouchScene(parsed.scene) ? parsed.scene : DEFAULT_SETTINGS.scene,
      intensity: isBabyTouchIntensity(parsed.intensity)
        ? parsed.intensity
        : DEFAULT_SETTINGS.intensity,
      soundEnabled:
        typeof parsed.soundEnabled === "boolean"
          ? parsed.soundEnabled
          : DEFAULT_SETTINGS.soundEnabled,
      volume:
        typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? clamp(Math.round(parsed.volume), 0, 100)
          : DEFAULT_SETTINGS.volume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function persistSettings(storage: Storage | undefined, settings: BabyTouchSettings): void {
  if (storage === undefined) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private browsing or test harnesses.
  }
}
