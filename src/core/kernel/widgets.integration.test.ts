import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineVaporComponent, markRaw } from "vue";

import { debugWarn } from "~/core/debug";
import type { AppManifest } from "~/types/app";
import type { WidgetManifest } from "~/types/widget";

import { kernel } from "./index";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon = markRaw(defineVaporComponent(() => document.createElement("svg")));

function makeWidget(id: string, overrides: Partial<WidgetManifest> = {}): WidgetManifest {
  return {
    id,
    title: id,
    surface: "desktop:menubar",
    size: "sm",
    component: () => Promise.resolve({ default: StubIcon }),
    ...overrides,
  };
}

function makeApp(id: string, widgets: readonly WidgetManifest[] = []): AppManifest {
  return {
    id,
    name: id,
    icon: StubIcon,
    category: "productivity",
    component: () => Promise.resolve({ default: StubIcon }),
    widgets,
  };
}

describe("kernel.widgets (integration)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
  });

  describe("registration events", () => {
    it("emits widget.registered with the manifest id on register", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("widget.registered", (payload) => {
        seen.push(payload);
      });

      kernel.widgets.register(makeWidget("plugin:demo"));

      expect(seen).toEqual([{ id: "plugin:demo" }]);
      stop();
    });

    it("emits widget.unregistered ONLY when an entry was actually removed", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("widget.unregistered", (payload) => {
        seen.push(payload);
      });

      kernel.widgets.register(makeWidget("plugin:demo"));
      kernel.widgets.unregister("plugin:demo");
      // Second unregister of the same id is a no-op — must NOT emit.
      kernel.widgets.unregister("plugin:demo");
      kernel.widgets.unregister("never:registered");

      expect(seen).toEqual([{ id: "plugin:demo" }]);
      stop();
    });

    it("UPSERT (re-register of the same id) emits widget.registered each time", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("widget.registered", (payload) => {
        seen.push(payload);
      });

      kernel.widgets.register(makeWidget("plugin:demo", { title: "v1" }));
      kernel.widgets.register(makeWidget("plugin:demo", { title: "v2" }));

      expect(seen).toEqual([{ id: "plugin:demo" }, { id: "plugin:demo" }]);
      stop();
    });
  });

  describe("disposer contract", () => {
    it("disposer emits widget.unregistered exactly once", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("widget.unregistered", (payload) => {
        seen.push(payload);
      });

      const dispose = kernel.widgets.register(makeWidget("plugin:demo"));
      dispose();
      // Second call to the same disposer must be a no-op.
      dispose();

      expect(seen).toEqual([{ id: "plugin:demo" }]);
      stop();
    });

    it("stale disposer (post-UPSERT) does NOT remove the replacement and does NOT emit", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("widget.unregistered", (payload) => {
        seen.push(payload);
      });

      const disposeOriginal = kernel.widgets.register(makeWidget("plugin:demo", { title: "v1" }));
      kernel.widgets.register(makeWidget("plugin:demo", { title: "v2" }));

      // Stale disposer must short-circuit because the slot is now
      disposeOriginal();

      expect(kernel.widgets.get("plugin:demo")?.title).toBe("v2");
      expect(seen).toEqual([]);
      stop();
    });
  });

  describe("list", () => {
    it("returns plugin widgets alongside any built-ins, surface-filtered", () => {
      kernel.widgets.register(makeWidget("plugin:menubar", { surface: "desktop:menubar" }));
      kernel.widgets.register(makeWidget("plugin:wallpaper", { surface: "desktop:wallpaper" }));
      kernel.widgets.register(makeWidget("plugin:mobile", { surface: "mobile:widgets" }));
      kernel.widgets.register(makeWidget("plugin:any", { surface: "any" }));

      const menubarIds = kernel.widgets.list({ surface: "desktop:menubar" }).map((m) => m.id);
      expect(menubarIds).toContain("plugin:menubar");
      expect(menubarIds).toContain("plugin:any");
      expect(menubarIds).not.toContain("plugin:wallpaper");
      expect(menubarIds).not.toContain("plugin:mobile");

      const wallpaperIds = kernel.widgets.list({ surface: "desktop:wallpaper" }).map((m) => m.id);
      expect(wallpaperIds).toContain("plugin:wallpaper");
      expect(wallpaperIds).toContain("plugin:any");
      expect(wallpaperIds).not.toContain("plugin:menubar");
      expect(wallpaperIds).not.toContain("plugin:mobile");

      const mobileIds = kernel.widgets.list({ surface: "mobile:widgets" }).map((m) => m.id);
      expect(mobileIds).toContain("plugin:mobile");
      expect(mobileIds).toContain("plugin:any");
      expect(mobileIds).not.toContain("plugin:menubar");
      expect(mobileIds).not.toContain("plugin:wallpaper");
    });
  });

  describe("get", () => {
    it("delegates to the underlying registry for lookups", () => {
      expect(kernel.widgets.get("plugin:demo")).toBeUndefined();

      kernel.widgets.register(makeWidget("plugin:demo", { title: "Demo" }));

      expect(kernel.widgets.get("plugin:demo")?.title).toBe("Demo");
    });
  });

  describe("app manifest widgets", () => {
    it("registers widgets declared on an app manifest", () => {
      kernel.apps.register(
        makeApp("widget-app-register", [
          makeWidget("widget-app-register:lunar", { surface: "mobile:widgets" }),
        ]),
      );

      expect(kernel.widgets.get("widget-app-register:lunar")).toBeDefined();
      expect(
        kernel.widgets.list({ surface: "mobile:widgets" }).map((manifest) => manifest.id),
      ).toContain("widget-app-register:lunar");
    });

    it("normalizes app-owned widgets to optional by default and reuses the app icon", () => {
      kernel.apps.register(
        makeApp("widget-app-visibility", [
          makeWidget("widget-app-visibility:lunar", { surface: "mobile:widgets" }),
        ]),
      );

      const widget = kernel.widgets.get("widget-app-visibility:lunar");
      expect(widget?.defaultVisible).toBe(false);
      expect(widget?.icon).toBe(StubIcon);
    });

    it("removes app-owned widgets when the app unregisters", () => {
      const seen: Array<{ id: string }> = [];
      const stop = kernel.events.on("widget.unregistered", (payload) => {
        seen.push(payload);
      });

      kernel.apps.register(
        makeApp("widget-app-unregister", [
          makeWidget("widget-app-unregister:lunar", { surface: "desktop:wallpaper" }),
        ]),
      );
      kernel.apps.unregister("widget-app-unregister");

      expect(kernel.widgets.get("widget-app-unregister:lunar")).toBeUndefined();
      expect(seen).toEqual([{ id: "widget-app-unregister:lunar" }]);
      stop();
    });

    it("re-registering an app replaces its previous widget list", () => {
      kernel.apps.register(
        makeApp("widget-app-replace", [
          makeWidget("widget-app-replace:old"),
          makeWidget("widget-app-replace:shared", { title: "Shared v1" }),
        ]),
      );

      kernel.apps.register(
        makeApp("widget-app-replace", [
          makeWidget("widget-app-replace:shared", { title: "Shared v2" }),
          makeWidget("widget-app-replace:new"),
        ]),
      );

      expect(kernel.widgets.get("widget-app-replace:old")).toBeUndefined();
      expect(kernel.widgets.get("widget-app-replace:shared")?.title).toBe("Shared v2");
      expect(kernel.widgets.get("widget-app-replace:new")).toBeDefined();
    });

    it("skips app widget ids that are not namespaced by the app id", () => {
      kernel.apps.register(
        makeApp("widget-app-namespace", [
          makeWidget("wrong:lunar"),
          makeWidget("widget-app-namespace:lunar"),
        ]),
      );

      expect(kernel.widgets.get("wrong:lunar")).toBeUndefined();
      expect(kernel.widgets.get("widget-app-namespace:lunar")).toBeDefined();
      expect(debugWarn).toHaveBeenCalledWith(
        "[kernel]",
        "skipping app widget with invalid namespace",
        "widget-app-namespace",
        "wrong:lunar",
      );
    });
  });
});
