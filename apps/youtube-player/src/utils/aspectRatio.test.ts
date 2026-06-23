import { describe, expect, it } from "vitest";

import {
  autoCoverAspectRatioOverscan,
  coverAspectRatioBox,
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

  it("covers a wider container by width", () => {
    expect(coverAspectRatioBox({ width: 1000, height: 500 }, 16 / 9)).toEqual({
      width: 1000,
      height: 1000 / (16 / 9),
    });
  });

  it("covers a taller container by height", () => {
    expect(coverAspectRatioBox({ width: 500, height: 1000 }, 16 / 9)).toEqual({
      width: 1000 * (16 / 9),
      height: 1000,
    });
  });

  it("adds modest automatic cover overscan for widescreen videos in wider containers", () => {
    expect(autoCoverAspectRatioOverscan({ width: 1118, height: 520 }, 16 / 9)).toBeCloseTo(
      2.39 / (1118 / 520),
    );
  });

  it("caps automatic cover overscan", () => {
    expect(autoCoverAspectRatioOverscan({ width: 1000, height: 500 }, 16 / 9)).toBe(1.14);
  });

  it("does not auto overscan when the detected video ratio already differs from widescreen", () => {
    expect(autoCoverAspectRatioOverscan({ width: 1118, height: 520 }, 2.39)).toBe(1);
    expect(autoCoverAspectRatioOverscan({ width: 1118, height: 520 }, 1)).toBe(1);
  });
});
