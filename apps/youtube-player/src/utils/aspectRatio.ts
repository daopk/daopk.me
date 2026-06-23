export const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;

export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

export type AspectRatioFit = "contain" | "cover";
export type AspectRatioOverscan = number | "auto";

const STANDARD_WIDESCREEN_MIN_RATIO = 1.6;
const STANDARD_WIDESCREEN_MAX_RATIO = 1.95;
const CINEMATIC_CONTENT_RATIO = 2.39;
const MAX_AUTO_COVER_OVERSCAN = 1.14;

export function normalizedAspectRatio(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

export function fitAspectRatioBox(
  container: BoxSize,
  aspectRatio: number | null | undefined,
): BoxSize | null {
  if (container.width <= 0 || container.height <= 0) {
    return null;
  }

  const ratio = normalizedAspectRatio(aspectRatio) ?? DEFAULT_VIDEO_ASPECT_RATIO;
  const containerRatio = container.width / container.height;

  if (containerRatio > ratio) {
    return {
      width: container.height * ratio,
      height: container.height,
    };
  }

  return {
    width: container.width,
    height: container.width / ratio,
  };
}

export function coverAspectRatioBox(
  container: BoxSize,
  aspectRatio: number | null | undefined,
): BoxSize | null {
  if (container.width <= 0 || container.height <= 0) {
    return null;
  }

  const ratio = normalizedAspectRatio(aspectRatio) ?? DEFAULT_VIDEO_ASPECT_RATIO;
  const containerRatio = container.width / container.height;

  if (containerRatio > ratio) {
    return {
      width: container.width,
      height: container.width / ratio,
    };
  }

  return {
    width: container.height * ratio,
    height: container.height,
  };
}

export function autoCoverAspectRatioOverscan(
  container: BoxSize,
  aspectRatio: number | null | undefined,
): number {
  if (container.width <= 0 || container.height <= 0) {
    return 1;
  }

  const ratio = normalizedAspectRatio(aspectRatio) ?? DEFAULT_VIDEO_ASPECT_RATIO;
  const containerRatio = container.width / container.height;
  const isStandardWidescreen =
    ratio >= STANDARD_WIDESCREEN_MIN_RATIO && ratio <= STANDARD_WIDESCREEN_MAX_RATIO;

  if (!isStandardWidescreen || containerRatio <= ratio) {
    return 1;
  }

  return Math.max(1, Math.min(CINEMATIC_CONTENT_RATIO / containerRatio, MAX_AUTO_COVER_OVERSCAN));
}
