import { afterEach, describe, expect, it } from "vitest";

import type { ActiveProfileSession } from "~/types/profile";

import {
  clearActiveProfileSession,
  getActiveProfileSession,
  isProfileSessionLocked,
  lockActiveProfileSession,
  setActiveProfileSession,
  unlockActiveProfileSession,
  useProfileSessionLocked,
} from "./ProfileSession";

const session: ActiveProfileSession = {
  profileId: "alpha",
  displayName: "Alpha",
  authMode: "passkey",
  encryption: "none",
  encrypted: false,
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

  it("unlock clears the lock state and can replace the active session", () => {
    const next: ActiveProfileSession = {
      ...session,
      displayName: "Alpha Reloaded",
    };
    setActiveProfileSession(session);
    lockActiveProfileSession();

    unlockActiveProfileSession(next);

    expect(getActiveProfileSession()).toEqual(next);
    expect(isProfileSessionLocked()).toBe(false);
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
