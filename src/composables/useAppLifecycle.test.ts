import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

import type { LifecyclePhase } from "~/core/kernel/Lifecycle";
import type { Kernel } from "~/types/kernel";

import { useAppLifecycle } from "./useAppLifecycle";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function makeLifecycleHarness() {
  const buckets = new Map<string, Set<() => void>>();

  function key(phase: LifecyclePhase, handleId: string): string {
    return `${phase}:${handleId}`;
  }

  function on(phase: LifecyclePhase, handleId: string, cb: () => void): () => void {
    const k = key(phase, handleId);
    let set = buckets.get(k);
    if (!set) {
      set = new Set();
      buckets.set(k, set);
    }
    set.add(cb);
    return (): void => {
      buckets.get(k)?.delete(cb);
    };
  }

  function triggerPhase(phase: LifecyclePhase, handleId: string): void {
    const set = buckets.get(key(phase, handleId));
    if (!set) {
      return;
    }
    for (const cb of Array.from(set)) {
      cb();
    }
  }

  function activeSubscriberCount(): number {
    let n = 0;
    for (const set of buckets.values()) {
      n += set.size;
    }
    return n;
  }

  return { on, triggerPhase, activeSubscriberCount };
}

let harness: ReturnType<typeof makeLifecycleHarness>;

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "lifecycleCoordinator"> {
    return {
      lifecycleCoordinator: {
        register: vi.fn(),
        unregister: vi.fn(),
        emit: vi.fn(),
        on: (phase, handleId, cb) => harness.on(phase, handleId, cb),
      },
    };
  },
}));

describe("useAppLifecycle", () => {
  beforeEach(() => {
    harness = makeLifecycleHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("phase ref tracks the latest emitted phase for the active handle", () => {
    const scope = effectScope();
    const { phase } = scope.run(() => useAppLifecycle("h-1"))!;

    expect(phase.value).toBeNull();
    harness.triggerPhase("mounted", "h-1");
    expect(phase.value).toBe("mounted");
    harness.triggerPhase("activated", "h-1");
    expect(phase.value).toBe("activated");

    scope.stop();
  });

  it("isActive / isSuspended computed flip with the phase", () => {
    const scope = effectScope();
    const { phase, isActive, isSuspended } = scope.run(() => useAppLifecycle("h-2"))!;

    harness.triggerPhase("activated", "h-2");
    expect(isActive.value).toBe(true);
    expect(isSuspended.value).toBe(false);

    harness.triggerPhase("suspended", "h-2");
    expect(isActive.value).toBe(false);
    expect(isSuspended.value).toBe(true);

    // does NOT make the handle "active" again. `activated` must follow
    harness.triggerPhase("resumed", "h-2");
    expect(phase.value).toBe("resumed");
    expect(isActive.value).toBe(false);
    expect(isSuspended.value).toBe(false);

    harness.triggerPhase("deactivated", "h-2");
    expect(phase.value).toBe("deactivated");
    expect(isActive.value).toBe(false);
    expect(isSuspended.value).toBe(false);

    scope.stop();
  });

  it("only fires for the subscribed handleId — events for other handles are ignored", () => {
    const scope = effectScope();
    const { phase } = scope.run(() => useAppLifecycle("h-mine"))!;

    harness.triggerPhase("mounted", "h-other");
    expect(phase.value).toBeNull();

    harness.triggerPhase("mounted", "h-mine");
    expect(phase.value).toBe("mounted");

    scope.stop();
  });

  it("re-subscribes when the handleId source changes (Ref<string>)", async () => {
    const handleIdRef = ref<string | null>("h-first");
    const scope = effectScope();
    const { phase } = scope.run(() => useAppLifecycle(handleIdRef))!;

    harness.triggerPhase("mounted", "h-first");
    expect(phase.value).toBe("mounted");

    // Vue's `watch` is async by default; the swap-driven teardown +
    handleIdRef.value = "h-second";
    await nextTick();

    expect(phase.value).toBeNull();

    harness.triggerPhase("activated", "h-first");
    expect(phase.value).toBeNull();

    harness.triggerPhase("mounted", "h-second");
    expect(phase.value).toBe("mounted");

    scope.stop();
  });

  it("teardown clears subscriptions when handleId source resolves to null", async () => {
    const handleIdRef = ref<string | null>("h-3");
    const scope = effectScope();
    scope.run(() => useAppLifecycle(handleIdRef));

    expect(harness.activeSubscriberCount()).toBeGreaterThan(0);

    handleIdRef.value = null;
    await nextTick();
    expect(harness.activeSubscriberCount()).toBe(0);

    scope.stop();
  });

  it("onScopeDispose tears down every internal subscription", () => {
    const scope = effectScope();
    scope.run(() => useAppLifecycle("h-4"));

    expect(harness.activeSubscriberCount()).toBe(7); // one per phase

    scope.stop();
    expect(harness.activeSubscriberCount()).toBe(0);
  });

  it("onPhase invokes its callback when the matching phase fires", () => {
    const scope = effectScope();
    const cb = vi.fn();
    const { onPhase } = scope.run(() => useAppLifecycle("h-5"))!;
    onPhase("activated", cb);

    harness.triggerPhase("mounted", "h-5");
    expect(cb).not.toHaveBeenCalled();

    harness.triggerPhase("activated", "h-5");
    expect(cb).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it("onPhase callbacks survive a handleId swap", async () => {
    const handleIdRef = ref<string>("h-a");
    const scope = effectScope();
    const cb = vi.fn();
    const { onPhase } = scope.run(() => useAppLifecycle(handleIdRef))!;
    onPhase("activated", cb);

    harness.triggerPhase("activated", "h-a");
    expect(cb).toHaveBeenCalledTimes(1);

    handleIdRef.value = "h-b";
    await nextTick();
    harness.triggerPhase("activated", "h-b");
    expect(cb).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it("onPhase disposer removes the callback", () => {
    const scope = effectScope();
    const cb = vi.fn();
    const { onPhase } = scope.run(() => useAppLifecycle("h-6"))!;
    const off = onPhase("activated", cb);

    harness.triggerPhase("activated", "h-6");
    expect(cb).toHaveBeenCalledTimes(1);

    off();
    harness.triggerPhase("activated", "h-6");
    expect(cb).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it("onPhase disposer is safe to call after the scope is disposed", () => {
    const scope = effectScope();
    const cb = vi.fn();
    const { onPhase } = scope.run(() => useAppLifecycle("h-7"))!;
    const off = onPhase("activated", cb);

    scope.stop();

    expect(() => {
      off();
    }).not.toThrow();
  });

  it("[type] return shape exposes phase + booleans + onPhase", () => {
    const scope = effectScope();
    const result = scope.run(() => useAppLifecycle("h-type"))!;

    expectTypeOf(result.phase.value).toEqualTypeOf<LifecyclePhase | null>();
    expectTypeOf(result.isActive.value).toBeBoolean();
    expectTypeOf(result.isSuspended.value).toBeBoolean();
    expectTypeOf(result.onPhase).toBeFunction();

    scope.stop();
  });
});
