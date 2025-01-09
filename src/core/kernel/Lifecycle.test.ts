import { beforeEach, describe, expect, it, vi } from "vitest";

import { Lifecycle } from "./Lifecycle";
import type { AppHandle } from "~/types/app";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function makeHandle(id: string, manifestId = "manifest"): AppHandle {
  return {
    id,
    manifestId,
    on: vi.fn().mockReturnValue(() => {}),
    postMessage: vi.fn(),
  };
}

describe("Lifecycle", () => {
  beforeEach(async () => {
    const debug = await import("~/core/debug");
    vi.mocked(debug.debugWarn).mockClear();
  });

  it("register + on + emit calls the listener", () => {
    const lifecycle = new Lifecycle();
    const handle = makeHandle("h-1");
    const listener = vi.fn();

    lifecycle.register(handle);
    lifecycle.on("mounted", handle.id, listener);
    lifecycle.emit("mounted", handle.id);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("emit no-ops when handle is not registered", () => {
    const lifecycle = new Lifecycle();
    const listener = vi.fn();

    lifecycle.on("mounted", "never-registered", listener);
    lifecycle.emit("mounted", "never-registered");

    expect(listener).not.toHaveBeenCalled();
  });

  it("on returns an unsubscribe that removes the listener", () => {
    const lifecycle = new Lifecycle();
    const handle = makeHandle("h-2");
    const listener = vi.fn();

    lifecycle.register(handle);
    const off = lifecycle.on("activated", handle.id, listener);

    lifecycle.emit("activated", handle.id);
    off();
    lifecycle.emit("activated", handle.id);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unregister drops all listener buckets so subsequent emit no-ops", () => {
    const lifecycle = new Lifecycle();
    const handle = makeHandle("h-3");
    const listener = vi.fn();

    lifecycle.register(handle);
    lifecycle.on("destroyed", handle.id, listener);

    lifecycle.unregister(handle.id);
    lifecycle.emit("destroyed", handle.id);

    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners per phase, fired in registration order", () => {
    const lifecycle = new Lifecycle();
    const handle = makeHandle("h-4");
    const calls: string[] = [];

    lifecycle.register(handle);
    lifecycle.on("mounted", handle.id, () => calls.push("a"));
    lifecycle.on("mounted", handle.id, () => calls.push("b"));
    lifecycle.on("mounted", handle.id, () => calls.push("c"));

    lifecycle.emit("mounted", handle.id);

    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("emit('destroyed') BEFORE unregister fires the listener (4a contract)", () => {
    // Mirrors `kernel.processes.kill` ordering: emit must run while the
    const lifecycle = new Lifecycle();
    const handle = makeHandle("h-kill");
    const onDestroyed = vi.fn();

    lifecycle.register(handle);
    lifecycle.on("destroyed", handle.id, onDestroyed);

    lifecycle.emit("destroyed", handle.id);
    lifecycle.unregister(handle.id);

    expect(onDestroyed).toHaveBeenCalledTimes(1);
  });

  it("on() before register warns in dev and drops the listener", async () => {
    const lifecycle = new Lifecycle();
    const listener = vi.fn();
    const debug = await import("~/core/debug");

    const off = lifecycle.on("mounted", "never-registered", listener);

    expect(vi.mocked(debug.debugWarn)).toHaveBeenCalledWith(
      "[lifecycle] on() called for unregistered handle — listener dropped",
      "mounted",
      "never-registered",
    );

    lifecycle.register(makeHandle("never-registered"));
    lifecycle.emit("mounted", "never-registered");

    expect(listener).not.toHaveBeenCalled();

    expect(() => {
      off();
    }).not.toThrow();
  });

  it("phase isolation: emitting `mounted` does not invoke `activated` listeners", () => {
    const lifecycle = new Lifecycle();
    const handle = makeHandle("h-5");
    const onMounted = vi.fn();
    const onActivated = vi.fn();

    lifecycle.register(handle);
    lifecycle.on("mounted", handle.id, onMounted);
    lifecycle.on("activated", handle.id, onActivated);

    lifecycle.emit("mounted", handle.id);

    expect(onMounted).toHaveBeenCalledTimes(1);
    expect(onActivated).not.toHaveBeenCalled();
  });

  it("emits `suspended` to its own listener bucket without affecting other phases", () => {
    const lifecycle = new Lifecycle();
    const handle = makeHandle("h-suspend");
    const onSuspended = vi.fn();
    const onResumed = vi.fn();

    lifecycle.register(handle);
    lifecycle.on("suspended", handle.id, onSuspended);
    lifecycle.on("resumed", handle.id, onResumed);

    lifecycle.emit("suspended", handle.id);

    expect(onSuspended).toHaveBeenCalledTimes(1);
    expect(onResumed).not.toHaveBeenCalled();
  });

  it("emits `resumed` independently of `suspended`", () => {
    const lifecycle = new Lifecycle();
    const handle = makeHandle("h-resume");
    const onResumed = vi.fn();

    lifecycle.register(handle);
    lifecycle.on("resumed", handle.id, onResumed);

    lifecycle.emit("resumed", handle.id);
    lifecycle.emit("resumed", handle.id);

    expect(onResumed).toHaveBeenCalledTimes(2);
  });

  it("`created → suspended → resumed → destroyed` all reach their listeners in order", () => {
    const lifecycle = new Lifecycle();
    const handle = makeHandle("h-full");
    const calls: string[] = [];

    lifecycle.register(handle);
    lifecycle.on("created", handle.id, () => calls.push("created"));
    lifecycle.on("suspended", handle.id, () => calls.push("suspended"));
    lifecycle.on("resumed", handle.id, () => calls.push("resumed"));
    lifecycle.on("destroyed", handle.id, () => calls.push("destroyed"));

    lifecycle.emit("created", handle.id);
    lifecycle.emit("suspended", handle.id);
    lifecycle.emit("resumed", handle.id);
    lifecycle.emit("destroyed", handle.id);

    expect(calls).toEqual(["created", "suspended", "resumed", "destroyed"]);
  });
});
