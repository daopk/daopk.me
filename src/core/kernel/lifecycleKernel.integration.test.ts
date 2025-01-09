import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { kernel } from "./index";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("kernel — M3.1 lifecycle integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("suspend / resume", () => {
    it("suspend flips `running → suspended` and fires `lifecycle.suspended` exactly once", () => {
      const handle = kernel.processes.spawn("about");
      const listener = vi.fn();
      const dispose = kernel.lifecycleCoordinator.on("suspended", handle.id, listener);

      kernel.processes.suspend(handle.id);

      const record = Array.from(kernel.processes.list()).find(([id]) => id === handle.id)?.[1];
      expect(record?.state).toBe("suspended");
      expect(listener).toHaveBeenCalledTimes(1);

      dispose();
      kernel.processes.kill(handle.id);
    });

    it("resume flips `suspended → running` and fires `lifecycle.resumed` exactly once", () => {
      const handle = kernel.processes.spawn("about");
      kernel.processes.suspend(handle.id);

      const listener = vi.fn();
      const dispose = kernel.lifecycleCoordinator.on("resumed", handle.id, listener);

      kernel.processes.resume(handle.id);

      const record = Array.from(kernel.processes.list()).find(([id]) => id === handle.id)?.[1];
      expect(record?.state).toBe("running");
      expect(listener).toHaveBeenCalledTimes(1);

      dispose();
      kernel.processes.kill(handle.id);
    });

    it("redundant suspend/resume calls emit nothing (idempotent contract)", () => {
      const handle = kernel.processes.spawn("about");
      const onSuspended = vi.fn();
      const onResumed = vi.fn();
      const offSuspended = kernel.lifecycleCoordinator.on("suspended", handle.id, onSuspended);
      const offResumed = kernel.lifecycleCoordinator.on("resumed", handle.id, onResumed);

      // Already running — second resume must no-op.
      kernel.processes.resume(handle.id);
      expect(onResumed).not.toHaveBeenCalled();

      kernel.processes.suspend(handle.id);
      expect(onSuspended).toHaveBeenCalledTimes(1);

      // Already suspended — second suspend must no-op.
      kernel.processes.suspend(handle.id);
      expect(onSuspended).toHaveBeenCalledTimes(1);

      offSuspended();
      offResumed();
      kernel.processes.kill(handle.id);
    });

    it("suspend/resume on an unknown handle emits nothing and does not throw", () => {
      expect(() => kernel.processes.suspend("never-existed")).not.toThrow();
      expect(() => kernel.processes.resume("never-existed")).not.toThrow();
    });
  });

  describe("destroyed ordering (existing contract — re-verified post-M3.1)", () => {
    it("kill fires `app.killed` BEFORE `lifecycle.destroyed`", () => {
      const handle = kernel.processes.spawn("about");
      const order = vi.fn();
      const offAppKilled = kernel.events.on("app.killed", () => order("app.killed"));
      const offDestroyed = kernel.lifecycleCoordinator.on("destroyed", handle.id, () =>
        order("lifecycle.destroyed"),
      );

      kernel.processes.kill(handle.id);

      expect(order.mock.calls.map((c) => c[0])).toEqual(["app.killed", "lifecycle.destroyed"]);

      offAppKilled();
      offDestroyed();
    });
  });

  describe("singleton reuse — no duplicate `created`", () => {
    it("relaunching a singleton does NOT add a second handle to processes.list()", async () => {
      setActivePinia(createPinia());

      const SINGLETON_ID = "test-singleton-m31";

      kernel.apps.register({
        id: SINGLETON_ID,
        name: "Singleton (M3.1 test)",
        category: "system",
        singleton: true,
        component: () =>
          new Promise<never>(() => {
            // intentionally hangs — no AppMount in this test
          }),
        icon: undefined as unknown as never, // type escape: AppManifest demands an icon; not relevant here
      });

      const onLaunched = vi.fn();
      const dispose = kernel.events.on("app.launched", onLaunched);

      const first = await kernel.apps.launch(SINGLETON_ID);
      const second = await kernel.apps.launch(SINGLETON_ID);

      expect(first.id).toBe(second.id);

      const procIds = Array.from(kernel.processes.list())
        .map(([id]) => id)
        .filter((id) => id === first.id);
      expect(procIds).toHaveLength(1);

      expect(onLaunched).toHaveBeenCalledTimes(2);
      expect(onLaunched).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ reusedExisting: true }),
      );

      dispose();
      kernel.processes.kill(first.id);
      kernel.apps.unregister(SINGLETON_ID);
    });

    it("does not reuse a singleton handle that is pending async kill", async () => {
      setActivePinia(createPinia());

      const SINGLETON_ID = "test-singleton-pending-kill";
      const gate = deferred();

      kernel.apps.register({
        id: SINGLETON_ID,
        name: "Pending kill singleton",
        category: "system",
        singleton: true,
        component: () =>
          new Promise<never>(() => {
            // intentionally hangs — no AppMount in this test
          }),
        icon: undefined as unknown as never,
      });

      const stopWillKill = kernel.events.on("app.will-kill", (payload) => {
        if (payload.manifestId === SINGLETON_ID) {
          payload.waitUntil(gate.promise);
        }
      });

      const first = await kernel.apps.launch(SINGLETON_ID);
      kernel.processes.kill(first.id);
      let relaunchResolved = false;
      const relaunch = kernel.apps.launch(SINGLETON_ID).then((handle) => {
        relaunchResolved = true;
        return handle;
      });

      await Promise.resolve();
      expect(relaunchResolved).toBe(false);
      expect(Array.from(kernel.processes.list()).some(([id]) => id === first.id)).toBe(true);

      gate.resolve();
      await gate.promise;
      await Promise.resolve();

      const second = await relaunch;
      expect(second.id).not.toBe(first.id);
      expect(Array.from(kernel.processes.list()).some(([id]) => id === first.id)).toBe(false);
      expect(Array.from(kernel.processes.list()).some(([id]) => id === second.id)).toBe(true);
      await expect(kernel.apps.launch(SINGLETON_ID)).resolves.toEqual(
        expect.objectContaining({ id: second.id }),
      );

      stopWillKill();
      kernel.processes.kill(second.id);
      kernel.apps.unregister(SINGLETON_ID);
    });
  });

  describe("launch args (F1)", () => {
    it("kernel.apps.launch forwards args into ProcessTable + freezes the snapshot", async () => {
      setActivePinia(createPinia());

      const MANIFEST_ID = "test-args-fresh";
      kernel.apps.register({
        id: MANIFEST_ID,
        name: "Args fresh (F1 test)",
        category: "system",
        component: () =>
          new Promise<never>(() => {
            // intentionally hangs — no AppMount in this test
          }),
        icon: undefined as unknown as never,
      });

      const handle = await kernel.apps.launch(MANIFEST_ID, { cwd: "/foo" });

      const record = Array.from(kernel.processes.list()).find(([id]) => id === handle.id)?.[1];
      expect(record?.args).toEqual({ cwd: "/foo" });
      expect(Object.isFrozen(record?.args)).toBe(true);

      kernel.processes.kill(handle.id);
      kernel.apps.unregister(MANIFEST_ID);
    });

    it("D3 — singleton relaunch with new args fires debugWarn AND keeps original args", async () => {
      setActivePinia(createPinia());

      const MANIFEST_ID = "test-args-singleton";
      kernel.apps.register({
        id: MANIFEST_ID,
        name: "Args singleton (F1 test)",
        category: "system",
        singleton: true,
        component: () =>
          new Promise<never>(() => {
            // intentionally hangs
          }),
        icon: undefined as unknown as never,
      });

      const debugWarnSpy = vi
        .spyOn(await import("~/core/debug"), "debugWarn")
        .mockImplementation(() => undefined);

      const first = await kernel.apps.launch(MANIFEST_ID, { cwd: "/first" });
      const second = await kernel.apps.launch(MANIFEST_ID, { cwd: "/second" });

      expect(first.id).toBe(second.id);

      const record = Array.from(kernel.processes.list()).find(([id]) => id === first.id)?.[1];
      expect(record?.args).toEqual({ cwd: "/first" });

      const dropCalls = debugWarnSpy.mock.calls.filter(
        (call) => typeof call[1] === "string" && call[1].includes("dropping new args"),
      );
      expect(dropCalls).toHaveLength(1);

      kernel.processes.kill(first.id);
      kernel.apps.unregister(MANIFEST_ID);
    });

    it("singleton relaunch WITHOUT new args does NOT log the drop warning (quiet common path)", async () => {
      setActivePinia(createPinia());

      const MANIFEST_ID = "test-args-singleton-quiet";
      kernel.apps.register({
        id: MANIFEST_ID,
        name: "Args singleton quiet (F1 test)",
        category: "system",
        singleton: true,
        component: () =>
          new Promise<never>(() => {
            // intentionally hangs
          }),
        icon: undefined as unknown as never,
      });

      const debugWarnSpy = vi
        .spyOn(await import("~/core/debug"), "debugWarn")
        .mockImplementation(() => undefined);

      const first = await kernel.apps.launch(MANIFEST_ID);
      await kernel.apps.launch(MANIFEST_ID);

      const dropCalls = debugWarnSpy.mock.calls.filter(
        (call) => typeof call[1] === "string" && call[1].includes("dropping new args"),
      );
      expect(dropCalls).toHaveLength(0);

      kernel.processes.kill(first.id);
      kernel.apps.unregister(MANIFEST_ID);
    });
  });

  describe("process.errored event channel", () => {
    it("round-trips a structured-clone-safe payload", () => {
      const listener = vi.fn();
      const dispose = kernel.events.on("process.errored", listener);

      kernel.events.emit("process.errored", {
        handleId: "h-fake",
        manifestId: "m-fake",
        error: { name: "Error", message: "boom" },
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const payload = listener.mock.calls[0]?.[0];
      expect(payload).toEqual({
        handleId: "h-fake",
        manifestId: "m-fake",
        error: { name: "Error", message: "boom" },
      });
      expect(payload?.error).not.toHaveProperty("stack");
      expect(payload?.error).not.toHaveProperty("cause");

      dispose();
    });
  });
});
