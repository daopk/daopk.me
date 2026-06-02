import { STICKER_SETS } from "./babyTouchStickerSets";
import { REDUCED_MOTION_LIFETIME_MS, STICKER_LIFETIME_MS } from "./babyTouchTiming";
import type {
  BabyTouchPoint,
  BabyTouchScene,
  BabyTouchSettings,
  BabyTouchSticker,
} from "./babyTouchTypes";
import { clamp, pick } from "./babyTouchUtils";

type BabyTouchStickerSet = (typeof STICKER_SETS)[number];

function resolveStickerSet(scene: BabyTouchScene): BabyTouchStickerSet {
  return STICKER_SETS.find((stickerSet) => stickerSet.scene === scene) ?? STICKER_SETS[0];
}

export function createSticker(
  id: number,
  point: BabyTouchPoint,
  settings: BabyTouchSettings,
  random: () => number,
  reducedMotion: boolean,
): BabyTouchSticker {
  const stickerSet = resolveStickerSet(settings.scene);
  return {
    id,
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
    family: stickerSet.family,
    kind: pick(stickerSet.kinds, random),
    hue: Math.round(random() * 330),
    spin: Math.round((random() - 0.5) * (settings.intensity === "lively" ? 34 : 18)),
    scale: Number((0.92 + random() * (settings.intensity === "lively" ? 0.34 : 0.22)).toFixed(2)),
    mirror: random() > 0.5,
    lifetimeMs: reducedMotion ? REDUCED_MOTION_LIFETIME_MS : STICKER_LIFETIME_MS,
  };
}
