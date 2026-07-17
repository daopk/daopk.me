import { describe, expect, it, vi } from "vitest";

import { useOnlineStatus } from "~/composables/useOnlineStatus";
import { mountVaporComposable } from "~/test/mountVapor";

function createWindowStub() {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    listeners,
    windowLike: {
      addEventListener: vi.fn((type: "online" | "offline", listener: EventListener) => {
        const bucket = listeners.get(type) ?? new Set<EventListener>();
        bucket.add(listener);
        listeners.set(type, bucket);
      }),
      removeEventListener: vi.fn((type: "online" | "offline", listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      }),
    },
    fire(type: "online" | "offline"): void {
      for (const listener of listeners.get(type) ?? []) {
        listener(new Event(type));
      }
    },
  };
}

function mountHarness(
  windowLike: ReturnType<typeof createWindowStub>["windowLike"],
  navigatorLike: { onLine?: boolean },
) {
  return mountVaporComposable(() => useOnlineStatus(windowLike, navigatorLike));
}

describe("useOnlineStatus", () => {
  it("uses navigator.onLine as the initial state", () => {
    const stub = createWindowStub();
    const harness = mountHarness(stub.windowLike, { onLine: false });

    expect(harness.result.isOnline.value).toBe(false);
    expect(harness.result.isOffline.value).toBe(true);

    harness.unmount();
  });

  it("tracks online and offline events", async () => {
    const stub = createWindowStub();
    const navigatorLike = { onLine: true };
    const harness = mountHarness(stub.windowLike, navigatorLike);

    expect(harness.result.isOnline.value).toBe(true);

    navigatorLike.onLine = false;
    stub.fire("offline");
    await harness.wrapper.vm.$nextTick();
    expect(harness.result.isOnline.value).toBe(false);

    navigatorLike.onLine = true;
    stub.fire("online");
    await harness.wrapper.vm.$nextTick();
    expect(harness.result.isOnline.value).toBe(true);

    harness.unmount();
  });

  it("removes listeners on unmount", async () => {
    const stub = createWindowStub();
    const harness = mountHarness(stub.windowLike, { onLine: true });

    expect(stub.listeners.get("online")?.size).toBe(1);
    expect(stub.listeners.get("offline")?.size).toBe(1);

    harness.unmount();
    await harness.wrapper.vm.$nextTick();

    expect(stub.listeners.get("online")?.size).toBe(0);
    expect(stub.listeners.get("offline")?.size).toBe(0);
  });
});
