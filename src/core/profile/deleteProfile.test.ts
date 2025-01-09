import { beforeEach, describe, expect, it } from "vitest";

import "fake-indexeddb/auto";

import { deleteProfileAccount, deleteProfileStorage } from "~/core/profile/deleteProfile";
import { ProfileStore } from "~/core/profile/ProfileStore";
import { profileIdbName } from "~/core/profile/storageScope";
import { WALLPAPERS_IDB_STORE_NAME, WALLPAPERS_IDB_VERSION } from "~/core/storage/constants";
import { IndexedDBStore } from "~/core/storage/IndexedDBStore";
import { IDBAdapter } from "~/core/vfs/adapters/IDBAdapter";
import { normalizeVfsPath } from "~/core/vfs/path";
import type { GuestProfileRecord, PasskeyProfileRecord } from "~/types/profile";

const alpha: PasskeyProfileRecord = {
  id: "alpha",
  displayName: "Alpha",
  createdAt: 1,
  authMode: "passkey",
  credentialId: "credential",
  userHandle: "user",
  publicKey: "public-key",
  publicKeyAlg: -7,
  transports: ["internal"],
  encryption: "none",
};

const beta: GuestProfileRecord = {
  id: "beta",
  displayName: "Beta",
  createdAt: 2,
  authMode: "guest",
  encryption: "none",
};

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearDatabases(): Promise<void> {
  await Promise.all([
    deleteDatabase(profileIdbName("alpha", "vfs")),
    deleteDatabase(profileIdbName("alpha", "trash")),
    deleteDatabase(profileIdbName("alpha", "wallpapers")),
    deleteDatabase(profileIdbName("beta", "vfs")),
  ]);
}

describe("profile deletion", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearDatabases();
  });

  it("deletes profile-scoped localStorage and IndexedDB data only", async () => {
    localStorage.setItem("profiles:index", "profile-index");
    localStorage.setItem("profiles:alpha:settings:state", "alpha-settings");
    localStorage.setItem("profiles:alpha:tokens:state", "alpha-tokens");
    localStorage.setItem("profiles:beta:settings:state", "beta-settings");

    const alphaVfs = new IDBAdapter({ dbName: profileIdbName("alpha", "vfs") });
    await alphaVfs.write(normalizeVfsPath("/alpha.txt"), new TextEncoder().encode("alpha"));
    alphaVfs.dispose();

    const alphaTrash = new IDBAdapter({ dbName: profileIdbName("alpha", "trash") });
    await alphaTrash.write(normalizeVfsPath("/deleted.txt"), new TextEncoder().encode("trash"));
    alphaTrash.dispose();

    const betaVfs = new IDBAdapter({ dbName: profileIdbName("beta", "vfs") });
    await betaVfs.write(normalizeVfsPath("/beta.txt"), new TextEncoder().encode("beta"));
    betaVfs.dispose();

    const alphaWallpapers = new IndexedDBStore<Blob>(
      profileIdbName("alpha", "wallpapers"),
      WALLPAPERS_IDB_STORE_NAME,
      WALLPAPERS_IDB_VERSION,
    );
    await alphaWallpapers.set("wallpaper", new Blob(["image"]));
    alphaWallpapers.close();

    await deleteProfileStorage("alpha");

    expect(localStorage.getItem("profiles:index")).toBe("profile-index");
    expect(localStorage.getItem("profiles:alpha:settings:state")).toBeNull();
    expect(localStorage.getItem("profiles:alpha:tokens:state")).toBeNull();
    expect(localStorage.getItem("profiles:beta:settings:state")).toBe("beta-settings");

    const deletedVfs = new IDBAdapter({ dbName: profileIdbName("alpha", "vfs") });
    await expect(deletedVfs.read(normalizeVfsPath("/alpha.txt"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    deletedVfs.dispose();

    const deletedTrash = new IDBAdapter({ dbName: profileIdbName("alpha", "trash") });
    await expect(deletedTrash.read(normalizeVfsPath("/deleted.txt"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    deletedTrash.dispose();

    const betaAfter = new IDBAdapter({ dbName: profileIdbName("beta", "vfs") });
    await expect(betaAfter.read(normalizeVfsPath("/beta.txt"))).resolves.toMatchObject({
      path: "/beta.txt",
    });
    betaAfter.dispose();

    const deletedWallpapers = new IndexedDBStore<Blob>(
      profileIdbName("alpha", "wallpapers"),
      WALLPAPERS_IDB_STORE_NAME,
      WALLPAPERS_IDB_VERSION,
    );
    await expect(deletedWallpapers.keys()).resolves.toEqual([]);
    deletedWallpapers.close();
  });

  it("deletes storage before removing the profile record", async () => {
    const store = new ProfileStore();
    store.add(alpha);
    store.add(beta);
    store.dispose();
    localStorage.setItem("profiles:alpha:settings:state", "alpha-settings");

    await deleteProfileAccount("alpha");

    const next = new ProfileStore();
    expect(next.get("alpha")).toBeNull();
    expect(next.get("beta")).toEqual(beta);
    expect(localStorage.getItem("profiles:alpha:settings:state")).toBeNull();
    next.dispose();
  });
});
