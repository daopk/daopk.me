import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick } from "vue";

import "fake-indexeddb/auto";

import type { Wallpaper } from "~/core/theme/wallpapers";
import type { ResolvedTheme, ThemeName } from "~/types/theme";
import { useWallpaperStore } from "~/core/wallpaper/WallpaperStore";

import { useWallpaper } from "~/composables/useWallpaper";

const { mockThemeRef, mockSettingsRef } = vi.hoisted(() => {
  const { reactive, ref } = require("vue") as typeof import("vue");

  return {
    mockThemeRef: ref<ResolvedTheme>("dark"),
    mockSettingsRef: reactive<{
      desktopWallpaperActiveId: string;
      mobileWallpaperActiveId: string;
      setDesktopWallpaperActiveId: (v: string) => void;
      setMobileWallpaperActiveId: (v: string) => void;
    }>({
      desktopWallpaperActiveId: "test-dark",
      mobileWallpaperActiveId: "test-dark",
      setDesktopWallpaperActiveId(value: string): void {
        this.desktopWallpaperActiveId = value;
      },
      setMobileWallpaperActiveId(value: string): void {
        this.mobileWallpaperActiveId = value;
      },
    }),
  };
});

vi.mock("~/composables/useTheme", () => ({
  useTheme() {
    return {
      theme: computed(() => mockThemeRef.value),

      preference: computed(() => "system" as const),

      setTheme: (): void => {},

      toggle: (): void => {},

      list(): readonly ThemeName[] {
        return ["light", "dark"];
      },
    };
  },
}));

vi.mock("~/composables/useSettings", () => ({
  useSettings() {
    return mockSettingsRef;
  },
}));

describe("useWallpaper", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockThemeRef.value = "dark";
    mockSettingsRef.desktopWallpaperActiveId = "test-dark";
    mockSettingsRef.mobileWallpaperActiveId = "test-dark";
  });

  const fakeList = (): readonly Wallpaper[] =>
    [
      {
        id: "test-dark",
        name: "Aurora",
        preferredTheme: "dark",
        type: "gradient",
        value:
          "linear-gradient(160deg, var(--color-bg) 0%, var(--color-bg-elevated) 55%, var(--color-bg-subtle) 100%)",
      },
      {
        id: "test-light",
        name: "Dawn",
        preferredTheme: "light",
        type: "gradient",
        value:
          "linear-gradient(180deg, var(--color-bg-elevated) 0%, var(--color-bg-subtle) 70%, var(--color-bg) 100%)",
      },
    ] satisfies readonly Wallpaper[];

  it("resolves the wallpaper matching the desktop active id by default", () => {
    const { current } = useWallpaper({ list: fakeList });
    expect(current.value.id).toBe("test-dark");

    mockSettingsRef.desktopWallpaperActiveId = "test-light";
    expect(current.value.id).toBe("test-light");
  });

  it("resolves the mobile active id and shell-specific value when requested", () => {
    mockSettingsRef.desktopWallpaperActiveId = "test-dark";
    mockSettingsRef.mobileWallpaperActiveId = "test-light";

    const { current } = useWallpaper({
      list: () => [
        ...fakeList(),
        {
          id: "responsive",
          name: "Responsive",
          type: "image",
          value: "/desktop.png",
          valueByShell: { mobile: "/mobile.png" },
        },
      ],
      shellId: "mobile",
    });

    expect(current.value.id).toBe("test-light");

    mockSettingsRef.mobileWallpaperActiveId = "responsive";
    expect(current.value.value).toBe("/mobile.png");
  });

  it("falls back to the first wallpaper when the active id is unknown", () => {
    const { current } = useWallpaper({ list: fakeList });
    mockSettingsRef.desktopWallpaperActiveId = "no-such-id";
    expect(current.value.id).toBe("test-dark");
  });

  it("throws on access when registry is empty (invariant)", () => {
    const { current } = useWallpaper({ list: () => [] });
    expect(() => current.value).toThrow(/invariant violated/i);
  });

  it("returns the wallpaper matching the desktop active id when explicit and known", () => {
    const { current } = useWallpaper({ list: fakeList });

    mockThemeRef.value = "dark";
    mockSettingsRef.desktopWallpaperActiveId = "test-light";

    expect(current.value.id).toBe("test-light");
  });

  it("falls back to first built-in + debugWarn when desktop active id is unknown", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { current } = useWallpaper({ list: fakeList });

    mockSettingsRef.desktopWallpaperActiveId = "no-such-id";

    expect(current.value.id).toBe("test-dark");
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("resolves user-uploaded id by minting an object URL (M2b.7)", async () => {
    const wallpaperStore = useWallpaperStore();
    wallpaperStore.hydrate();
    const file = new File([new Uint8Array(64).fill(1)], "user.png", { type: "image/png" });
    const result = await wallpaperStore.upload(file);
    if (!result.ok) throw new Error("upload should have succeeded");

    const created: string[] = [];
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:test/${created.length}`;
      created.push(url);
      void blob;
      return url;
    });

    try {
      const { current } = useWallpaper({ list: fakeList });

      mockSettingsRef.desktopWallpaperActiveId = result.meta.id;
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 30));
      await nextTick();

      expect(current.value.userBlobKey).toBe(result.meta.id);
      expect(current.value.value.startsWith("blob:")).toBe(true);
      expect(created.length).toBeGreaterThan(0);
    } finally {
      URL.createObjectURL = originalCreate;
    }
  });

  it("resets active id to the first built-in when the user blob is missing (Q13 eviction)", async () => {
    const wallpaperStore = useWallpaperStore();
    wallpaperStore.hydrate();
    const file = new File([new Uint8Array(32).fill(2)], "evict.png", { type: "image/png" });
    const result = await wallpaperStore.upload(file);
    if (!result.ok) throw new Error("upload should have succeeded");

    const getBlobSpy = vi
      .spyOn(wallpaperStore, "getBlob")
      .mockImplementation(async (id: string) => {
        if (id === result.meta.id) {
          return null;
        }
        return null;
      });

    const { current } = useWallpaper({ list: fakeList });
    void current.value;

    mockSettingsRef.desktopWallpaperActiveId = result.meta.id;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(mockSettingsRef.desktopWallpaperActiveId).toBe("test-dark");
    expect(getBlobSpy).toHaveBeenCalledWith(result.meta.id);

    getBlobSpy.mockRestore();
  });

  it("revokes the previous object URL when the active id changes (M2b.7 leak guard)", async () => {
    const wallpaperStore = useWallpaperStore();
    wallpaperStore.hydrate();
    const file = new File([new Uint8Array(48).fill(3)], "revoke.png", { type: "image/png" });
    const result = await wallpaperStore.upload(file);
    if (!result.ok) throw new Error("upload should have succeeded");

    const created: string[] = [];
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:revoke/${created.length}`;
      created.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });

    try {
      const scope = effectScope();
      scope.run(() => {
        const { current } = useWallpaper({ list: fakeList });
        void current.value;
      });

      mockSettingsRef.desktopWallpaperActiveId = result.meta.id;
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 30));
      await nextTick();
      expect(created.length).toBe(1);

      mockSettingsRef.desktopWallpaperActiveId = "test-dark";
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(revoked).toContain(created[0]);

      scope.stop();
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
