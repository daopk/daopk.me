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

  it("registers the responsive wallpaper collection with Liquid Glass as default", () => {
    expect(builtinWallpapers.map((wallpaper) => wallpaper.name)).toEqual([
      "Liquid Glass",
      "Aurora Fjord",
      "Coastal Dawn",
    ]);

    const defaultWallpaper = builtinWallpapers[0];
    expect(defaultWallpaper?.id).toBe(DEFAULT_WALLPAPER_ID);
    expect(defaultWallpaper?.preferredTheme).toBeUndefined();

    for (const wallpaper of builtinWallpapers) {
      expect(wallpaper.type).toBe("image");
      expect(resolveWallpaperValue(wallpaper, "desktop")).toMatch(/\.webp(\?.*)?$/i);
      expect(resolveWallpaperValue(wallpaper, "mobile")).toMatch(/\.webp(\?.*)?$/i);
      expect(resolveWallpaperValue(wallpaper, "desktop")).not.toBe(
        resolveWallpaperValue(wallpaper, "mobile"),
      );
    }
  });

  it("does not ship the removed Framer wallpaper", () => {
    expect(builtinWallpapers.map((w) => w.id)).not.toContain("framer");
  });

  it("listWallpapers mirrors builtin list", () => {
    expect(listWallpapers()).toBe(builtinWallpapers);
  });
});
