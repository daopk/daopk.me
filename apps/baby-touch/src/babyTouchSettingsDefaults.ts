import type { BabyTouchSettings } from "./babyTouchTypes";

export const STORAGE_KEY = "daopk:baby-touch:settings";

export const DEFAULT_SETTINGS: BabyTouchSettings = {
  background: "sky",
  scene: "animals",
  intensity: "gentle",
  soundEnabled: false,
  volume: 35,
};
