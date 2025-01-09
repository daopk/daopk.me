import { describe, expect, it } from "vitest";

import {
  builtinWallpapers,
  DEFAULT_WALLPAPER_ID,
  listWallpapers,
  resolveWallpaperValue,
} from "~/core/theme/wallpapers";

describe("wallpapers", () => {
  it("ships the bundled image default (D41)", () => {
    expect(builtinWallpapers.length).toBeGreaterThanOrEqual(1);
  });

  it("registers Everest as the default responsive image built-in", () => {
    const everest = builtinWallpapers[0];
    expect(everest?.id).toBe(DEFAULT_WALLPAPER_ID);
    expect(everest?.name).toBe("Everest");
    expect(everest?.type).toBe("image");
    expect(everest?.preferredTheme).toBeUndefined();
    expect(resolveWallpaperValue(everest!, "desktop")).toMatch(/\.webp(\?.*)?$/i);
    expect(resolveWallpaperValue(everest!, "mobile")).toMatch(/\.webp(\?.*)?$/i);
    expect(resolveWallpaperValue(everest!, "desktop")).not.toBe(
      resolveWallpaperValue(everest!, "mobile"),
    );
  });

  it("does not ship the removed Framer wallpaper", () => {
    expect(builtinWallpapers.map((w) => w.id)).not.toContain("framer");
  });

  it("listWallpapers mirrors builtin list", () => {
    expect(listWallpapers()).toBe(builtinWallpapers);
  });
});
