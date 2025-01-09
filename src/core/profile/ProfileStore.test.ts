import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PROFILE_INDEX_KV_NAMESPACE,
  PROFILE_INDEX_KV_PRIMARY_KEY,
  ProfileStore,
} from "~/core/profile/ProfileStore";
import type { GuestProfileRecord, PasskeyProfileRecord } from "~/types/profile";

const guestA: GuestProfileRecord = {
  id: "guest-a",
  displayName: "Guest",
  createdAt: 1,
  authMode: "guest",
  encryption: "none",
};

const guestB: GuestProfileRecord = {
  id: "guest-b",
  displayName: "Guest Again",
  createdAt: 2,
  authMode: "guest",
  encryption: "none",
};

const passkey: PasskeyProfileRecord = {
  id: "alpha",
  displayName: "Alpha",
  createdAt: 3,
  authMode: "passkey",
  credentialId: "credential",
  userHandle: "user",
  publicKey: "public-key",
  publicKeyAlg: -7,
  transports: ["internal"],
  encryption: "none",
};

describe("ProfileStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("keeps guest accounts singleton when adding profiles", () => {
    const store = new ProfileStore();
    store.add(guestA);
    store.add(guestB);
    store.add(passkey);

    const profiles = store.list();
    expect(profiles.filter((profile) => profile.authMode === "guest")).toEqual([guestA]);
    expect(store.getGuest()).toEqual(guestA);
    expect(profiles.some((profile) => profile.id === "alpha")).toBe(true);

    store.dispose();
  });

  it("removes profiles and falls back to the most recently used profile", () => {
    const store = new ProfileStore();
    store.add(guestA);
    store.add(passkey);
    store.setLastActive("guest-a", 100);
    store.setLastActive("alpha", 50);

    expect(store.remove("alpha")).toBe(true);
    expect(store.get("alpha")).toBeNull();
    expect(store.read().lastActiveProfileId).toBe("guest-a");
    expect(store.remove("missing")).toBe(false);

    store.dispose();
  });

  it("keeps the current last-active profile when removing an inactive profile", () => {
    const store = new ProfileStore();
    store.add(guestA);
    store.add(passkey);
    store.setLastActive("alpha", 100);

    expect(store.remove("guest-a")).toBe(true);
    expect(store.read().lastActiveProfileId).toBe("alpha");

    store.dispose();
  });

  function writeRawProfileIndex(state: unknown): void {
    localStorage.setItem(
      `${PROFILE_INDEX_KV_NAMESPACE}:${PROFILE_INDEX_KV_PRIMARY_KEY}`,
      JSON.stringify({ __v: 1, data: state }),
    );
  }

  it("dedupes raw legacy guest records by preserving the last-active guest", () => {
    writeRawProfileIndex({
      profiles: [guestA, guestB, passkey],
      lastActiveProfileId: "guest-b",
    });
    const store = new ProfileStore();

    const state = store.read();
    expect(state.profiles.filter((profile) => profile.authMode === "guest")).toEqual([guestB]);
    expect(state.lastActiveProfileId).toBe("guest-b");
    expect(store.getGuest()).toEqual(guestB);

    store.dispose();
  });

  it("dedupes raw legacy guest records by keeping the first guest when no guest is active", () => {
    writeRawProfileIndex({
      profiles: [guestA, guestB, passkey],
      lastActiveProfileId: "alpha",
    });
    const store = new ProfileStore();

    const state = store.read();
    expect(state.profiles.filter((profile) => profile.authMode === "guest")).toEqual([guestA]);
    expect(state.lastActiveProfileId).toBe("alpha");

    store.dispose();
  });
});
