import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { SETTINGS_PHYSICAL_STORAGE_KEY } from "~/core/storage/preflight";
import { DEFAULT_DOCK_PINNED_APP_IDS, useSettingsStore } from "~/core/storage/SettingsStore";
import { DEFAULT_WALLPAPER_ID } from "~/core/theme/wallpapers";

describe("useSettingsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
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
  });

  afterEach(() => {
    try {
      useSettingsStore().dispose();
    } catch {}

    vi.unstubAllGlobals();
  });

  it("hydrates defaults when localStorage empty", () => {
    const s = useSettingsStore();
    s.hydrate();

    expect(s.locale).toBe("en");
    expect(s.localeMode).toBe("auto");
    expect(s.theme).toBe("system");
    expect(s.bootCount).toBe(0);
    expect(s.shellOverride).toBeNull();
    expect(s.reduceMotion).toBe("auto");
    expect(s.dockAutoHide).toBe(false);
    expect(s.dockPinnedAppIds).toEqual(DEFAULT_DOCK_PINNED_APP_IDS);
    expect(s.telemetryEnabled).toBe(false);
    expect(s.desktopWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
    expect(s.mobileWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
    expect(s.effectiveTheme).toBe("light");
  });

  it("pins Movies instead of PDF Viewer in the default desktop dock", () => {
    expect(DEFAULT_DOCK_PINNED_APP_IDS).toContain("movies");
    expect(DEFAULT_DOCK_PINNED_APP_IDS).not.toContain("pdf-viewer");
  });

  it("setDockAutoHide persists + emits onSettingsChanged", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const s = useSettingsStore();
    s.hydrate({ onSettingsChanged: onChange });

    s.setDockAutoHide(true);
    expect(s.dockAutoHide).toBe(true);
    expect(onChange).toHaveBeenCalledWith("dockAutoHide");

    vi.advanceTimersByTime(250);
    await nextTick();

    const raw = localStorage.getItem(SETTINGS_PHYSICAL_STORAGE_KEY);
    const envelope = JSON.parse(raw as string) as { data: { dockAutoHide: boolean } };
    expect(envelope.data.dockAutoHide).toBe(true);

    vi.useRealTimers();
  });

  it("setLocale persists supported locales + emits onSettingsChanged", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const s = useSettingsStore();
    s.hydrate({ onSettingsChanged: onChange });

    s.setLocale("vi");
    expect(s.locale).toBe("vi");
    expect(s.localeMode).toBe("auto");
    expect(onChange).toHaveBeenCalledWith("locale");

    vi.advanceTimersByTime(250);
    await nextTick();

    const raw = localStorage.getItem(SETTINGS_PHYSICAL_STORAGE_KEY);
    const envelope = JSON.parse(raw as string) as { data: { locale: string } };
    expect(envelope.data.locale).toBe("vi");

    vi.useRealTimers();
  });

  it("setLocaleMode persists + emits onSettingsChanged", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const s = useSettingsStore();
    s.hydrate({ onSettingsChanged: onChange });

    s.setLocaleMode("manual");
    expect(s.localeMode).toBe("manual");
    expect(onChange).toHaveBeenCalledWith("localeMode");

    vi.advanceTimersByTime(250);
    await nextTick();

    const raw = localStorage.getItem(SETTINGS_PHYSICAL_STORAGE_KEY);
    const envelope = JSON.parse(raw as string) as { data: { localeMode: string } };
    expect(envelope.data.localeMode).toBe("manual");

    vi.useRealTimers();
  });

  it("hydrates supported locales and coerces invalid locale values to English", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          locale: "vi",
          localeMode: "manual",
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.locale).toBe("vi");
    expect(s.localeMode).toBe("manual");

    s.dispose();
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          locale: "fr",
        },
      }),
    );

    setActivePinia(createPinia());
    const next = useSettingsStore();
    next.hydrate();

    expect(next.locale).toBe("en");
    expect(next.localeMode).toBe("auto");
  });

  it("hydrates supported locale modes and falls back invalid values to auto", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          localeMode: "manual",
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.localeMode).toBe("manual");

    s.dispose();
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          localeMode: "browser",
        },
      }),
    );

    setActivePinia(createPinia());
    const next = useSettingsStore();
    next.hydrate();

    expect(next.localeMode).toBe("auto");
  });

  it("migrates legacy Vietnamese locale without a mode as manual", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          locale: "vi",
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.locale).toBe("vi");
    expect(s.localeMode).toBe("manual");
  });

  it("hydrates dockAutoHide true and coerces invalid values to false", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          dockAutoHide: true,
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.dockAutoHide).toBe(true);

    s.dispose();
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          dockAutoHide: "yes",
        },
      }),
    );

    setActivePinia(createPinia());
    const next = useSettingsStore();
    next.hydrate();

    expect(next.dockAutoHide).toBe(false);
  });

  it("setDockPinnedAppIds sanitizes, persists, and emits onSettingsChanged", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const s = useSettingsStore();
    s.hydrate({ onSettingsChanged: onChange });

    s.setDockPinnedAppIds(["finder", "", "finder", "terminal"]);
    expect(s.dockPinnedAppIds).toEqual(["finder", "terminal"]);
    expect(onChange).toHaveBeenCalledWith("dockPinnedAppIds");

    vi.advanceTimersByTime(250);
    await nextTick();

    const raw = localStorage.getItem(SETTINGS_PHYSICAL_STORAGE_KEY);
    const envelope = JSON.parse(raw as string) as { data: { dockPinnedAppIds: string[] } };
    expect(envelope.data.dockPinnedAppIds).toEqual(["finder", "terminal"]);

    vi.useRealTimers();
  });

  it("allows an empty desktop dock pinned list", () => {
    const s = useSettingsStore();
    s.hydrate();

    s.setDockPinnedAppIds([]);

    expect(s.dockPinnedAppIds).toEqual([]);
  });

  it("hydrates dockPinnedAppIds and falls back to defaults for invalid persisted values", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          dockPinnedAppIds: ["finder", "", "finder", "unknown"],
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.dockPinnedAppIds).toEqual(["finder", "unknown"]);

    s.dispose();
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          dockPinnedAppIds: "finder",
        },
      }),
    );

    setActivePinia(createPinia());
    const next = useSettingsStore();
    next.hydrate();

    expect(next.dockPinnedAppIds).toEqual(DEFAULT_DOCK_PINNED_APP_IDS);
  });

  it("reset returns dockAutoHide to false", () => {
    const s = useSettingsStore();
    s.hydrate();

    s.setDockAutoHide(true);
    s.setLocale("vi");
    s.setLocaleMode("manual");
    s.setDockPinnedAppIds(["finder"]);
    expect(s.dockAutoHide).toBe(true);
    expect(s.locale).toBe("vi");
    expect(s.localeMode).toBe("manual");
    expect(s.dockPinnedAppIds).toEqual(["finder"]);

    s.reset();

    expect(s.dockAutoHide).toBe(false);
    expect(s.locale).toBe("en");
    expect(s.localeMode).toBe("auto");
    expect(s.dockPinnedAppIds).toEqual(DEFAULT_DOCK_PINNED_APP_IDS);
  });

  it("setDesktopWallpaperActiveId persists + emits onSettingsChanged", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const s = useSettingsStore();
    s.hydrate({ onSettingsChanged: onChange });

    s.setDesktopWallpaperActiveId("user-upload-abc");
    expect(s.desktopWallpaperActiveId).toBe("user-upload-abc");
    expect(onChange).toHaveBeenCalledWith("desktopWallpaperActiveId");

    vi.advanceTimersByTime(250);
    await nextTick();

    const raw = localStorage.getItem(SETTINGS_PHYSICAL_STORAGE_KEY);
    const envelope = JSON.parse(raw as string) as {
      data: { desktopWallpaperActiveId: string; mobileWallpaperActiveId: string };
    };
    expect(envelope.data.desktopWallpaperActiveId).toBe("user-upload-abc");
    expect(envelope.data.mobileWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);

    vi.useRealTimers();
  });

  it("setMobileWallpaperActiveId persists + emits onSettingsChanged", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const s = useSettingsStore();
    s.hydrate({ onSettingsChanged: onChange });

    s.setMobileWallpaperActiveId("mobile-upload-abc");
    expect(s.mobileWallpaperActiveId).toBe("mobile-upload-abc");
    expect(onChange).toHaveBeenCalledWith("mobileWallpaperActiveId");

    vi.advanceTimersByTime(250);
    await nextTick();

    const raw = localStorage.getItem(SETTINGS_PHYSICAL_STORAGE_KEY);
    const envelope = JSON.parse(raw as string) as {
      data: { desktopWallpaperActiveId: string; mobileWallpaperActiveId: string };
    };
    expect(envelope.data.desktopWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
    expect(envelope.data.mobileWallpaperActiveId).toBe("mobile-upload-abc");

    vi.useRealTimers();
  });

  it("shell wallpaper setters coerce empty values to the default id", () => {
    const s = useSettingsStore();
    s.hydrate();

    s.setDesktopWallpaperActiveId("user-upload-abc");
    s.setMobileWallpaperActiveId("mobile-upload-abc");
    expect(s.desktopWallpaperActiveId).toBe("user-upload-abc");
    expect(s.mobileWallpaperActiveId).toBe("mobile-upload-abc");

    s.setDesktopWallpaperActiveId("");
    s.setMobileWallpaperActiveId("");
    expect(s.desktopWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
    expect(s.mobileWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
  });

  it("migrates legacy still-waters default to the current default for both shells", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          wallpaperActiveId: "still-waters",
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.desktopWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
    expect(s.mobileWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
  });

  it("normalizes shell-specific still-waters ids to the current default on hydrate", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          desktopWallpaperActiveId: "still-waters",
          mobileWallpaperActiveId: "still-waters",
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.desktopWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
    expect(s.mobileWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
  });

  it("normalizes the removed Framer wallpaper id to the current default on hydrate", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          desktopWallpaperActiveId: "framer",
          mobileWallpaperActiveId: "framer",
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.desktopWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
    expect(s.mobileWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
  });

  it("normalizes the removed Everest wallpaper id to the current default on hydrate", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          desktopWallpaperActiveId: "everest",
          mobileWallpaperActiveId: "everest",
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.desktopWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
    expect(s.mobileWallpaperActiveId).toBe(DEFAULT_WALLPAPER_ID);
  });

  it("migrates legacy custom wallpaper id to both shell settings", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          wallpaperActiveId: "user-upload-abc",
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.desktopWallpaperActiveId).toBe("user-upload-abc");
    expect(s.mobileWallpaperActiveId).toBe("user-upload-abc");
  });

  it("hydrates persisted envelope from physical key", () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          bootCount: 4,
          theme: "dark",
          shellOverride: null,
          reduceMotion: "never",
          telemetryEnabled: true,
        },
      }),
    );

    const s = useSettingsStore();
    s.hydrate();

    expect(s.bootCount).toBe(4);
    expect(s.theme).toBe("dark");
    expect(s.dockAutoHide).toBe(false);
    expect(s.dockPinnedAppIds).toEqual(DEFAULT_DOCK_PINNED_APP_IDS);
    expect(s.telemetryEnabled).toBe(true);
    expect(s.effectiveTheme).toBe("dark");
  });

  it("debounced persist flushes to localStorage after tick", async () => {
    vi.useFakeTimers();

    const s = useSettingsStore();
    s.hydrate();

    s.setTheme("light");
    vi.advanceTimersByTime(250);

    await nextTick();

    const raw = localStorage.getItem(SETTINGS_PHYSICAL_STORAGE_KEY);
    expect(raw).toBeTruthy();

    const envelope = JSON.parse(raw as string) as { data: { theme: string } };

    expect(envelope.data.theme).toBe("light");

    vi.useRealTimers();
  });
});
