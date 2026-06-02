import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import {
  clampScale,
  clampTranslate,
  focalTranslate,
  pinchScale,
  resolveSwipe,
  useLightboxGestures,
  type UseLightboxGesturesOptions,
  type UseLightboxGesturesReturn,
} from "./useLightboxGestures";

describe("clampScale", () => {
  it("clamps into the [min, max] range", () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(99)).toBe(4);
    expect(clampScale(99, 1, 6)).toBe(6);
  });
});

describe("pinchScale", () => {
  it("scales relative to the start distance", () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(2, 100, 50)).toBe(1);
    expect(pinchScale(1, 100, 1000)).toBe(4);
  });

  it("guards against a zero start distance", () => {
    expect(pinchScale(1.5, 0, 200)).toBe(1.5);
  });
});

describe("focalTranslate", () => {
  it("keeps a focal point fixed across a zoom step", () => {
    expect(focalTranslate(50, 1, 10)).toBe(10);
    expect(focalTranslate(50, 2, 0)).toBe(-50);
    expect(focalTranslate(-30, 2, 0)).toBe(30);
  });
});

describe("clampTranslate", () => {
  it("forbids panning at base scale", () => {
    expect(clampTranslate(120, 200, 1)).toBe(0);
  });

  it("bounds the pan to half the overflow", () => {
    expect(clampTranslate(1000, 200, 2)).toBe(100);
    expect(clampTranslate(-1000, 200, 2)).toBe(-100);
    expect(clampTranslate(40, 200, 2)).toBe(40);
  });

  it("uses content overflow when the viewport is larger than the image", () => {
    expect(clampTranslate(1000, 300, 2, 100)).toBe(0);
    expect(clampTranslate(1000, 300, 2, 500)).toBe(350);
  });
});

describe("resolveSwipe", () => {
  it("navigates on a horizontal swipe past the threshold", () => {
    expect(resolveSwipe(-80, 10)).toBe("next");
    expect(resolveSwipe(80, -10)).toBe("prev");
  });

  it("ignores short horizontal drags", () => {
    expect(resolveSwipe(-40, 5)).toBeNull();
  });

  it("closes on a downward swipe", () => {
    expect(resolveSwipe(10, 120)).toBe("close");
  });

  it("ignores upward and shallow vertical drags", () => {
    expect(resolveSwipe(5, -120)).toBeNull();
    expect(resolveSwipe(5, 40)).toBeNull();
  });

  it("honors custom thresholds", () => {
    expect(resolveSwipe(-30, 0, { swipe: 20 })).toBe("next");
    expect(resolveSwipe(0, 60, { close: 50 })).toBe("close");
  });
});

function mountGestures(options: UseLightboxGesturesOptions = {}): {
  el: HTMLElement;
  api: UseLightboxGesturesReturn;
  unmount(): void;
} {
  let api: UseLightboxGesturesReturn | undefined;
  const Harness = defineComponent({
    setup() {
      const target = ref<HTMLElement | null>(null);
      api = useLightboxGestures(target, options);
      return () => h("div", { ref: target, "data-testid": "stage" });
    },
  });

  const wrapper = mount(Harness, { attachTo: document.body });
  return {
    el: wrapper.get('[data-testid="stage"]').element as HTMLElement,
    get api(): UseLightboxGesturesReturn {
      if (api === undefined) {
        throw new Error("gesture api was not initialized");
      }
      return api;
    },
    unmount: () => {
      wrapper.unmount();
    },
  };
}

function dispatch(
  el: HTMLElement,
  type: string,
  init: { pointerId: number; clientX: number; clientY: number },
): void {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, init);
  el.dispatchEvent(event);
}

function dispatchWheel(el: HTMLElement, init: Partial<WheelEvent>): WheelEvent {
  const event = new Event("wheel", { bubbles: true, cancelable: true });
  Object.assign(event, init);
  el.dispatchEvent(event);
  return event as WheelEvent;
}

function dispatchGesture(
  el: HTMLElement,
  type: string,
  init: { clientX?: number; clientY?: number; scale?: number } = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, init);
  el.dispatchEvent(event);
  return event;
}

describe("useLightboxGestures", () => {
  it("starts at the identity transform", async () => {
    const harness = mountGestures();
    await nextTick();

    expect(harness.api.scale.value).toBe(1);
    expect(harness.api.isZoomed.value).toBe(false);
    expect(harness.api.transformStyle.value.transform).toContain("scale(1)");

    harness.unmount();
  });

  it("triggers next on a leftward swipe and snaps back", async () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const harness = mountGestures({ onNext, onPrev });
    await nextTick();

    dispatch(harness.el, "pointerdown", { pointerId: 1, clientX: 220, clientY: 100 });
    dispatch(harness.el, "pointermove", { pointerId: 1, clientX: 120, clientY: 108 });
    dispatch(harness.el, "pointerup", { pointerId: 1, clientX: 120, clientY: 108 });

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();
    expect(harness.api.translateX.value).toBe(0);

    harness.unmount();
  });

  it("triggers prev on a rightward swipe", async () => {
    const onPrev = vi.fn();
    const harness = mountGestures({ onPrev });
    await nextTick();

    dispatch(harness.el, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    dispatch(harness.el, "pointermove", { pointerId: 1, clientX: 200, clientY: 96 });
    dispatch(harness.el, "pointerup", { pointerId: 1, clientX: 200, clientY: 96 });

    expect(onPrev).toHaveBeenCalledTimes(1);

    harness.unmount();
  });

  it("closes on a downward swipe", async () => {
    const onClose = vi.fn();
    const harness = mountGestures({ onClose });
    await nextTick();

    dispatch(harness.el, "pointerdown", { pointerId: 1, clientX: 100, clientY: 60 });
    dispatch(harness.el, "pointermove", { pointerId: 1, clientX: 104, clientY: 200 });
    dispatch(harness.el, "pointerup", { pointerId: 1, clientX: 104, clientY: 200 });

    expect(onClose).toHaveBeenCalledTimes(1);

    harness.unmount();
  });

  it("zooms on a double-tap and clears on reset", async () => {
    const harness = mountGestures();
    await nextTick();

    dispatch(harness.el, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    dispatch(harness.el, "pointerup", { pointerId: 1, clientX: 100, clientY: 100 });
    dispatch(harness.el, "pointerdown", { pointerId: 2, clientX: 100, clientY: 100 });
    dispatch(harness.el, "pointerup", { pointerId: 2, clientX: 100, clientY: 100 });

    expect(harness.api.scale.value).toBeGreaterThan(1);
    expect(harness.api.isZoomed.value).toBe(true);

    harness.api.reset();
    expect(harness.api.scale.value).toBe(1);
    expect(harness.api.translateX.value).toBe(0);
    expect(harness.api.translateY.value).toBe(0);

    harness.unmount();
  });

  it("zooms on ctrl-wheel and clamps to the max scale", async () => {
    const harness = mountGestures({ maxScale: 3 });
    await nextTick();

    const event = dispatchWheel(harness.el, {
      clientX: 100,
      clientY: 100,
      ctrlKey: true,
      deltaY: -1000,
    });

    expect(event.defaultPrevented).toBe(true);
    expect(harness.api.scale.value).toBe(3);
    expect(harness.api.isZoomed.value).toBe(true);

    harness.unmount();
  });

  it("ignores normal wheel events", async () => {
    const harness = mountGestures();
    await nextTick();

    const event = dispatchWheel(harness.el, {
      clientX: 100,
      clientY: 100,
      deltaY: -100,
    });

    expect(event.defaultPrevented).toBe(false);
    expect(harness.api.scale.value).toBe(1);

    harness.unmount();
  });

  it("zooms around the Safari gesture focal point", async () => {
    const harness = mountGestures({ maxScale: 4 });
    harness.el.getBoundingClientRect = vi.fn(() => ({
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
    await nextTick();

    const start = dispatchGesture(harness.el, "gesturestart", {
      clientX: 150,
      clientY: 100,
      scale: 1,
    });
    const change = dispatchGesture(harness.el, "gesturechange", {
      clientX: 150,
      clientY: 100,
      scale: 2,
    });

    expect(start.defaultPrevented).toBe(true);
    expect(change.defaultPrevented).toBe(true);
    expect(harness.api.scale.value).toBe(2);
    expect(harness.api.translateX.value).toBe(-50);
    expect(harness.api.translateY.value).toBe(0);

    harness.unmount();
  });

  it("does not navigate on a stationary tap", async () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const harness = mountGestures({ onNext, onPrev });
    await nextTick();

    dispatch(harness.el, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    dispatch(harness.el, "pointerup", { pointerId: 1, clientX: 100, clientY: 100 });

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();

    harness.unmount();
  });
});
