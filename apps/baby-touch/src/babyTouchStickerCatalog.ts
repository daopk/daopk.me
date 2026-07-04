import { STICKER_SETS } from "./babyTouchStickerSets";
import type { BabyTouchFamily, BabyTouchScene } from "./babyTouchTypes";

export interface BabyTouchStickerCatalogItem {
  readonly id: string;
  readonly family: BabyTouchFamily;
  readonly kind: string;
  readonly label: string;
  readonly hue: number;
}

export interface BabyTouchStickerCategory {
  readonly id: BabyTouchFamily;
  readonly label: string;
  readonly scene: BabyTouchScene;
  readonly stickers: readonly BabyTouchStickerCatalogItem[];
}

function formatStickerLabel(kind: string): string {
  return kind
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function buildSticker(
  family: BabyTouchFamily,
  kind: string,
  index: number,
  hueStart: number,
): BabyTouchStickerCatalogItem {
  return {
    id: `${family}-${kind}`,
    family,
    hue: (hueStart + index * 37) % 330,
    kind,
    label: formatStickerLabel(kind),
  };
}

export const babyTouchStickerCategories: readonly BabyTouchStickerCategory[] = STICKER_SETS.map(
  (stickerSet) => ({
    id: stickerSet.family,
    label: stickerSet.label,
    scene: stickerSet.scene,
    stickers: stickerSet.kinds.map((kind, index) =>
      buildSticker(stickerSet.family, kind, index, stickerSet.hueStart),
    ),
  }),
);
