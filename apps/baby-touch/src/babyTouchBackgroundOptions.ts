import type { BabyTouchBackground } from "./babyTouchTypes";

export const backgroundOptions: ReadonlyArray<{
  readonly value: BabyTouchBackground;
  readonly label: string;
  readonly tone: string;
}> = [
  { value: "sky", label: "Sky", tone: "Blue" },
  { value: "grass", label: "Grass", tone: "Green" },
  { value: "candy", label: "Candy", tone: "Pink" },
  { value: "night", label: "Night", tone: "Black" },
];
