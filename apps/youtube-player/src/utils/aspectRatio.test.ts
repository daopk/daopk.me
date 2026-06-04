import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIDEO_ASPECT_RATIO,
  fitAspectRatioBox,
  normalizedAspectRatio,
} from "./aspectRatio";

describe("aspect ratio utils", () => {
  it("normalizes only finite positive ratios", () => {
    expect(normalizedAspectRatio(16 / 9)).toBe(16 / 9);
    expect(normalizedAspectRatio(0)).toBeNull();
    expect(normalizedAspectRatio(Number.NaN)).toBeNull();
    expect(normalizedAspectRatio(null)).toBeNull();
  });

  it("fits a wider container by height", () => {
    expect(fitAspectRatioBox({ width: 1000, height: 500 }, 16 / 9)).toEqual({
      width: 500 * (16 / 9),
      height: 500,
    });
  });

  it("fits a taller container by width", () => {
    expect(fitAspectRatioBox({ width: 500, height: 1000 }, 16 / 9)).toEqual({
      width: 500,
      height: 500 / (16 / 9),
    });
  });

  it("falls back to the default video ratio", () => {
    expect(fitAspectRatioBox({ width: 1000, height: 500 }, null)).toEqual({
      width: 500 * DEFAULT_VIDEO_ASPECT_RATIO,
      height: 500,
    });
  });
});
