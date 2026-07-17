import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mountVaporElementComposable } from "~/test/mountVapor";

import { useDesktopBrowserZoomGuard } from "./useDesktopBrowserZoomGuard";

function wheelEvent(init: Partial<WheelEvent> = {}): WheelEvent {
  const event = new Event("wheel", { bubbles: true, cancelable: true });
  Object.assign(event, init);
  return event as WheelEvent;
}

function mountGuard(): { root: HTMLElement; child: HTMLElement; unmount(): void } {
  let child!: HTMLElement;
  const mounted = mountVaporElementComposable(
    () => {
      const root = document.createElement("div");
      root.dataset.testid = "root";
      child = document.createElement("div");
      child.dataset.testid = "child";
      child.textContent = "child";
      root.append(child);
      return root;
    },
    (root) => useDesktopBrowserZoomGuard(root),
  );
  return {
    root: mounted.element,
    child,
    unmount: mounted.unmount,
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
