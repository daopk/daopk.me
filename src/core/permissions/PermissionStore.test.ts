import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePermissionStore } from "./PermissionStore";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

describe("PermissionStore (M3.5)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    const store = usePermissionStore();
    store.dispose();
    localStorage.clear();
  });

  describe("hydration", () => {
    it("starts empty before hydrate", () => {
      const store = usePermissionStore();
      expect(store.list()).toEqual([]);
      expect(store.isHydrated()).toBe(false);
    });

    it("hydrate() restores persisted decisions", () => {
      const data = {
        decisions: {
          "weather-widget": {
            "notifications.post": { granted: true, decidedAt: 1700000000000 },
          },
          "rss-reader": {
            "notifications.post": { granted: false, decidedAt: 1700000001000 },
            "network.fetch": { granted: true, decidedAt: 1700000002000 },
          },
        },
      };
      localStorage.setItem("permissions:state", JSON.stringify({ __v: 1, data }));

      const store = usePermissionStore();
      store.hydrate();

      expect(store.isHydrated()).toBe(true);
      expect(store.get("weather-widget", "notifications.post")).toEqual({
        granted: true,
        decidedAt: 1700000000000,
      });
      expect(store.get("rss-reader", "network.fetch")).toEqual({
        granted: true,
        decidedAt: 1700000002000,
      });
      expect(store.list()).toHaveLength(3);
    });

    it("hydrate() defaults to empty when no persisted blob exists", () => {
      const store = usePermissionStore();
      store.hydrate();
      expect(store.list()).toEqual([]);
      expect(store.isHydrated()).toBe(true);
    });

    it("coerceState drops malformed entries (missing fields, bad types)", () => {
      const data = {
        decisions: {
          good: {
            "notifications.post": { granted: true, decidedAt: 1700000000000 },
          },
          badGranted: {
            "notifications.post": { granted: "yes", decidedAt: 1700000000000 },
          },
          badDecidedAt: {
            "notifications.post": { granted: true, decidedAt: "now" },
          },
          missingFields: {
            "notifications.post": { granted: true },
          },
          nonFinite: {
            "notifications.post": { granted: true, decidedAt: Infinity },
          },
        },
      };
      localStorage.setItem("permissions:state", JSON.stringify({ __v: 1, data }));

      const store = usePermissionStore();
      store.hydrate();

      expect(store.list().map((e) => e.manifestId)).toEqual(["good"]);
    });

    it("coerceState keeps the valid entries when only some rows in an app are bad", () => {
      const data = {
        decisions: {
          mixed: {
            "notifications.post": { granted: true, decidedAt: 1 },
            "network.fetch": { granted: "no" },
          },
        },
      };
      localStorage.setItem("permissions:state", JSON.stringify({ __v: 1, data }));

      const store = usePermissionStore();
      store.hydrate();

      expect(store.get("mixed", "notifications.post")).toBeDefined();
      expect(store.get("mixed", "network.fetch")).toBeUndefined();
    });
  });

  describe("set / get / remove / list", () => {
    it("set() updates in-memory state and persists to KV", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("rss-reader", "notifications.post", true, 1700000000000);

      expect(store.get("rss-reader", "notifications.post")).toEqual({
        granted: true,
        decidedAt: 1700000000000,
      });

      const raw = localStorage.getItem("permissions:state");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as { data: { decisions: Record<string, unknown> } };
      expect(parsed.data.decisions).toHaveProperty("rss-reader");
    });

    it("set() with the same `granted` is a no-op (preserves original decidedAt)", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("rss-reader", "notifications.post", true, 1700000000000);
      // Re-affirm same grant later — must NOT update decidedAt nor
      // wake the cross-tab listener.
      store.set("rss-reader", "notifications.post", true, 1799999999999);

      expect(store.get("rss-reader", "notifications.post")?.decidedAt).toBe(1700000000000);
    });

    it("set() with a different `granted` overwrites and updates decidedAt", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("rss-reader", "notifications.post", true, 1700000000000);
      store.set("rss-reader", "notifications.post", false, 1800000000000);

      expect(store.get("rss-reader", "notifications.post")).toEqual({
        granted: false,
        decidedAt: 1800000000000,
      });
    });

    it("set() supports multiple permissions per manifest", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("rss-reader", "notifications.post", true, 1);
      store.set("rss-reader", "network.fetch", true, 2);

      expect(store.get("rss-reader", "notifications.post")?.granted).toBe(true);
      expect(store.get("rss-reader", "network.fetch")?.granted).toBe(true);
    });

    it("remove() returns true on success and false when the entry is missing", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("rss-reader", "notifications.post", true, 1);

      expect(store.remove("rss-reader", "notifications.post")).toBe(true);
      expect(store.get("rss-reader", "notifications.post")).toBeUndefined();
      expect(store.remove("rss-reader", "notifications.post")).toBe(false);
      expect(store.remove("never-existed", "notifications.post")).toBe(false);
    });

    it("remove() drops the outer manifestId key once it has no permissions left", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("rss-reader", "notifications.post", true, 1);
      store.set("rss-reader", "network.fetch", true, 2);
      store.remove("rss-reader", "notifications.post");

      expect(store.decisions["rss-reader"]).toBeDefined();

      store.remove("rss-reader", "network.fetch");
      expect(store.decisions["rss-reader"]).toBeUndefined();
    });

    it("list() returns a flat array with manifestId + permission inlined", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("a", "notifications.post", true, 1);
      store.set("b", "network.fetch", false, 2);

      const entries = store.list();
      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual({
        manifestId: "a",
        permission: "notifications.post",
        granted: true,
        decidedAt: 1,
      });
      expect(entries).toContainEqual({
        manifestId: "b",
        permission: "network.fetch",
        granted: false,
        decidedAt: 2,
      });
    });

    it("list({ manifestId }) filters to a single app", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("a", "notifications.post", true, 1);
      store.set("b", "network.fetch", false, 2);

      expect(store.list({ manifestId: "a" })).toEqual([
        {
          manifestId: "a",
          permission: "notifications.post",
          granted: true,
          decidedAt: 1,
        },
      ]);
    });
  });

  describe("disposed-store guard", () => {
    it("set() before hydrate is a no-op", () => {
      const store = usePermissionStore();
      store.set("a", "notifications.post", true);
      expect(store.get("a", "notifications.post")).toBeUndefined();
    });

    it("set() after dispose is a no-op", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("a", "notifications.post", true, 1);
      store.dispose();

      store.set("b", "notifications.post", true, 2);
      expect(store.get("b", "notifications.post")).toBeUndefined();
    });

    it("remove() after dispose returns false and is a no-op", () => {
      const store = usePermissionStore();
      store.hydrate();
      store.set("a", "notifications.post", true, 1);
      store.dispose();

      expect(store.remove("a", "notifications.post")).toBe(false);
    });
  });

  describe("dispose / re-hydrate", () => {
    it("dispose() flips isHydrated() back to false and lets a fresh hydrate succeed", () => {
      const store = usePermissionStore();
      store.hydrate();
      expect(store.isHydrated()).toBe(true);
      store.dispose();
      expect(store.isHydrated()).toBe(false);
      store.hydrate();
      expect(store.isHydrated()).toBe(true);
    });

    it("re-hydrate re-reads from KV (picks up writes from another tab)", () => {
      const store = usePermissionStore();
      store.hydrate();
      expect(store.get("a", "notifications.post")).toBeUndefined();

      const data = {
        decisions: { a: { "notifications.post": { granted: true, decidedAt: 42 } } },
      };
      localStorage.setItem("permissions:state", JSON.stringify({ __v: 1, data }));

      store.dispose();
      store.hydrate();

      expect(store.get("a", "notifications.post")).toEqual({
        granted: true,
        decidedAt: 42,
      });
    });
  });

  describe("cross-tab sync", () => {
    it("a `storage` event for `permissions:state` updates the in-memory ref", () => {
      const store = usePermissionStore();
      store.hydrate();
      expect(store.get("a", "notifications.post")).toBeUndefined();

      const data = {
        decisions: { a: { "notifications.post": { granted: true, decidedAt: 99 } } },
      };
      localStorage.setItem("permissions:state", JSON.stringify({ __v: 1, data }));

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "permissions:state",
          newValue: JSON.stringify({ __v: 1, data }),
          storageArea: localStorage,
        }),
      );

      expect(store.get("a", "notifications.post")).toEqual({
        granted: true,
        decidedAt: 99,
      });
    });
  });
});
