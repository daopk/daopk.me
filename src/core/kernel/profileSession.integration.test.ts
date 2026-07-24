import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearActiveProfileSession,
  getActiveProfileSession,
  setActiveProfileSession,
} from "~/core/profile/ProfileSession";
import { ProfileStore } from "~/core/profile/ProfileStore";
import type { ActiveProfileSession } from "~/types/profile";

import { kernel } from "./index";

const session: ActiveProfileSession = {
  profileId: "alpha",
  displayName: "Guest",
  owner: { kind: "guest" },
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

describe("kernel profile privacy lock and reset", () => {
  afterEach(() => {
    kernel.dispose();
    clearActiveProfileSession();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("profile.lock keeps the active session, running apps, and page state", async () => {
    const reload = stubReload();
    setActiveProfileSession(session);
    const handle = kernel.processes.spawn("about");

    await kernel.profile.lock();

    expect(kernel.profile.isLocked()).toBe(true);
    expect(getActiveProfileSession()?.profileId).toBe("alpha");
    expect(Array.from(kernel.processes.list()).some(([id]) => id === handle.id)).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    kernel.profile.unlock();
    expect(kernel.profile.isLocked()).toBe(false);
    expect(getActiveProfileSession()).toEqual(session);
    kernel.processes.kill(handle.id);
  });

  it("profile.deleteCurrentProfile waits for teardown and deletes local data", async () => {
    const reload = stubReload();
    const store = new ProfileStore();
    store.add({
      id: "alpha",
      displayName: "Guest",
      createdAt: 1,
      owner: { kind: "guest" },
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
      const deletion = kernel.profile.deleteCurrentProfile();
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
