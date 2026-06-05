import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kernel } from "~/core/kernel";
import { useSettingsStore } from "~/core/storage/SettingsStore";
import type { SettingsState } from "~/types/settings";

describe("kernel settings facade", () => {
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal(
      "matchMedia",
      (q: string): MediaQueryList =>
        ({
          media: q,
          matches: false,
          addEventListener: (): void => {},
          removeEventListener: (): void => {},
        }) as unknown as MediaQueryList,
    );

    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("writes dockAutoHide through the store and emits settings.changed", () => {
    const payloads: Array<{ key: keyof SettingsState }> = [];
    const stop = kernel.events.on("settings.changed", (payload) => {
      payloads.push(payload);
    });

    kernel.settings.set("dockAutoHide", true);

    stop();

    expect(kernel.settings.get("dockAutoHide")).toBe(true);
    expect(kernel.settings.use("dockAutoHide").value).toBe(true);
    expect(useSettingsStore().dockAutoHide).toBe(true);
    expect(payloads).toContainEqual({ key: "dockAutoHide" });
  });

  it("writes dockPinnedAppIds through the store and emits settings.changed", () => {
    const payloads: Array<{ key: keyof SettingsState }> = [];
    const stop = kernel.events.on("settings.changed", (payload) => {
      payloads.push(payload);
    });

    kernel.settings.set("dockPinnedAppIds", ["finder", "terminal"]);

    stop();

    expect(kernel.settings.get("dockPinnedAppIds")).toEqual(["finder", "terminal"]);
    expect(kernel.settings.use("dockPinnedAppIds").value).toEqual(["finder", "terminal"]);
    expect(useSettingsStore().dockPinnedAppIds).toEqual(["finder", "terminal"]);
    expect(payloads).toContainEqual({ key: "dockPinnedAppIds" });
  });

  it("writes shell wallpaper ids through the store and emits settings.changed", () => {
    const payloads: Array<{ key: keyof SettingsState }> = [];
    const stop = kernel.events.on("settings.changed", (payload) => {
      payloads.push(payload);
    });

    kernel.settings.set("desktopWallpaperActiveId", "desktop-custom");
    kernel.settings.set("mobileWallpaperActiveId", "mobile-custom");

    stop();

    expect(kernel.settings.get("desktopWallpaperActiveId")).toBe("desktop-custom");
    expect(kernel.settings.get("mobileWallpaperActiveId")).toBe("mobile-custom");
    expect(kernel.settings.use("desktopWallpaperActiveId").value).toBe("desktop-custom");
    expect(kernel.settings.use("mobileWallpaperActiveId").value).toBe("mobile-custom");
    expect(useSettingsStore().desktopWallpaperActiveId).toBe("desktop-custom");
    expect(useSettingsStore().mobileWallpaperActiveId).toBe("mobile-custom");
    expect(payloads).toContainEqual({ key: "desktopWallpaperActiveId" });
    expect(payloads).toContainEqual({ key: "mobileWallpaperActiveId" });
  });
});
