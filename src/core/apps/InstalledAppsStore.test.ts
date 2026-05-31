import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExternalAppManifest } from "~/types/externalApp";

import { type InstalledAppRecord, useInstalledAppsStore } from "./InstalledAppsStore";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function manifest(overrides: Partial<ExternalAppManifest> = {}): ExternalAppManifest {
  return {
    id: "hello-world",
    name: "Hello World",
    version: "1.0.0",
    category: "productivity",
    entry: "https://apps.example.com/hello/app.mjs",
    icon: { type: "url", src: "https://apps.example.com/hello/icon.png" },
    ...overrides,
  };
}

function record(overrides: Partial<ExternalAppManifest> = {}): InstalledAppRecord {
  const m = manifest(overrides);
  return { manifestUrl: `https://apps.example.com/${m.id}/manifest.json`, manifest: m };
}

function writeKv(apps: Record<string, unknown>): string {
  const raw = JSON.stringify({ __v: 1, data: { apps } });
  localStorage.setItem("apps:state", raw);
  return raw;
}

describe("InstalledAppsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    useInstalledAppsStore().dispose();
    localStorage.clear();
  });

  describe("hydration", () => {
    it("starts empty before hydrate", () => {
      const store = useInstalledAppsStore();
      expect(store.list()).toEqual([]);
      expect(store.isHydrated()).toBe(false);
    });

    it("restores persisted records", () => {
      writeKv({ "hello-world": record() });
      const store = useInstalledAppsStore();
      store.hydrate();

      expect(store.isHydrated()).toBe(true);
      expect(store.isExternalApp("hello-world")).toBe(true);
      expect(store.get("hello-world")?.manifest.name).toBe("Hello World");
    });

    it("drops malformed records (bad manifest, missing url, key/id mismatch)", () => {
      writeKv({
        "hello-world": record(),
        "bad-manifest": {
          manifestUrl: "https://x/m.json",
          manifest: { id: "bad-manifest", name: "" },
        },
        "no-url": { manifest: manifest({ id: "no-url" }) },
        "wrong-key": record({ id: "actually-different" }),
      });
      const store = useInstalledAppsStore();
      store.hydrate();

      expect(store.list().map((r) => r.manifest.id)).toEqual(["hello-world"]);
    });

    it("defaults to empty when no blob exists", () => {
      const store = useInstalledAppsStore();
      store.hydrate();
      expect(store.list()).toEqual([]);
      expect(store.isHydrated()).toBe(true);
    });
  });

  describe("add / remove / get", () => {
    it("add() updates state and persists to KV", () => {
      const store = useInstalledAppsStore();
      store.hydrate();
      store.add(record());

      expect(store.has("hello-world")).toBe(true);
      const raw = localStorage.getItem("apps:state");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as { data: { apps: Record<string, unknown> } };
      expect(parsed.data.apps).toHaveProperty("hello-world");
    });

    it("remove() returns true then false, and clears state", () => {
      const store = useInstalledAppsStore();
      store.hydrate();
      store.add(record());

      expect(store.remove("hello-world")).toBe(true);
      expect(store.has("hello-world")).toBe(false);
      expect(store.remove("hello-world")).toBe(false);
      expect(store.remove("never")).toBe(false);
    });

    it("add()/remove() before hydrate are no-ops", () => {
      const store = useInstalledAppsStore();
      store.add(record());
      expect(store.has("hello-world")).toBe(false);
      expect(store.remove("hello-world")).toBe(false);
    });

    it("add()/remove() after dispose are no-ops", () => {
      const store = useInstalledAppsStore();
      store.hydrate();
      store.add(record());
      store.dispose();

      expect(store.remove("hello-world")).toBe(false);
      store.add(record({ id: "second" }));
      expect(store.has("second")).toBe(false);
    });
  });

  describe("cross-tab reconcile", () => {
    it("a storage event updates state and invokes onReconcile with the records", () => {
      const onReconcile = vi.fn();
      const store = useInstalledAppsStore();
      store.hydrate({ onReconcile });

      writeKv({ "hello-world": record() });
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "apps:state",
          newValue: localStorage.getItem("apps:state"),
          storageArea: localStorage,
        }),
      );

      expect(store.isExternalApp("hello-world")).toBe(true);
      expect(onReconcile).toHaveBeenCalledTimes(1);
      const records = onReconcile.mock.calls[0]![0] as InstalledAppRecord[];
      expect(records.map((r) => r.manifest.id)).toEqual(["hello-world"]);
    });

    it("local add() does NOT invoke onReconcile (the acting tab owns the registry)", () => {
      const onReconcile = vi.fn();
      const store = useInstalledAppsStore();
      store.hydrate({ onReconcile });
      store.add(record());
      expect(onReconcile).not.toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("dispose() flips isHydrated() back to false and allows re-hydrate", () => {
      const store = useInstalledAppsStore();
      store.hydrate();
      expect(store.isHydrated()).toBe(true);
      store.dispose();
      expect(store.isHydrated()).toBe(false);
      store.hydrate();
      expect(store.isHydrated()).toBe(true);
    });
  });
});
