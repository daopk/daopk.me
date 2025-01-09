import { describe, expect, it, vi } from "vitest";

import {
  FALLBACK_WALLPAPER_LABEL_CONTRAST,
  labelContrastForRgb,
  parseSolidColor,
  resolveWallpaperLabelContrast,
  wallpaperLabelContrastStyle,
} from "./contrast";

describe("wallpaper label contrast", () => {
  it("chooses light text with a dark shadow for dark backgrounds", () => {
    const contrast = labelContrastForRgb({ r: 8, g: 10, b: 14 });

    expect(contrast.tone).toBe("light-text");
    expect(contrast.foreground).toBe("rgb(255 255 255)");
    expect(contrast.shadow).toContain("rgb(0 0 0");
  });

  it("chooses dark text with a light shadow for light backgrounds", () => {
    const contrast = labelContrastForRgb({ r: 244, g: 246, b: 250 });

    expect(contrast.tone).toBe("dark-text");
    expect(contrast.foreground).toBe("rgb(18 18 26)");
    expect(contrast.shadow).toContain("rgb(255 255 255");
  });

  it("parses basic solid CSS colors", () => {
    expect(parseSolidColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseSolidColor("rgb(10 20 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseSolidColor("hsl(0 0% 0%)")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("resolves image wallpaper contrast from an injected average sampler", async () => {
    const sampleImageAverageRgb = vi.fn(async () => ({ r: 250, g: 250, b: 250 }));

    const contrast = await resolveWallpaperLabelContrast(
      {
        id: "image",
        name: "Image",
        type: "image",
        value: "/image.jpg",
      },
      { sampleImageAverageRgb },
    );

    expect(sampleImageAverageRgb).toHaveBeenCalledWith("/image.jpg");
    expect(contrast.tone).toBe("dark-text");
  });

  it("falls back safely when image analysis fails", async () => {
    const contrast = await resolveWallpaperLabelContrast(
      {
        id: "image",
        name: "Image",
        type: "image",
        value: "/image.jpg",
      },
      { sampleImageAverageRgb: async () => null },
    );

    expect(contrast).toEqual(FALLBACK_WALLPAPER_LABEL_CONTRAST);
    expect(wallpaperLabelContrastStyle(contrast)).toEqual({
      "--home-screen-label-fg": "var(--color-fg)",
      "--home-screen-label-shadow": "none",
    });
  });
});
