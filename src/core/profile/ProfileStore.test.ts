import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "fake-indexeddb/auto";

import {
  PROFILE_INDEX_KV_NAMESPACE,
  PROFILE_INDEX_KV_PRIMARY_KEY,
  PROFILE_INDEX_VERSION,
  ProfileStore,
} from "~/core/profile/ProfileStore";
import { profileIdbName } from "~/core/profile/storageScope";
import { IDBAdapter } from "~/core/vfs/adapters/IDBAdapter";
import { normalizeVfsPath } from "~/core/vfs/path";
import type { AccountProfileRecord, GuestProfileRecord } from "~/types/profile";

const guestA: GuestProfileRecord = {
  id: "guest-a",
  displayName: "Guest",
  createdAt: 1,
  owner: { kind: "guest" },
};

const guestB: GuestProfileRecord = {
  id: "guest-b",
  displayName: "Guest Again",
  createdAt: 2,
  owner: { kind: "guest" },
};

const account: AccountProfileRecord = {
  id: "alpha",
  displayName: "Alpha",
  createdAt: 3,
  owner: { kind: "account", accountId: "account-alpha", linkedAt: 4 },
};

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe("ProfileStore", () => {
  beforeEach(async () => {
    localStorage.clear();
    await deleteDatabase(profileIdbName("legacy-passkey", "vfs"));
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("keeps one guest and one local profile per linked account", () => {
    const store = new ProfileStore();
    store.add(guestA);
    store.add(guestB);
    store.add(account);
    store.add({ ...account, id: "duplicate-account" });

    expect(store.list()).toHaveLength(2);
    expect(store.getGuest()).toEqual(guestA);
    expect(store.get("alpha")).toEqual(account);
    expect(store.get("duplicate-account")).toBeNull();

    store.dispose();
  });

  it("removes profiles and falls back to the most recently opened profile", () => {
    const store = new ProfileStore();
    store.add(guestA);
    store.add(account);
    store.setLastActive("guest-a", 100);
    store.setLastActive("alpha", 50);

    expect(store.remove("alpha")).toBe(true);
    expect(store.get("alpha")).toBeNull();
    expect(store.read().lastActiveProfileId).toBe("guest-a");
    expect(store.remove("missing")).toBe(false);

    store.dispose();
  });

  it("migrates the preferred v1 guest and drops passkey records from the v2 index", () => {
    writeVersionOneState({
      profiles: [
        legacyGuest("guest-a", "Guest", 1),
        legacyPasskey("legacy-passkey"),
        legacyGuest("guest-b", "Preferred Guest", 2),
      ],
      lastActiveProfileId: "guest-b",
      importedGlobalAt: 42,
    });

    const store = new ProfileStore();
    expect(store.read()).toEqual({
      profiles: [
        {
          id: "guest-b",
          displayName: "Preferred Guest",
          createdAt: 2,
          owner: { kind: "guest" },
        },
      ],
      lastActiveProfileId: "guest-b",
      importedGlobalAt: 42,
    });
    expect(store.get("legacy-passkey")).toBeNull();
    store.dispose();

    const rewritten = JSON.parse(
      localStorage.getItem(`${PROFILE_INDEX_KV_NAMESPACE}:${PROFILE_INDEX_KV_PRIMARY_KEY}`) ??
        "null",
    ) as { __v?: number };
    expect(rewritten.__v).toBe(PROFILE_INDEX_VERSION);
  });

  it("does not preserve the global-import latch when v1 contains only passkeys", () => {
    writeVersionOneState({
      profiles: [legacyPasskey("legacy-passkey")],
      lastActiveProfileId: "legacy-passkey",
      importedGlobalAt: 42,
    });

    const store = new ProfileStore();
    expect(store.read()).toEqual({ profiles: [], lastActiveProfileId: null });
    expect(store.hasImportedGlobalData()).toBe(false);
    store.dispose();
  });

  it("leaves dropped passkey localStorage and IndexedDB bytes untouched", async () => {
    writeVersionOneState({
      profiles: [legacyPasskey("legacy-passkey")],
      lastActiveProfileId: "legacy-passkey",
    });
    localStorage.setItem("profiles:legacy-passkey:settings:state", "legacy-settings");
    const legacyVfs = new IDBAdapter({
      dbName: profileIdbName("legacy-passkey", "vfs"),
    });
    await legacyVfs.write(normalizeVfsPath("/legacy.txt"), new TextEncoder().encode("legacy"));
    legacyVfs.dispose();

    const store = new ProfileStore();
    expect(store.read().profiles).toEqual([]);
    store.dispose();

    expect(localStorage.getItem("profiles:legacy-passkey:settings:state")).toBe("legacy-settings");
    const reopened = new IDBAdapter({
      dbName: profileIdbName("legacy-passkey", "vfs"),
    });
    await expect(reopened.read(normalizeVfsPath("/legacy.txt"))).resolves.toMatchObject({
      path: "/legacy.txt",
    });
    reopened.dispose();
  });
});

function writeVersionOneState(state: unknown): void {
  localStorage.setItem(
    `${PROFILE_INDEX_KV_NAMESPACE}:${PROFILE_INDEX_KV_PRIMARY_KEY}`,
    JSON.stringify({ __v: 1, data: state }),
  );
}

function legacyGuest(id: string, displayName: string, createdAt: number) {
  return {
    id,
    displayName,
    createdAt,
    authMode: "guest",
    encryption: "none",
  };
}

function legacyPasskey(id: string) {
  return {
    id,
    displayName: "Legacy Passkey",
    createdAt: 3,
    authMode: "passkey",
    credentialId: "credential",
    userHandle: "user",
    publicKey: "public-key",
    publicKeyAlg: -7,
    transports: ["internal"],
    encryption: "none",
  };
}
