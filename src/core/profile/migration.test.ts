import { beforeEach, describe, expect, it, vi } from "vitest";

import "fake-indexeddb/auto";

import * as debug from "~/core/debug";
import { migrateGlobalDataToProfile } from "~/core/profile/migration";
import { profileIdbName, profileKvNamespace } from "~/core/profile/storageScope";
import { SETTINGS_KV_PRIMARY_KEY, VFS_IDB_DB_NAME } from "~/core/storage/constants";
import { KVStore } from "~/core/storage/KVStore";
import { IDBAdapter } from "~/core/vfs/adapters/IDBAdapter";
import { normalizeVfsPath } from "~/core/vfs/path";
import type { SettingsState } from "~/types/settings";

const decoder = new TextDecoder();

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("profile migration", () => {
  beforeEach(async () => {
    localStorage.clear();
    await Promise.all([
      deleteDatabase(VFS_IDB_DB_NAME),
      deleteDatabase(profileIdbName("alpha", "vfs")),
    ]);
  });

  it("copies global settings and VFS data into the first profile", async () => {
    const settings = new KVStore<Partial<SettingsState>>("settings");
    settings.set(SETTINGS_KV_PRIMARY_KEY, { theme: "dark" });
    settings.dispose();

    const globalVfs = new IDBAdapter({ dbName: VFS_IDB_DB_NAME });
    await globalVfs.mkdir(normalizeVfsPath("/notes"), { recursive: true });
    await globalVfs.write(normalizeVfsPath("/notes/today.md"), new TextEncoder().encode("hello"), {
      mimeType: "text/markdown",
    });
    globalVfs.dispose();

    await migrateGlobalDataToProfile({ profileId: "alpha" });

    const scopedSettings = new KVStore<Partial<SettingsState>>(
      profileKvNamespace("alpha", "settings"),
    );
    expect(scopedSettings.get(SETTINGS_KV_PRIMARY_KEY)).toEqual({ theme: "dark" });
    scopedSettings.dispose();

    const profileVfs = new IDBAdapter({ dbName: profileIdbName("alpha", "vfs") });
    const read = await profileVfs.read(normalizeVfsPath("/notes/today.md"));
    expect(decoder.decode(read.bytes)).toBe("hello");
    expect(read.stat.mimeType).toBe("text/markdown");
    profileVfs.dispose();
  });

  it("rejects when a migration step fails so import can be retried", async () => {
    const globalVfs = new IDBAdapter({ dbName: VFS_IDB_DB_NAME });
    await globalVfs.write(normalizeVfsPath("/broken.txt"), new TextEncoder().encode("broken"));
    globalVfs.dispose();

    const readSpy = vi.spyOn(IDBAdapter.prototype, "read").mockRejectedValueOnce(new Error("boom"));

    await expect(migrateGlobalDataToProfile({ profileId: "alpha" })).rejects.toThrow(
      "Profile VFS migration failed",
    );

    readSpy.mockRestore();
  });

  it("rejects when a KV copy only lands in memory fallback", async () => {
    const settings = new KVStore<Partial<SettingsState>>("settings");
    settings.set(SETTINGS_KV_PRIMARY_KEY, { theme: "dark" });
    settings.dispose();

    const targetPhysicalKey = `${profileKvNamespace("alpha", "settings")}:${SETTINGS_KV_PRIMARY_KEY}`;
    const originalSetItemDescriptor = Object.getOwnPropertyDescriptor(
      window.localStorage,
      "setItem",
    );
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    Object.defineProperty(window.localStorage, "setItem", {
      configurable: true,
      value: (key: string, value: string): void => {
        if (key === targetPhysicalKey) {
          throw new Error("quota");
        }

        originalSetItem(key, value);
      },
    });

    vi.spyOn(debug, "debugWarn").mockImplementation(() => {});

    try {
      await expect(migrateGlobalDataToProfile({ profileId: "alpha" })).rejects.toThrow(
        "Profile KV migration failed: settings",
      );
    } finally {
      if (originalSetItemDescriptor) {
        Object.defineProperty(window.localStorage, "setItem", originalSetItemDescriptor);
      } else {
        Reflect.deleteProperty(window.localStorage, "setItem");
      }
      vi.restoreAllMocks();
    }
  });
});
