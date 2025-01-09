import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kernel } from "./index";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("kernel.processes.kill — `app.killed` event (M1.3.0)", () => {
  beforeEach(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits `app.killed` once per successful kill with the originating manifestId + handleId", () => {
    const onKilled = vi.fn();
    const dispose = kernel.events.on("app.killed", onKilled);

    const handle = kernel.processes.spawn("about");
    kernel.processes.kill(handle.id);

    expect(onKilled).toHaveBeenCalledTimes(1);
    expect(onKilled).toHaveBeenCalledWith({
      manifestId: "about",
      handleId: handle.id,
      reason: "shell",
    });

    dispose();
  });

  it("emits `app.will-kill` before removing the handle from the process list", () => {
    const handle = kernel.processes.spawn("about");
    let handleStillListedWhenEmitted: boolean | undefined;
    const onWillKill = vi.fn(() => {
      const ids = Array.from(kernel.processes.list()).map(([id]) => id);
      handleStillListedWhenEmitted = ids.includes(handle.id);
    });
    const dispose = kernel.events.on("app.will-kill", onWillKill);

    kernel.processes.kill(handle.id, "user");

    expect(onWillKill).toHaveBeenCalledTimes(1);
    expect(onWillKill).toHaveBeenCalledWith({
      manifestId: "about",
      handleId: handle.id,
      reason: "user",
      waitUntil: expect.any(Function),
    });
    expect(handleStillListedWhenEmitted).toBe(true);

    dispose();
  });

  it("keeps the handle alive until app.will-kill waitUntil work settles", async () => {
    const gate = deferred();
    const handle = kernel.processes.spawn("about");
    const onKilled = vi.fn();
    const disposeWillKill = kernel.events.on("app.will-kill", (payload) => {
      if (payload.handleId === handle.id) {
        payload.waitUntil(gate.promise);
      }
    });
    const disposeKilled = kernel.events.on("app.killed", onKilled);

    kernel.processes.kill(handle.id);

    expect(Array.from(kernel.processes.list()).some(([id]) => id === handle.id)).toBe(true);
    expect(onKilled).not.toHaveBeenCalled();

    gate.resolve();
    await gate.promise;
    await Promise.resolve();

    expect(Array.from(kernel.processes.list()).some(([id]) => id === handle.id)).toBe(false);
    expect(onKilled).toHaveBeenCalledTimes(1);

    disposeWillKill();
    disposeKilled();
  });

  it("passes the `reason` through unchanged (user / shell / kernel)", () => {
    const reasons: string[] = [];
    const dispose = kernel.events.on("app.killed", (payload) => {
      reasons.push(payload.reason);
    });

    const a = kernel.processes.spawn("about");
    const b = kernel.processes.spawn("about");
    const c = kernel.processes.spawn("about");

    kernel.processes.kill(a.id, "user");
    kernel.processes.kill(b.id, "shell");
    kernel.processes.kill(c.id, "kernel");

    expect(reasons).toEqual(["user", "shell", "kernel"]);

    dispose();
  });

  it("does NOT emit `app.will-kill` when the handleId is unknown", () => {
    const onWillKill = vi.fn();
    const dispose = kernel.events.on("app.will-kill", onWillKill);

    kernel.processes.kill("h-never-existed");

    expect(onWillKill).not.toHaveBeenCalled();

    dispose();
  });

  it("does NOT emit `app.killed` when the handleId is unknown", () => {
    const onKilled = vi.fn();
    const dispose = kernel.events.on("app.killed", onKilled);

    kernel.processes.kill("h-never-existed");

    expect(onKilled).not.toHaveBeenCalled();

    dispose();
  });

  it("fires AFTER `ProcessTable.kill` succeeds — the handle is gone from the process list by the time the listener runs", () => {
    const handle = kernel.processes.spawn("about");
    let handleStillListedWhenEmitted: boolean | undefined;

    const dispose = kernel.events.on("app.killed", () => {
      const ids = Array.from(kernel.processes.list()).map(([id]) => id);
      handleStillListedWhenEmitted = ids.includes(handle.id);
    });

    kernel.processes.kill(handle.id);

    expect(handleStillListedWhenEmitted).toBe(false);

    dispose();
  });

  it('defaults `reason` to `"shell"` when caller omits it', () => {
    const onKilled = vi.fn();
    const dispose = kernel.events.on("app.killed", onKilled);

    const handle = kernel.processes.spawn("about");
    kernel.processes.kill(handle.id);

    expect(onKilled).toHaveBeenCalledWith(expect.objectContaining({ reason: "shell" }));

    dispose();
  });
});
