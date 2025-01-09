import { describe, expect, it, vi } from "vitest";

import { WidgetRegistry } from "./WidgetRegistry";
import type { WidgetManifest } from "~/types/widget";

function makeManifest(id: string, overrides: Partial<WidgetManifest> = {}): WidgetManifest {
  return {
    id,
    title: id,
    surface: "desktop:menubar",
    size: "sm",
    component: () => Promise.resolve({ default: {} as never }),
    ...overrides,
  };
}

describe("WidgetRegistry — class (M3.4)", () => {
  describe("register", () => {
    it("adds the manifest and exposes it via has/get/list", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("status:clock"));

      expect(registry.has("status:clock")).toBe(true);
      expect(registry.get("status:clock")?.id).toBe("status:clock");
      expect(registry.list().map((m) => m.id)).toEqual(["status:clock"]);
    });

    it("UPSERTs on re-register of same id (no throw, replaces manifest)", () => {
      const registry = new WidgetRegistry();
      const first = makeManifest("status:clock", { title: "Clock v1" });
      const second = makeManifest("status:clock", { title: "Clock v2" });

      registry.register(first);
      registry.register(second);

      expect(registry.get("status:clock")).toBe(second);
      expect(registry.list()).toHaveLength(1);
    });

    it("preserves the original tie-break slot on UPSERT (no reshuffle)", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("a")); // registeredAt=0
      registry.register(makeManifest("b")); // registeredAt=1
      registry.register(makeManifest("c")); // registeredAt=2

      registry.register(makeManifest("a", { title: "a v2" }));

      expect(registry.list().map((m) => m.id)).toEqual(["a", "b", "c"]);
    });

    it("returns a disposer that removes the manifest", () => {
      const registry = new WidgetRegistry();
      const dispose = registry.register(makeManifest("disposable"));

      expect(registry.has("disposable")).toBe(true);
      dispose();
      expect(registry.has("disposable")).toBe(false);
    });

    it("disposer is identity-checked: does not nuke a replacement", () => {
      const registry = new WidgetRegistry();
      const original = makeManifest("a");
      const dispose = registry.register(original);

      const replacement = makeManifest("a", { title: "replacement" });
      registry.register(replacement);

      dispose();

      expect(registry.has("a")).toBe(true);
      expect(registry.get("a")).toBe(replacement);
    });
  });

  describe("unregister", () => {
    it("returns true when an entry was actually removed", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("a"));

      expect(registry.unregister("a")).toBe(true);
      expect(registry.has("a")).toBe(false);
    });

    it("returns false for an unknown id (façade uses this to gate emit)", () => {
      const registry = new WidgetRegistry();

      expect(registry.unregister("never-registered")).toBe(false);
    });
  });

  describe("list ordering", () => {
    it("sorts by priority descending (higher priority first)", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("low", { priority: 10 }));
      registry.register(makeManifest("high", { priority: 200 }));
      registry.register(makeManifest("mid", { priority: 100 }));

      expect(registry.list().map((m) => m.id)).toEqual(["high", "mid", "low"]);
    });

    it("treats omitted priority as the default (100) for sort key", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("explicit", { priority: 100 }));
      registry.register(makeManifest("implicit")); // no priority => default 100

      expect(registry.list().map((m) => m.id)).toEqual(["explicit", "implicit"]);
    });

    it("tie-breaks ties by registration order (older first), not id alphabet", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("zebra", { priority: 50 }));
      registry.register(makeManifest("alpha", { priority: 50 }));
      registry.register(makeManifest("mango", { priority: 50 }));

      expect(registry.list().map((m) => m.id)).toEqual(["zebra", "alpha", "mango"]);
    });
  });

  describe("list filtering", () => {
    it("returns every widget when no filter is provided", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("d", { surface: "desktop:menubar" }));
      registry.register(makeManifest("w", { surface: "desktop:wallpaper" }));
      registry.register(makeManifest("m", { surface: "mobile:widgets" }));
      registry.register(makeManifest("a", { surface: "any" }));

      expect(
        registry
          .list()
          .map((m) => m.id)
          .sort(),
      ).toEqual(["a", "d", "m", "w"]);
    });

    it("filters by surface — `surface: 'any'` matches every concrete filter", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("d", { surface: "desktop:menubar" }));
      registry.register(makeManifest("w", { surface: "desktop:wallpaper" }));
      registry.register(makeManifest("m", { surface: "mobile:widgets" }));
      registry.register(makeManifest("a", { surface: "any" }));

      expect(
        registry
          .list({ surface: "desktop:menubar" })
          .map((m) => m.id)
          .sort(),
      ).toEqual(["a", "d"]);

      expect(
        registry
          .list({ surface: "desktop:wallpaper" })
          .map((m) => m.id)
          .sort(),
      ).toEqual(["a", "w"]);

      expect(
        registry
          .list({ surface: "mobile:widgets" })
          .map((m) => m.id)
          .sort(),
      ).toEqual(["a", "m"]);
    });

    it("returns a frozen array (callers cannot mutate the registry by reference)", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("a"));
      const list = registry.list();

      expect(Object.isFrozen(list)).toBe(true);
      expect(() => {
        (list as WidgetManifest[]).push(makeManifest("smuggled"));
      }).toThrow(TypeError);
    });
  });

  describe("__resetForTests", () => {
    it("clears the registry AND the registration counter (deterministic next id)", () => {
      const registry = new WidgetRegistry();
      registry.register(makeManifest("a"));
      registry.register(makeManifest("b"));

      registry.__resetForTests();

      expect(registry.list()).toHaveLength(0);

      registry.register(makeManifest("c", { priority: 50 }));
      registry.register(makeManifest("d", { priority: 50 }));
      expect(registry.list().map((m) => m.id)).toEqual(["c", "d"]);
    });
  });

  describe("type-shape spot checks", () => {
    it("accepts a manifest whose `component` returns a Promise (lazy import)", () => {
      const registry = new WidgetRegistry();
      const loader = vi.fn(() => Promise.resolve({ default: {} as never }));

      registry.register(makeManifest("lazy", { component: loader }));

      // The loader MUST NOT be called at registration time — that would
      expect(loader).not.toHaveBeenCalled();
    });
  });
});
