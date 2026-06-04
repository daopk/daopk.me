export const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;

export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

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
