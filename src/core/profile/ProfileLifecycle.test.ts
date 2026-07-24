import { beforeEach, describe, expect, it, vi } from "vitest";

import "fake-indexeddb/auto";

import type {
  ProfileCoordination,
  ProfileExclusiveOperation,
} from "~/core/profile/ProfileCoordination";
import { createProfileLifecycle, ProfileLifecycleError } from "~/core/profile/ProfileLifecycle";
import {
  clearActiveProfileSession,
  getActiveProfileSession,
  isProfileSessionLocked,
  lockActiveProfileSession,
  setActiveProfileSession,
} from "~/core/profile/ProfileSession";
import { ProfileStore } from "~/core/profile/ProfileStore";
import { profileIdbName, profileKvNamespace } from "~/core/profile/storageScope";
import { KVStore } from "~/core/storage/KVStore";
import { IDBAdapter } from "~/core/vfs/adapters/IDBAdapter";
import { normalizeVfsPath } from "~/core/vfs/path";
import type { AccountProfileRecord, GuestProfileRecord } from "~/types/profile";

const guest: GuestProfileRecord = {
  id: "guest",
  displayName: "Guest",
  createdAt: 1,
  owner: { kind: "guest" },
};

class DeterministicProfileCoordination implements ProfileCoordination {
  private tail: Promise<void> = Promise.resolve();
  private active = 0;
  maxActive = 0;

  runExclusive<T>(operation: ProfileExclusiveOperation<T>): Promise<T> {
    const result = this.tail.then(async () => {
      this.active += 1;
      this.maxActive = Math.max(this.maxActive, this.active);
      try {
        return await operation();
      } finally {
        this.active -= 1;
      }
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe("ProfileLifecycle", () => {
  beforeEach(async () => {
    localStorage.clear();
    clearActiveProfileSession();
    await Promise.all([
      deleteDatabase(profileIdbName("guest", "vfs")),
      deleteDatabase(profileIdbName("account-cache", "vfs")),
    ]);
  });

  it("creates, imports, and opens a guest when no profile exists", async () => {
    const migrateGlobalData = vi.fn(async () => undefined);
    const store = new ProfileStore();
    const lifecycle = createProfileLifecycle({
      store,
      migrateGlobalData,
      now: () => 10,
    });

    const session = await lifecycle.bootstrapGuest();

    expect(session).toMatchObject({
      displayName: "Guest",
      owner: { kind: "guest" },
    });
    expect(migrateGlobalData).toHaveBeenCalledWith({
      profileId: session.profileId,
    });
    expect(store.getGuest()?.id).toBe(session.profileId);
    expect(store.hasImportedGlobalData()).toBe(true);
    expect(getActiveProfileSession()).toEqual(session);
    lifecycle.dispose();
    store.dispose();
  });

  it("opens an existing guest on every route without importing twice", async () => {
    const migrateGlobalData = vi.fn(async () => undefined);
    const store = new ProfileStore();
    store.add(guest);
    store.markGlobalImported(2);
    const lifecycle = createProfileLifecycle({ store, migrateGlobalData });

    await expect(lifecycle.bootstrapGuest()).resolves.toMatchObject({
      profileId: "guest",
      owner: { kind: "guest" },
    });
    expect(migrateGlobalData).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(1);
    lifecycle.dispose();
    store.dispose();
  });

  it("serializes the whole bootstrap so two contenders import only once", async () => {
    const coordination = new DeterministicProfileCoordination();
    const firstStore = new ProfileStore({ coordination });
    const secondStore = new ProfileStore({ coordination });
    const migrationStarted = deferred();
    const releaseMigration = deferred();
    const migrateGlobalData = vi.fn(async () => {
      migrationStarted.resolve();
      await releaseMigration.promise;
    });
    const first = createProfileLifecycle({
      store: firstStore,
      migrateGlobalData,
    });
    const second = createProfileLifecycle({
      store: secondStore,
      migrateGlobalData,
    });

    const firstBootstrap = first.bootstrapGuest().then((session) => {
      clearActiveProfileSession();
      return session;
    });
    await migrationStarted.promise;
    const secondBootstrap = second.bootstrapGuest();
    await Promise.resolve();

    expect(migrateGlobalData).toHaveBeenCalledTimes(1);

    releaseMigration.resolve();
    const [firstSession, secondSession] = await Promise.all([firstBootstrap, secondBootstrap]);

    expect(secondSession).toEqual(firstSession);
    expect(migrateGlobalData).toHaveBeenCalledTimes(1);
    expect(coordination.maxActive).toBe(1);
    expect(firstStore.list().filter((profile) => profile.owner.kind === "guest")).toHaveLength(1);
    first.dispose();
    second.dispose();
    firstStore.dispose();
    secondStore.dispose();
  });

  it("links the active guest in place without moving its KV or VFS data", async () => {
    const store = new ProfileStore();
    store.add(guest);
    store.markGlobalImported(2);
    const settings = new KVStore<{ theme: string }>(profileKvNamespace("guest", "settings"));
    settings.set("state", { theme: "dark" });
    settings.dispose();
    const vfs = new IDBAdapter({ dbName: profileIdbName("guest", "vfs") });
    await vfs.write(normalizeVfsPath("/note.txt"), new TextEncoder().encode("hello"));
    vfs.dispose();

    let currentTime = 10;
    const lifecycle = createProfileLifecycle({
      store,
      now: () => currentTime++,
    });
    await lifecycle.bootstrapGuest();
    const linked = await lifecycle.linkActiveGuest({ accountId: " account-1 " });
    const idempotent = await lifecycle.linkActiveGuest({ accountId: "account-1" });

    expect(linked).toEqual({
      profileId: "guest",
      displayName: "Guest",
      owner: { kind: "account", accountId: "account-1", linkedAt: 11 },
    });
    expect(idempotent).toEqual(linked);
    expect(store.get("guest")?.createdAt).toBe(1);

    const reopenedSettings = new KVStore<{ theme: string }>(
      profileKvNamespace(linked.profileId, "settings"),
    );
    expect(reopenedSettings.get("state")).toEqual({ theme: "dark" });
    reopenedSettings.dispose();
    const reopenedVfs = new IDBAdapter({
      dbName: profileIdbName(linked.profileId, "vfs"),
    });
    expect(
      new TextDecoder().decode((await reopenedVfs.read(normalizeVfsPath("/note.txt"))).bytes),
    ).toBe("hello");
    reopenedVfs.dispose();
    lifecycle.dispose();
    store.dispose();
  });

  it("validates account links without mutating the active guest", async () => {
    const store = new ProfileStore();
    store.add(guest);
    store.markGlobalImported(2);
    const lifecycle = createProfileLifecycle({ store });
    await lifecycle.bootstrapGuest();

    await expectLifecycleError(
      () => lifecycle.linkActiveGuest({ accountId: " " }),
      "INVALID_ACCOUNT",
    );
    expect(store.get("guest")?.owner).toEqual({ kind: "guest" });

    lifecycle.dispose();
    store.dispose();
  });

  it("preserves the privacy lock while promoting guest ownership", async () => {
    const store = new ProfileStore();
    store.add(guest);
    store.markGlobalImported(2);
    const lifecycle = createProfileLifecycle({ store, now: () => 10 });
    await lifecycle.bootstrapGuest();
    lockActiveProfileSession();

    await expect(lifecycle.linkActiveGuest({ accountId: "account-1" })).resolves.toMatchObject({
      profileId: "guest",
      owner: { kind: "account", accountId: "account-1", linkedAt: 10 },
    });

    expect(isProfileSessionLocked()).toBe(true);
    lifecycle.dispose();
    store.dispose();
  });

  it("rejects linking an account already owned by another local profile", async () => {
    const account: AccountProfileRecord = {
      id: "account-cache",
      displayName: "Cached Account",
      createdAt: 1,
      owner: { kind: "account", accountId: "account-1", linkedAt: 2 },
    };
    const store = new ProfileStore();
    store.add(account);
    store.add(guest);
    store.markGlobalImported(3);
    const lifecycle = createProfileLifecycle({ store });
    await lifecycle.bootstrapGuest();

    await expectLifecycleError(
      () => lifecycle.linkActiveGuest({ accountId: "account-1" }),
      "ACCOUNT_ALREADY_LINKED",
    );
    expect(store.get("guest")?.owner).toEqual({ kind: "guest" });

    lifecycle.dispose();
    store.dispose();
  });

  it("requires an active profile before linking", async () => {
    const store = new ProfileStore();
    const lifecycle = createProfileLifecycle({ store });

    await expectLifecycleError(
      () => lifecycle.linkActiveGuest({ accountId: "account-1" }),
      "NO_ACTIVE_PROFILE",
    );
    lifecycle.dispose();
    store.dispose();
  });

  it("rejects changing an already linked profile to another account", async () => {
    const account: AccountProfileRecord = {
      id: "account-cache",
      displayName: "Cached Account",
      createdAt: 1,
      owner: { kind: "account", accountId: "account-1", linkedAt: 2 },
    };
    const store = new ProfileStore();
    store.add(account);
    setActiveProfileSession({
      profileId: account.id,
      displayName: account.displayName,
      owner: account.owner,
    });
    const lifecycle = createProfileLifecycle({ store });

    await expectLifecycleError(
      () => lifecycle.linkActiveGuest({ accountId: "account-2" }),
      "PROFILE_ALREADY_LINKED",
    );
    lifecycle.dispose();
    store.dispose();
  });

  it("serializes competing account links and commits exactly one owner", async () => {
    const coordination = new DeterministicProfileCoordination();
    const firstStore = new ProfileStore({ coordination });
    const secondStore = new ProfileStore({ coordination });
    firstStore.add(guest);
    firstStore.markGlobalImported(2);
    setActiveProfileSession({
      profileId: guest.id,
      displayName: guest.displayName,
      owner: guest.owner,
    });
    const first = createProfileLifecycle({ store: firstStore, now: () => 10 });
    const second = createProfileLifecycle({ store: secondStore, now: () => 20 });

    const firstLink = first.linkActiveGuest({ accountId: "account-1" });
    const secondLink = second.linkActiveGuest({ accountId: "account-2" });
    const [firstResult, secondResult] = await Promise.allSettled([firstLink, secondLink]);

    expect(firstResult).toMatchObject({
      status: "fulfilled",
      value: {
        profileId: "guest",
        owner: { kind: "account", accountId: "account-1", linkedAt: 10 },
      },
    });
    expect(secondResult).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        code: "PROFILE_ALREADY_LINKED",
      }),
    });
    expect(firstStore.get("guest")?.owner).toEqual({
      kind: "account",
      accountId: "account-1",
      linkedAt: 10,
    });
    expect(coordination.maxActive).toBe(1);

    first.dispose();
    second.dispose();
    firstStore.dispose();
    secondStore.dispose();
  });
});

async function expectLifecycleError(
  action: () => Promise<unknown>,
  code: ProfileLifecycleError["code"],
): Promise<void> {
  try {
    await action();
    throw new Error("Expected ProfileLifecycleError");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ProfileLifecycleError);
    expect((error as ProfileLifecycleError).code).toBe(code);
  }
}
