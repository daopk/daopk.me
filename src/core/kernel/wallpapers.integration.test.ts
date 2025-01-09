import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { builtinWallpapers } from "~/core/theme/wallpapers";
import type { WallpaperManifest } from "~/types/wallpaper";

import { kernel } from "./index";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function makeWallpaper(id: string, overrides: Partial<WallpaperManifest> = {}): WallpaperManifest {
  return {
    id,
    name: id,
    type: "solid",
    value: "#ff00ff",
    ...overrides,
  };
}

describe("kernel.wallpapers (integration)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
  });

  describe("built-in seeding at init", () => {
    it("auto-registers every built-in wallpaper at kernel.init", () => {
      const ids = kernel.wallpapers.list().map((m) => m.id);
      for (const builtin of builtinWallpapers) {
        expect(ids).toContain(builtin.id);
      }
    });

    it("returns built-ins by id via get()", () => {
      const first = builtinWallpapers[0];
      expect(first).toBeDefined();
      expect(kernel.wallpapers.get(first!.id)?.name).toBe(first!.name);
    });
  });

  describe("registration events", () => {
    it("emits wallpaper.registered with the manifest id on register", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("wallpaper.registered", (payload) => {
        seen.push(payload);
      });

      kernel.wallpapers.register(makeWallpaper("plugin:demo"));

      expect(seen).toEqual([{ id: "plugin:demo" }]);
      stop();
    });

    it("emits wallpaper.unregistered ONLY when an entry was actually removed", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("wallpaper.unregistered", (payload) => {
        seen.push(payload);
      });

      kernel.wallpapers.register(makeWallpaper("plugin:demo"));
      kernel.wallpapers.unregister("plugin:demo");
      // Repeated unregister of the same id is a no-op — must NOT emit.
      kernel.wallpapers.unregister("plugin:demo");
      kernel.wallpapers.unregister("never:registered");

      expect(seen).toEqual([{ id: "plugin:demo" }]);
      stop();
    });

    it("UPSERT (re-register of same id) emits wallpaper.registered each time", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("wallpaper.registered", (payload) => {
        seen.push(payload);
      });

      kernel.wallpapers.register(makeWallpaper("plugin:demo", { name: "v1" }));
      kernel.wallpapers.register(makeWallpaper("plugin:demo", { name: "v2" }));

      expect(seen).toEqual([{ id: "plugin:demo" }, { id: "plugin:demo" }]);
      stop();
    });
  });

  describe("disposer contract", () => {
    it("disposer emits wallpaper.unregistered exactly once", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("wallpaper.unregistered", (payload) => {
        seen.push(payload);
      });

      const dispose = kernel.wallpapers.register(makeWallpaper("plugin:demo"));
      dispose();
      // Calling the same disposer twice must be a no-op (idempotent).
      dispose();

      expect(seen).toEqual([{ id: "plugin:demo" }]);
      stop();
    });

    it("stale disposer (post-UPSERT) does NOT remove the replacement and does NOT emit", () => {
      // can't silently regress under HMR / plugin live-reload.
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("wallpaper.unregistered", (payload) => {
        seen.push(payload);
      });

      const disposeOriginal = kernel.wallpapers.register(
        makeWallpaper("plugin:demo", { name: "v1" }),
      );
      kernel.wallpapers.register(makeWallpaper("plugin:demo", { name: "v2" }));

      disposeOriginal();

      expect(kernel.wallpapers.get("plugin:demo")?.name).toBe("v2");
      expect(seen).toEqual([]);
      stop();
    });
  });

  describe("userBlobKey rejection (façade-level)", () => {
    it("throws and does NOT emit wallpaper.registered when userBlobKey is set", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("wallpaper.registered", (payload) => {
        seen.push(payload);
      });

      const offending = {
        ...makeWallpaper("plugin:smuggle"),
        userBlobKey: "blob:abc",
      } as WallpaperManifest;

      expect(() => kernel.wallpapers.register(offending)).toThrow();

      expect(seen.find((s) => s.id === "plugin:smuggle")).toBeUndefined();
      expect(kernel.wallpapers.get("plugin:smuggle")).toBeUndefined();

      stop();
    });
  });

  describe("list", () => {
    it("returns plugin wallpapers alongside built-ins, in registration order", () => {
      const builtinCount = builtinWallpapers.length;

      kernel.wallpapers.register(makeWallpaper("plugin:first"));
      kernel.wallpapers.register(makeWallpaper("plugin:second"));

      const list = kernel.wallpapers.list();
      expect(list.length).toBe(builtinCount + 2);

      const tail = list.slice(-2).map((m) => m.id);
      expect(tail).toEqual(["plugin:first", "plugin:second"]);
    });
  });
});
