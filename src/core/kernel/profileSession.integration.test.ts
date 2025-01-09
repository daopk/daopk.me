import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActiveProfileSession } from "~/types/profile";
import {
  clearActiveProfileSession,
  getActiveProfileSession,
  setActiveProfileSession,
} from "~/core/profile/ProfileSession";
import { ProfileStore } from "~/core/profile/ProfileStore";

import { kernel } from "./index";

const session: ActiveProfileSession = {
  profileId: "alpha",
  displayName: "Alpha",
  authMode: "passkey",
  encryption: "none",
  encrypted: false,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function stubReload(): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  vi.stubGlobal("location", { reload } as unknown as Location);
  return reload;
}

describe("kernel profile session lock/signOut", () => {
  afterEach(() => {
    kernel.dispose();
    clearActiveProfileSession();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("profile.lock soft-locks without clearing session, killing processes, or reloading", async () => {
    const reload = stubReload();
    setActiveProfileSession(session);
    const handle = kernel.processes.spawn("about");

    await kernel.profile.lock();

    expect(kernel.profile.isLocked()).toBe(true);
    expect(getActiveProfileSession()?.profileId).toBe("alpha");
    expect(Array.from(kernel.processes.list()).some(([id]) => id === handle.id)).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    kernel.processes.kill(handle.id);
  });

  it("profile.signOut kills apps, waits for async teardown, clears session, and reloads", async () => {
    const reload = stubReload();
    setActiveProfileSession(session);
    const gate = deferred();
    const first = kernel.processes.spawn("notes");
    const second = kernel.processes.spawn("finder");
    const stopWillKill = kernel.events.on("app.will-kill", (payload) => {
      if (payload.handleId === first.id) {
        payload.waitUntil(gate.promise);
      }
    });

    try {
      const signOut = kernel.profile.signOut();
      await Promise.resolve();

      expect(reload).not.toHaveBeenCalled();
      expect(getActiveProfileSession()?.profileId).toBe("alpha");
      expect(Array.from(kernel.processes.list()).some(([id]) => id === first.id)).toBe(true);
      expect(Array.from(kernel.processes.list()).some(([id]) => id === second.id)).toBe(false);

      gate.resolve();
      await signOut;

      expect(Array.from(kernel.processes.list())).toHaveLength(0);
      expect(getActiveProfileSession()).toBeNull();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      stopWillKill();
    }
  });

  it("profile.deleteCurrentAccount waits for teardown, deletes account data, clears session, and reloads", async () => {
    const reload = stubReload();
    const store = new ProfileStore();
    store.add({
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
    });
    store.dispose();
    localStorage.setItem("profiles:alpha:settings:state", "alpha-settings");
    setActiveProfileSession(session);
    const gate = deferred();
    const handle = kernel.processes.spawn("settings");
    const stopWillKill = kernel.events.on("app.will-kill", (payload) => {
      if (payload.handleId === handle.id) {
        payload.waitUntil(gate.promise);
      }
    });

    try {
      const deletion = kernel.profile.deleteCurrentAccount();
      await Promise.resolve();

      expect(reload).not.toHaveBeenCalled();
      expect(getActiveProfileSession()?.profileId).toBe("alpha");
      expect(localStorage.getItem("profiles:alpha:settings:state")).toBe("alpha-settings");

      gate.resolve();
      await deletion;

      const next = new ProfileStore();
      expect(next.get("alpha")).toBeNull();
      next.dispose();
      expect(localStorage.getItem("profiles:alpha:settings:state")).toBeNull();
      expect(Array.from(kernel.processes.list())).toHaveLength(0);
      expect(getActiveProfileSession()).toBeNull();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      stopWillKill();
    }
  });
});
