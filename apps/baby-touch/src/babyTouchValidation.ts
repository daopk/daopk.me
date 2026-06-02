import { STICKER_SETS } from "./babyTouchStickerSets";
import type { BabyTouchBackground, BabyTouchIntensity, BabyTouchScene } from "./babyTouchTypes";

export function isBabyTouchScene(value: unknown): value is BabyTouchScene {
  return STICKER_SETS.some((stickerSet) => stickerSet.scene === value);
}

export function isBabyTouchIntensity(value: unknown): value is BabyTouchIntensity {
  return value === "gentle" || value === "lively";
}

export function isBabyTouchBackground(value: unknown): value is BabyTouchBackground {
  return value === "sky" || value === "grass" || value === "candy" || value === "night";
}
