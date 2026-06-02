import type { ANIMAL_KINDS, STICKER_SETS } from "./babyTouchStickerSets";

export type BabyTouchScene = (typeof STICKER_SETS)[number]["scene"];
export type BabyTouchIntensity = "gentle" | "lively";
export type BabyTouchBackground = "sky" | "grass" | "candy" | "night";
export type BabyTouchFamily = (typeof STICKER_SETS)[number]["family"];
export type BabyTouchAnimalKind = (typeof ANIMAL_KINDS)[number];

export interface BabyTouchSettings {
  readonly background: BabyTouchBackground;
  readonly scene: BabyTouchScene;
  readonly intensity: BabyTouchIntensity;
  readonly soundEnabled: boolean;
  readonly volume: number;
}

export interface BabyTouchPoint {
  readonly x: number;
  readonly y: number;
}

export interface BabyTouchSticker {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly family: BabyTouchFamily;
  readonly kind: string;
  readonly hue: number;
  readonly spin: number;
  readonly scale: number;
  readonly mirror: boolean;
  readonly lifetimeMs: number;
}
