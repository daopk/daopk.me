import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as debug from "~/core/debug";
import { KVStore } from "~/core/storage/KVStore";

describe("KVStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses namespace:key physical keys", () => {
    const store = new KVStore<{ ok: boolean }>("app");
    store.set("doc", { ok: true });
    expect(window.localStorage.getItem("app:doc")).toBeTruthy();

    store.dispose();
  });

  it("round-trips JSON envelope", () => {
    const store = new KVStore<{ n: number }>("ns");

    store.set("k", { n: 1 });
    expect(store.get("k")).toEqual({ n: 1 });

    store.dispose();
  });

  it("returns null on malformed JSON", () => {
    window.localStorage.setItem("bad:k", "{{");

    const store = new KVStore("bad");

    expect(store.get("k")).toBeNull();

    store.dispose();
  });

  it("invokes migrate on envelope version mismatch", () => {
    window.localStorage.setItem(
      "m:key",

      JSON.stringify({
        __v: 99,

        data: { inherited: true },
      }),
    );

    const migrate = vi.fn((_stored: unknown, fromVersion: number) => {
      expect(fromVersion).toBe(99);

      return { inherited: false };
    });

    const store = new KVStore<{ inherited: boolean }>("m", {
      version: 1,

      migrate: migrate,
    });

    expect(store.get("key")).toEqual({ inherited: false });

    expect(migrate).toHaveBeenCalledTimes(1);

    store.dispose();
  });

  it("falls back to memory when localStorage throws", () => {
    // NOTE: `vi.spyOn(window.localStorage, ...)` does not survive `vi.restoreAllMocks()`
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = () => {
      throw new Error("blocked");
    };

    vi.spyOn(debug, "debugWarn").mockImplementation(() => {});

    try {
      const store = new KVStore<{ id: number }>("mem");

      store.set("a", { id: 1 });

      expect(store.get("a")).toEqual({ id: 1 });

      expect(store.has("a")).toBe(true);

      store.dispose();
    } finally {
      window.localStorage.setItem = originalSetItem;
    }
  });

  it("notifies on storage events for scoped keys only", () => {
    const onRemoteChange = vi.fn();

    const store = new KVStore("demo", { onRemoteChange });

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "demo:doc",

        storageArea: window.localStorage,
      }),
    );

    expect(onRemoteChange).toHaveBeenCalledTimes(1);

    onRemoteChange.mockClear();

    window.dispatchEvent(
      new StorageEvent("storage", { key: "other:doc", storageArea: window.localStorage }),
    );

    expect(onRemoteChange).not.toHaveBeenCalled();

    store.dispose();
  });

  it("does not persist when silent:true", () => {
    const store = new KVStore<{ x: boolean }>("q");

    store.set("doc", { x: true }, { silent: true });

    expect(window.localStorage.length).toBe(0);

    store.dispose();
  });

  it("keys lists scoped logical keys sorted", () => {
    window.localStorage.setItem("foreign:k", "{}");

    const store = new KVStore<string>("demo");

    store.set("b", "two");

    store.set("a", "one");

    expect(store.keys()).toEqual(["a", "b"]);

    store.dispose();

    window.localStorage.removeItem("foreign:k");
  });

  it("clear removes namespaced keys without touching other namespaces", () => {
    const store = new KVStore<{ n: number }>("demo");

    store.set("scoped", { n: 1 });

    window.localStorage.setItem("other:k", "persist");

    store.clear();

    expect(store.get("scoped")).toBeNull();

    expect(window.localStorage.getItem("other:k")).toBe("persist");

    store.dispose();

    window.localStorage.removeItem("other:k");
  });

  it("dispose removes listener", () => {
    const onRemoteChange = vi.fn();

    const store = new KVStore("demo", { onRemoteChange });

    store.dispose();

    window.dispatchEvent(
      new StorageEvent("storage", { key: "demo:doc", storageArea: window.localStorage }),
    );

    expect(onRemoteChange).not.toHaveBeenCalled();

    store.dispose();
  });
});
