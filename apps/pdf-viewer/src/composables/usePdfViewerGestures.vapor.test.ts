import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { mountVaporElementComposable } from "~/test/mountVapor";

import { usePdfViewerGestures } from "./usePdfViewerGestures";

type GestureViewer = Parameters<typeof usePdfViewerGestures>[1];

interface PointerInit {
  pointerId?: number;
  clientX?: number;
  clientY?: number;
  button?: number;
  pointerType?: string;
}

interface WheelInit {
  clientX?: number;
  clientY?: number;
  ctrlKey?: boolean;
  deltaY?: number;
}

interface GestureInit {
  clientX?: number;
  clientY?: number;
  scale?: number;
}

function makeViewer(pageCount = 1): GestureViewer {
  const scale = ref(1);
  return {
    scale,
    pageCount: ref(pageCount),
    previewScaleAt: vi.fn((nextScale: number) => {
      scale.value = nextScale;
      return true;
    }),
    commitPreviewScale: vi.fn(async () => true),
  };
}

function mountGestures(viewer = makeViewer()): {
  el: HTMLElement;
  viewer: GestureViewer;
  unmount: () => void;
} {
  const mounted = mountVaporElementComposable(
    () => document.createElement("div"),
    (target) => usePdfViewerGestures(target, viewer),
  );
  const el = mounted.element;
  el.getBoundingClientRect = vi.fn(() => ({
    bottom: 200,
    height: 200,
    left: 0,
    right: 200,
    top: 0,
    width: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
  return {
    el,
    viewer,
    unmount: mounted.unmount,
  };
}

function pointerEvent(type: string, init: PointerInit = {}): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId ?? 1 },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    button: { value: init.button ?? 0 },
    pointerType: { value: init.pointerType ?? "touch" },
  });
  return event;
}

function wheelEvent(init: WheelInit = {}): WheelEvent {
  const event = new Event("wheel", { bubbles: true, cancelable: true }) as WheelEvent;
  Object.defineProperties(event, {
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    ctrlKey: { value: init.ctrlKey ?? false },
    deltaY: { value: init.deltaY ?? 0 },
  });
  return event;
}

function gestureEvent(type: string, init: GestureInit = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    scale: { value: init.scale },
  });
  return event;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("usePdfViewerGestures", () => {
  it("previews two-pointer pinch zoom and commits on release", async () => {
    const harness = mountGestures();
    await nextTick();

    harness.el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    harness.el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 2, clientX: 200, clientY: 100 }),
    );
    const move = pointerEvent("pointermove", { pointerId: 2, clientX: 300, clientY: 100 });
    harness.el.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(true);
    expect(harness.viewer.previewScaleAt).toHaveBeenLastCalledWith(2, {
      clientX: 200,
      clientY: 100,
    });

    harness.el.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 2, clientX: 300, clientY: 100 }),
    );

    expect(harness.viewer.commitPreviewScale).toHaveBeenCalledTimes(1);
    harness.unmount();
  });

  it("previews ctrl-wheel trackpad zoom and commits after the wheel settles", async () => {
    vi.useFakeTimers();
    const harness = mountGestures();
    await nextTick();

    const event = wheelEvent({
      clientX: 120,
      clientY: 80,
      ctrlKey: true,
      deltaY: -100,
    });
    harness.el.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(harness.viewer.previewScaleAt).toHaveBeenCalledTimes(1);
    expect(harness.viewer.previewScaleAt.mock.calls[0]?.[0]).toBeCloseTo(Math.exp(0.35));
    expect(harness.viewer.previewScaleAt.mock.calls[0]?.[1]).toEqual({
      clientX: 120,
      clientY: 80,
    });
    expect(harness.viewer.commitPreviewScale).not.toHaveBeenCalled();

    vi.runAllTimers();
    await Promise.resolve();

    expect(harness.viewer.commitPreviewScale).toHaveBeenCalledTimes(1);
    harness.unmount();
  });

  it("drags an overflowed zoomed viewport to pan with a mouse", async () => {
    const harness = mountGestures();
    Object.defineProperties(harness.el, {
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 600 },
    });
    harness.el.scrollLeft = 100;
    harness.el.scrollTop = 120;
    await nextTick();

    harness.el.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 1,
        pointerType: "mouse",
        clientX: 100,
        clientY: 100,
      }),
    );
    const move = pointerEvent("pointermove", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 60,
      clientY: 70,
    });
    harness.el.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(true);
    expect(harness.el.scrollLeft).toBe(140);
    expect(harness.el.scrollTop).toBe(150);
    expect(harness.el.hasAttribute("data-panning")).toBe(true);

    harness.el.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 1,
        pointerType: "mouse",
        clientX: 60,
        clientY: 70,
      }),
    );

    expect(harness.el.hasAttribute("data-panning")).toBe(false);
    harness.unmount();
  });

  it("leaves single-touch panning to the native scroll area", async () => {
    const harness = mountGestures();
    Object.defineProperties(harness.el, {
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 600 },
    });
    await nextTick();

    harness.el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    const move = pointerEvent("pointermove", { pointerId: 1, clientX: 60, clientY: 70 });
    harness.el.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(false);
    expect(harness.el.scrollLeft).toBe(0);
    expect(harness.el.scrollTop).toBe(0);
    harness.unmount();
  });

  it("ignores normal wheel scrolling", async () => {
    const harness = mountGestures();
    await nextTick();

    const event = wheelEvent({ clientX: 120, clientY: 80, deltaY: -100 });
    harness.el.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(harness.viewer.previewScaleAt).not.toHaveBeenCalled();
    expect(harness.viewer.commitPreviewScale).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("clears pending wheel commits when detached", async () => {
    vi.useFakeTimers();
    const harness = mountGestures();
    await nextTick();

    harness.el.dispatchEvent(wheelEvent({ ctrlKey: true, deltaY: -100 }));
    harness.unmount();
    vi.runAllTimers();
    await Promise.resolve();

    expect(harness.viewer.commitPreviewScale).not.toHaveBeenCalled();
  });

  it("previews Safari gesture zoom around the event point and commits on gesture end", async () => {
    const harness = mountGestures();
    await nextTick();

    const start = gestureEvent("gesturestart", { clientX: 150, clientY: 100, scale: 1 });
    const change = gestureEvent("gesturechange", { clientX: 150, clientY: 100, scale: 2 });
    const end = gestureEvent("gestureend");
    harness.el.dispatchEvent(start);
    harness.el.dispatchEvent(change);
    harness.el.dispatchEvent(end);

    expect(start.defaultPrevented).toBe(true);
    expect(change.defaultPrevented).toBe(true);
    expect(end.defaultPrevented).toBe(true);
    expect(harness.viewer.previewScaleAt).toHaveBeenLastCalledWith(2, {
      clientX: 150,
      clientY: 100,
    });
    expect(harness.viewer.commitPreviewScale).toHaveBeenCalledTimes(1);
    harness.unmount();
  });
});
