import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { useOnlineStatus } from "~/composables/useOnlineStatus";

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
  const Harness = defineComponent({
    setup() {
      return useOnlineStatus(windowLike, navigatorLike);
    },
    template: "<span />",
  });

  return mount(Harness);
}

describe("useOnlineStatus", () => {
  it("uses navigator.onLine as the initial state", () => {
    const stub = createWindowStub();
    const wrapper = mountHarness(stub.windowLike, { onLine: false });

    expect(wrapper.vm.isOnline).toBe(false);
    expect(wrapper.vm.isOffline).toBe(true);

    wrapper.unmount();
  });

  it("tracks online and offline events", async () => {
    const stub = createWindowStub();
    const navigatorLike = { onLine: true };
    const wrapper = mountHarness(stub.windowLike, navigatorLike);

    expect(wrapper.vm.isOnline).toBe(true);

    navigatorLike.onLine = false;
    stub.fire("offline");
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isOnline).toBe(false);

    navigatorLike.onLine = true;
    stub.fire("online");
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isOnline).toBe(true);

    wrapper.unmount();
  });

  it("removes listeners on unmount", () => {
    const stub = createWindowStub();
    const wrapper = mountHarness(stub.windowLike, { onLine: true });

    expect(stub.listeners.get("online")?.size).toBe(1);
    expect(stub.listeners.get("offline")?.size).toBe(1);

    wrapper.unmount();

    expect(stub.listeners.get("online")?.size).toBe(0);
    expect(stub.listeners.get("offline")?.size).toBe(0);
  });
});
