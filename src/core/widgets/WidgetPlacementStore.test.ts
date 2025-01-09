import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import {
  autoPlace,
  resolveNearestFreeWidgetPlacement,
  useWidgetPlacementStore,
} from "./WidgetPlacementStore";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

describe("WidgetPlacementStore (M3.7)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    const store = useWidgetPlacementStore();
    store.dispose();
    localStorage.clear();
  });

  describe("hydration", () => {
    it("starts empty before hydrate", () => {
      const store = useWidgetPlacementStore();
      expect(store.list()).toEqual({});
      expect(store.isHydrated()).toBe(false);
    });

    it("hydrate() restores persisted placements", () => {
      const data = {
        placements: {
          "clock:desktop-big": { gridX: 24, gridY: 0 },
          "test:widget-fixture": { gridX: 24, gridY: 4 },
        },
      };
      localStorage.setItem("widgets:state", JSON.stringify({ __v: 1, data }));

      const store = useWidgetPlacementStore();
      store.hydrate();

      expect(store.isHydrated()).toBe(true);
      expect(store.get("clock:desktop-big")).toEqual({ gridX: 24, gridY: 0 });
      expect(store.get("test:widget-fixture")).toEqual({ gridX: 24, gridY: 4 });
    });

    it("migrates legacy clock widget ids and persists the normalized shape once", () => {
      const data = {
        placements: {
          "desktop:big-clock": { gridX: 24, gridY: 0 },
          "clock:desktop-big": { gridX: 4, gridY: 2 },
        },
        enabled: {
          desktop: {
            "status:clock": false,
            "desktop:big-clock": false,
            "mobile:big-clock": false,
            "clock:desktop-big": true,
          },
          mobile: {
            "mobile:big-clock": false,
          },
        },
      };
      localStorage.setItem("widgets:state", JSON.stringify({ __v: 1, data }));

      const store = useWidgetPlacementStore();
      store.hydrate();

      expect(store.get("desktop:big-clock")).toBeUndefined();
      expect(store.get("clock:desktop-big")).toEqual({ gridX: 4, gridY: 2 });
      expect(store.listEnabled("desktop")).toEqual({
        "clock:menubar": false,
        "clock:desktop-big": true,
        "clock:mobile-big": false,
      });
      expect(store.listEnabled("mobile")).toEqual({ "clock:mobile-big": false });

      const raw = localStorage.getItem("widgets:state");
      const parsed = JSON.parse(raw!) as {
        data: {
          placements: Record<string, { gridX: number; gridY: number }>;
          enabled: { desktop: Record<string, boolean>; mobile: Record<string, boolean> };
        };
      };
      expect(parsed.data.placements["desktop:big-clock"]).toBeUndefined();
      expect(parsed.data.placements["clock:desktop-big"]).toEqual({ gridX: 4, gridY: 2 });
      expect(parsed.data.enabled.desktop["status:clock"]).toBeUndefined();
      expect(parsed.data.enabled.desktop["clock:menubar"]).toBe(false);
    });

    it("hydrate() defaults to empty when no persisted blob exists", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      expect(store.list()).toEqual({});
      expect(store.isHydrated()).toBe(true);
    });

    it("coerceState drops malformed entries (non-finite, non-number, missing fields)", () => {
      const data = {
        placements: {
          good: { gridX: 4, gridY: 8 },
          missing: { gridX: 4 }, // missing gridY → drop
          notANumber: { gridX: "x", gridY: 0 }, // bad type → drop
          infinite: { gridX: Infinity, gridY: 0 }, // non-finite → drop
        },
      };
      localStorage.setItem("widgets:state", JSON.stringify({ __v: 1, data }));

      const store = useWidgetPlacementStore();
      store.hydrate();

      expect(Object.keys(store.list()).sort()).toEqual(["good"]);
    });

    it("coerceState clamps negative coordinates to 0 and floors fractions", () => {
      const data = {
        placements: {
          neg: { gridX: -5, gridY: -3 },
          frac: { gridX: 4.7, gridY: 8.2 },
        },
      };
      localStorage.setItem("widgets:state", JSON.stringify({ __v: 1, data }));

      const store = useWidgetPlacementStore();
      store.hydrate();

      expect(store.get("neg")).toEqual({ gridX: 0, gridY: 0 });
      expect(store.get("frac")).toEqual({ gridX: 4, gridY: 8 });
    });
  });

  describe("set / get / remove", () => {
    it("set() updates in-memory state and persists to KV", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      store.set("clock:desktop-big", { gridX: 24, gridY: 0 });

      expect(store.get("clock:desktop-big")).toEqual({ gridX: 24, gridY: 0 });

      const raw = localStorage.getItem("widgets:state");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as {
        data: { placements: Record<string, { gridX: number; gridY: number }> };
      };
      expect(parsed.data.placements["clock:desktop-big"]).toEqual({ gridX: 24, gridY: 0 });
    });

    it("set() sanitizes negative + fractional coords on the write path", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      store.set("test", { gridX: -10, gridY: 4.6 });
      expect(store.get("test")).toEqual({ gridX: 0, gridY: 4 });
    });

    it("set() with the same value is a no-op (skips persist)", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      store.set("test", { gridX: 4, gridY: 4 });

      const raw1 = localStorage.getItem("widgets:state");
      // Re-set identical value; if the store wrote we'd see localStorage
      // change. We can't easily detect a no-op write at the localStorage
      const before = store.placements;
      store.set("test", { gridX: 4, gridY: 4 });
      expect(store.placements).toBe(before);

      const raw2 = localStorage.getItem("widgets:state");
      expect(raw2).toBe(raw1);
    });

    it("remove() clears the entry and persists", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      store.set("test", { gridX: 4, gridY: 4 });
      store.remove("test");
      expect(store.get("test")).toBeUndefined();
    });

    it("remove() on a missing id is a no-op", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      const before = store.placements;
      store.remove("never-set");
      expect(store.placements).toBe(before);
    });
  });

  describe("disposed-store guard", () => {
    it("set() before hydrate is a no-op (no in-memory drift)", () => {
      const store = useWidgetPlacementStore();
      store.set("test", { gridX: 4, gridY: 4 });
      expect(store.get("test")).toBeUndefined();
    });

    it("set() after dispose is a no-op", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      store.set("a", { gridX: 4, gridY: 4 });
      store.dispose();

      // Post-dispose write must NOT mutate the in-memory ref —
      store.set("b", { gridX: 8, gridY: 8 });
      expect(store.get("b")).toBeUndefined();
    });
  });

  describe("dispose", () => {
    it("dispose() flips isHydrated() back to false and lets a fresh hydrate succeed", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      expect(store.isHydrated()).toBe(true);
      store.dispose();
      expect(store.isHydrated()).toBe(false);
      store.hydrate();
      expect(store.isHydrated()).toBe(true);
    });
  });

  describe("enabled flag (M3.8)", () => {
    it("isEnabled(unknown id) returns true (default-enabled rule)", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      expect(store.isEnabled("desktop", "never-set")).toBe(true);
      expect(store.isEnabled("mobile", "never-set")).toBe(true);
    });

    it("isEnabled falls back to the caller-supplied manifest default", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      expect(store.isEnabled("desktop", "app:optional", false)).toBe(false);
      expect(store.isEnabled("mobile", "system:pinned", true)).toBe(true);
    });

    it("setEnabled(scope, id, false) flips only that shell and persists under the scope", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      store.setEnabled("desktop", "widget:a", false);

      expect(store.isEnabled("desktop", "widget:a")).toBe(false);
      expect(store.isEnabled("mobile", "widget:a")).toBe(true);
      expect(store.listEnabled("desktop")).toEqual({ "widget:a": false });
      expect(store.listEnabled("mobile")).toEqual({});

      const raw = localStorage.getItem("widgets:state");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as {
        data: { enabled: { desktop: Record<string, boolean>; mobile: Record<string, boolean> } };
      };
      expect(parsed.data.enabled).toEqual({ desktop: { "widget:a": false }, mobile: {} });
    });

    it("setEnabled(scope, id, true) after a disable DELETES that shell key", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      store.setEnabled("desktop", "widget:a", false);
      expect(store.listEnabled("desktop")).toEqual({ "widget:a": false });

      store.setEnabled("desktop", "widget:a", true);
      expect(store.listEnabled("desktop")).toEqual({});
      expect(store.isEnabled("desktop", "widget:a")).toBe(true);

      const raw = localStorage.getItem("widgets:state");
      const parsed = JSON.parse(raw!) as {
        data: { enabled: { desktop: Record<string, boolean>; mobile: Record<string, boolean> } };
      };
      expect(parsed.data.enabled).toEqual({ desktop: {}, mobile: {} });
    });

    it("setEnabled persists true for optional widgets and deletes it when reset to default", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();

      store.setEnabled("mobile", "app:optional", true, false);
      expect(store.isEnabled("mobile", "app:optional", false)).toBe(true);
      expect(store.listEnabled("mobile")).toEqual({ "app:optional": true });

      store.setEnabled("mobile", "app:optional", false, false);
      expect(store.isEnabled("mobile", "app:optional", false)).toBe(false);
      expect(store.listEnabled("mobile")).toEqual({});
    });

    it("setEnabled with the same effective value is a no-op (skips persist)", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      store.setEnabled("desktop", "widget:a", false);

      const before = store.enabled;
      store.setEnabled("desktop", "widget:a", false);
      expect(store.enabled).toBe(before);

      store.setEnabled("mobile", "widget:never-touched", true);
      expect(store.enabled).toBe(before);
    });

    it("desktop and mobile flags for the same id are independent", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();

      store.setEnabled("desktop", "app:shared", false);
      expect(store.isEnabled("desktop", "app:shared")).toBe(false);
      expect(store.isEnabled("mobile", "app:shared")).toBe(true);

      store.setEnabled("mobile", "app:shared", false);
      expect(store.listEnabled("desktop")).toEqual({ "app:shared": false });
      expect(store.listEnabled("mobile")).toEqual({ "app:shared": false });

      store.setEnabled("desktop", "app:shared", true);
      expect(store.isEnabled("desktop", "app:shared")).toBe(true);
      expect(store.isEnabled("mobile", "app:shared")).toBe(false);
    });

    it("persistence round-trip: enabled flag survives hydrate after a fresh KV instance", () => {
      const store1 = useWidgetPlacementStore();
      store1.hydrate();
      store1.setEnabled("desktop", "widget:a", false);
      store1.setEnabled("mobile", "widget:b", false);
      store1.dispose();

      // localStorage, exercising the full coerce → applyState path.
      const store2 = useWidgetPlacementStore();
      store2.hydrate();
      expect(store2.isEnabled("desktop", "widget:a")).toBe(false);
      expect(store2.isEnabled("mobile", "widget:b")).toBe(false);
      expect(store2.isEnabled("mobile", "widget:a")).toBe(true);
    });

    it("coerceState handles old M3.7 blobs without an `enabled` field (additive migration)", () => {
      const oldShape = {
        placements: {
          "widget:a": { gridX: 4, gridY: 0 },
        },
      };
      localStorage.setItem("widgets:state", JSON.stringify({ __v: 1, data: oldShape }));

      const store = useWidgetPlacementStore();
      store.hydrate();
      expect(store.get("widget:a")).toEqual({ gridX: 4, gridY: 0 });
      expect(store.isEnabled("desktop", "widget:a")).toBe(true);
      expect(store.isEnabled("mobile", "widget:a")).toBe(true);
      expect(store.listEnabled("desktop")).toEqual({});
      expect(store.listEnabled("mobile")).toEqual({});
    });

    it("coerceState copies the legacy global enabled map into both shell scopes", () => {
      const data = {
        placements: {},
        enabled: {
          good: false,
          stringValue: "yes", // bad type → drop
          numValue: 1, // bad type → drop
          "": true, // empty id → drop
          alsoGood: true,
        },
      };
      localStorage.setItem("widgets:state", JSON.stringify({ __v: 1, data }));

      const store = useWidgetPlacementStore();
      store.hydrate();
      expect(store.listEnabled("desktop")).toEqual({ good: false, alsoGood: true });
      expect(store.listEnabled("mobile")).toEqual({ good: false, alsoGood: true });
    });

    it("coerceState defends against malformed scoped enabled shapes", () => {
      const data = {
        placements: {},
        enabled: {
          desktop: {
            good: false,
            stringValue: "yes",
          },
          mobile: {
            alsoGood: true,
            numValue: 1,
          },
        },
      };
      localStorage.setItem("widgets:state", JSON.stringify({ __v: 1, data }));

      const store = useWidgetPlacementStore();
      store.hydrate();
      expect(store.listEnabled("desktop")).toEqual({ good: false });
      expect(store.listEnabled("mobile")).toEqual({ alsoGood: true });

      const data2 = { placements: {}, enabled: null };
      localStorage.setItem("widgets:state", JSON.stringify({ __v: 1, data: data2 }));
      store.dispose();
      store.hydrate();
      expect(store.listEnabled("desktop")).toEqual({});
      expect(store.listEnabled("mobile")).toEqual({});
    });

    it("setEnabled before hydrate is a no-op (no in-memory drift)", () => {
      const store = useWidgetPlacementStore();
      store.setEnabled("desktop", "widget:a", false);
      expect(store.isEnabled("desktop", "widget:a")).toBe(true);
    });

    it("enabled and placements are isolated: clearing one doesn't touch the other", () => {
      const store = useWidgetPlacementStore();
      store.hydrate();
      store.set("widget:a", { gridX: 4, gridY: 0 });
      store.setEnabled("desktop", "widget:a", false);

      store.remove("widget:a");
      expect(store.isEnabled("desktop", "widget:a")).toBe(false);
      store.setEnabled("desktop", "widget:a", true);
      expect(store.get("widget:a")).toBeUndefined();
    });
  });
});

describe("autoPlace (M3.7)", () => {
  it("places a widget at top-right of an empty viewport", () => {
    expect(autoPlace("sm", [], 24, 16)).toEqual({ gridX: 20, gridY: 0 });
  });

  it("places md widgets respecting their wider footprint (8×4)", () => {
    expect(autoPlace("md", [], 24, 16)).toEqual({ gridX: 16, gridY: 0 });
  });

  it("places lg widgets at top-right (8×8)", () => {
    expect(autoPlace("lg", [], 24, 16)).toEqual({ gridX: 16, gridY: 0 });
  });

  it("avoids collisions with the required one-cell gap", () => {
    const occupied = [{ x: 20, y: 0, w: 4, h: 4 }];
    expect(autoPlace("sm", occupied, 24, 16)).toEqual({ gridX: 15, gridY: 0 });
  });

  it("falls into the next row when the first row is full of small widgets", () => {
    const occupied = [
      { x: 20, y: 0, w: 4, h: 4 },
      { x: 15, y: 0, w: 4, h: 4 },
      { x: 10, y: 0, w: 4, h: 4 },
      { x: 5, y: 0, w: 4, h: 4 },
      { x: 0, y: 0, w: 4, h: 4 },
    ];
    expect(autoPlace("sm", occupied, 24, 16)).toEqual({ gridX: 20, gridY: 5 });
  });

  it("returns (0,0) on overflow when no slot fits in the viewport", () => {
    expect(autoPlace("sm", [], 3, 3)).toEqual({ gridX: 0, gridY: 0 });
  });

  it("returns (0,0) when every slot is occupied", () => {
    const occupied = [{ x: 0, y: 0, w: 4, h: 4 }];
    expect(autoPlace("sm", occupied, 8, 8)).toEqual({ gridX: 0, gridY: 0 });
  });
});

describe("resolveNearestFreeWidgetPlacement", () => {
  it("returns the requested placement when it is already legal", () => {
    expect(resolveNearestFreeWidgetPlacement("sm", { gridX: 10, gridY: 2 }, [], 24, 16)).toEqual({
      gridX: 10,
      gridY: 2,
    });
  });

  it("clamps the requested placement to the viewport before resolving", () => {
    expect(resolveNearestFreeWidgetPlacement("sm", { gridX: 999, gridY: 999 }, [], 24, 16)).toEqual(
      { gridX: 20, gridY: 12 },
    );
  });

  it("moves a colliding request to the nearest slot with a one-cell gap", () => {
    const occupied = [{ x: 20, y: 0, w: 4, h: 4 }];
    expect(
      resolveNearestFreeWidgetPlacement("sm", { gridX: 20, gridY: 0 }, occupied, 24, 16),
    ).toEqual({ gridX: 15, gridY: 0 });
  });

  it("returns undefined when no legal slot exists", () => {
    const occupied = [{ x: 0, y: 0, w: 4, h: 4 }];
    expect(resolveNearestFreeWidgetPlacement("sm", { gridX: 0, gridY: 0 }, occupied, 4, 4)).toBe(
      undefined,
    );
  });
});
