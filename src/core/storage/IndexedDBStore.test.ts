import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "fake-indexeddb/auto";

import { IndexedDBStore } from "~/core/storage/IndexedDBStore";
import { StorageError } from "~/core/storage/types";

let dbCounter = 0;

describe("IndexedDBStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("persists primitives across async round-trip + keys/remove/clear", async () => {
    const dbName = `idbs-round-${Date.now()}-${dbCounter}`;
    dbCounter++;

    const store = new IndexedDBStore<number>(dbName, "records", 1);

    await store.set("a", 7);
    expect(await store.get("a")).toBe(7);
    expect(await store.keys()).toEqual(["a"]);

    await store.remove("a");
    expect(await store.get("a")).toBeNull();

    await store.set("z", 1);
    await store.clear();

    expect(await store.keys()).toEqual([]);
    store.close();
  });

  it("reads values through an IndexedDB range", async () => {
    const dbName = `idbs-values-${Date.now()}-${dbCounter}`;
    dbCounter++;

    const store = new IndexedDBStore<number>(dbName, "records", 1);

    await store.set("/notes/a", 1);
    await store.set("/notes/b", 2);
    await store.set("/other", 3);

    await expect(
      store.values(IDBKeyRange.bound("/notes/", "/notes/\uffff", false, false)),
    ).resolves.toEqual([1, 2]);
    store.close();
  });

  it("runs upgrade hook when bumping schema version", async () => {
    const dbName = `idbs-upgrade-${Date.now()}-${dbCounter}`;
    dbCounter++;

    const v1 = new IndexedDBStore<string>(dbName, "records", 1);
    await v1.set("k", "v");
    v1.close();

    const v2 = new IndexedDBStore<string>(dbName, "records", 2);
    expect(await v2.get("k")).toBe("v");
    await v2.clear();
    v2.close();
  });

  it("surfaces INVALID_VERSION ctor guard", () => {
    expect(() => {
      void new IndexedDBStore("bad", "s", 0);
    }).toThrow(StorageError);
  });
});

describe("IndexedDBStore without indexedDB", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws StorageError when indexedDB unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);

    const store = new IndexedDBStore("missing", "s", 1);

    await expect(store.get("k")).rejects.toMatchObject({
      code: "IDB_UNAVAILABLE",
    });

    store.close();
  });
});
