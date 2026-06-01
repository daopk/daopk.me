import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useDesktopBrowserZoomGuard } from "./useDesktopBrowserZoomGuard";

function wheelEvent(init: Partial<WheelEvent> = {}): WheelEvent {
  const event = new Event("wheel", { bubbles: true, cancelable: true });
  Object.assign(event, init);
  return event as WheelEvent;
}

function mountGuard(): { root: HTMLElement; child: HTMLElement; unmount(): void } {
  const Harness = defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null);
      useDesktopBrowserZoomGuard(root);
      return () =>
        h("div", { ref: root, "data-testid": "root" }, [
          h("div", { "data-testid": "child" }, "child"),
        ]);
    },
  });

  const wrapper = mount(Harness, { attachTo: document.body });
  return {
    root: wrapper.get('[data-testid="root"]').element as HTMLElement,
    child: wrapper.get('[data-testid="child"]').element as HTMLElement,
    unmount: () => {
      wrapper.unmount();
    },
  };
}

describe("useDesktopBrowserZoomGuard", () => {
  it("prevents ctrl-wheel browser zoom", async () => {
    const guard = mountGuard();
    await nextTick();

    const event = wheelEvent({ ctrlKey: true });
    guard.root.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);

    guard.unmount();
  });

  it("allows normal wheel scrolling", async () => {
    const guard = mountGuard();
    await nextTick();

    const event = wheelEvent();
    guard.root.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);

    guard.unmount();
  });

  it("prevents Safari gesture events", async () => {
    const guard = mountGuard();
    await nextTick();

    const event = new Event("gesturechange", { bubbles: true, cancelable: true });
    guard.root.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);

    guard.unmount();
  });

  it("does not stop child apps from observing zoom events", async () => {
    const guard = mountGuard();
    const onChildWheel = vi.fn();
    await nextTick();

    guard.child.addEventListener("wheel", onChildWheel);
    const event = wheelEvent({ ctrlKey: true });
    guard.child.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onChildWheel).toHaveBeenCalledTimes(1);

    guard.unmount();
  });
});
