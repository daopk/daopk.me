import { afterEach, describe, expect, it } from "vitest";

import type { ActiveProfileSession } from "~/types/profile";

import {
  clearActiveProfileSession,
  getActiveProfileSession,
  isProfileSessionLocked,
  lockActiveProfileSession,
  replaceActiveProfileSession,
  setActiveProfileSession,
  unlockActiveProfileSession,
  useProfileSessionLocked,
} from "./ProfileSession";

const session: ActiveProfileSession = {
  profileId: "alpha",
  displayName: "Alpha",
  owner: { kind: "guest" },
};

describe("ProfileSession lock state", () => {
  afterEach(() => {
    clearActiveProfileSession();
  });

  it("locks without clearing the active session", () => {
    setActiveProfileSession(session);

    lockActiveProfileSession();

    expect(getActiveProfileSession()).toEqual(session);
    expect(isProfileSessionLocked()).toBe(true);
    expect(useProfileSessionLocked().value).toBe(true);
  });

  it("unlock clears the privacy lock without replacing the active session", () => {
    setActiveProfileSession(session);
    lockActiveProfileSession();

    unlockActiveProfileSession();

    expect(getActiveProfileSession()).toEqual(session);
    expect(isProfileSessionLocked()).toBe(false);
  });

  it("replaces active profile metadata without clearing the privacy lock", () => {
    setActiveProfileSession(session);
    lockActiveProfileSession();

    replaceActiveProfileSession({
      ...session,
      displayName: "Linked Alpha",
      owner: { kind: "account", accountId: "account-1", linkedAt: 2 },
    });

    expect(getActiveProfileSession()).toEqual({
      profileId: "alpha",
      displayName: "Linked Alpha",
      owner: { kind: "account", accountId: "account-1", linkedAt: 2 },
    });
    expect(isProfileSessionLocked()).toBe(true);
  });

  it("replaces active profile metadata without locking an unlocked session", () => {
    setActiveProfileSession(session);

    replaceActiveProfileSession({ ...session, displayName: "Updated Alpha" });

    expect(getActiveProfileSession()?.displayName).toBe("Updated Alpha");
    expect(isProfileSessionLocked()).toBe(false);
  });

  it("requires an active profile before replacing its metadata", () => {
    expect(() => replaceActiveProfileSession(session)).toThrow(
      "Cannot replace without an active profile session.",
    );
    expect(isProfileSessionLocked()).toBe(false);
  });

  it("does not use metadata replacement to switch profiles", () => {
    setActiveProfileSession(session);
    lockActiveProfileSession();

    expect(() =>
      replaceActiveProfileSession({
        ...session,
        profileId: "beta",
      }),
    ).toThrow("Cannot replace the active session with a different profile.");
    expect(getActiveProfileSession()).toEqual(session);
    expect(isProfileSessionLocked()).toBe(true);
  });

  it("set and clear both reset the lock state to unlocked", () => {
    setActiveProfileSession(session);
    lockActiveProfileSession();

    setActiveProfileSession({ ...session, displayName: "Beta" });
    expect(isProfileSessionLocked()).toBe(false);

    lockActiveProfileSession();
    clearActiveProfileSession();

    expect(getActiveProfileSession()).toBeNull();
    expect(isProfileSessionLocked()).toBe(false);
  });
});
