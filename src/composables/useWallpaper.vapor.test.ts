import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

import { kernel } from "~/core/kernel";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import { mountVaporComposable } from "~/test/mountVapor";
import { useWallpaper } from "./useWallpaper";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function mountHarness(): {
  api: ReturnType<typeof useWallpaper>;
  unmount: () => void;
} {
  const mounted = mountVaporComposable(() => useWallpaper(), {
    global: {
      provide: { [KernelInjectionKey as symbol]: kernel as Kernel },
    },
  });

  return {
    api: mounted.result,
    unmount: mounted.unmount,
  };
}

describe("useWallpaper — M3.4 reactive registry", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
  });

  it("default list source is kernel.wallpapers (built-ins seeded at init)", () => {
    const { api, unmount } = mountHarness();

    const listed = api.list();
    // Built-ins were auto-registered at kernel.init — list MUST be
    // non-empty (composable invariant; throws on empty otherwise).
    expect(listed.length).toBeGreaterThan(0);

    unmount();
  });

  it("re-resolves `current` when a plugin registers a new wallpaper matching the active id", async () => {
    const { api, unmount } = mountHarness();

    const settings = (await import("~/composables/useSettings")).useSettings();
    settings.setDesktopWallpaperActiveId("plugin:future");
    await nextTick();

    const beforeId = api.current.value.id;
    expect(beforeId).not.toBe("plugin:future");

    kernel.wallpapers.register({
      id: "plugin:future",
      name: "Future",
      type: "solid",
      value: "#abcdef",
    });
    await nextTick();

    expect(api.current.value.id).toBe("plugin:future");

    unmount();
  });

  it("re-resolves `current` back to fallback when the active wallpaper is unregistered", async () => {
    const { api, unmount } = mountHarness();

    const dispose = kernel.wallpapers.register({
      id: "plugin:demo",
      name: "Demo",
      type: "solid",
      value: "#123456",
    });

    const settings = (await import("~/composables/useSettings")).useSettings();
    settings.setDesktopWallpaperActiveId("plugin:demo");
    await nextTick();

    expect(api.current.value.id).toBe("plugin:demo");

    dispose();
    await nextTick();

    expect(api.current.value.id).not.toBe("plugin:demo");

    unmount();
  });

  it("respects the `options.list` injection (test path bypasses kernel events)", () => {
    const stubWallpaper = {
      id: "fixture:only",
      name: "Fixture",
      type: "solid" as const,
      value: "#000000",
    };

    const mounted = mountVaporComposable(() => useWallpaper({ list: () => [stubWallpaper] }), {
      global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
    });

    expect(mounted.result.list()).toEqual([stubWallpaper]);

    // When the test path is used, the kernel-event subscriptions MUST
    kernel.wallpapers.register({
      id: "plugin:should-not-appear",
      name: "Should Not Appear",
      type: "solid",
      value: "#111",
    });

    expect(mounted.result.list().map((w) => w.id)).toEqual(["fixture:only"]);

    mounted.unmount();
  });

  it("cleans up event subscriptions on scope dispose", async () => {
    const { unmount } = mountHarness();

    unmount();

    // After unmount, registering a new wallpaper must not throw — the
    expect(() => {
      kernel.wallpapers.register({
        id: "plugin:post-unmount",
        name: "Post Unmount",
        type: "solid",
        value: "#222",
      });
    }).not.toThrow();
  });
});
