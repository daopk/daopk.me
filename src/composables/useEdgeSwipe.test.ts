import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";

import {
  useEdgeSwipe,
  type EdgeSwipeEdge,
  type UseEdgeSwipeOptions,
} from "~/composables/useEdgeSwipe";

interface PointerInit {
  pointerId?: number;
  pointerType?: "mouse" | "touch" | "pen";
  clientX?: number;
  clientY?: number;
}

function makePointerEvent(type: string, init: PointerInit = {}): PointerEvent {
  const e = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(e, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? "touch" },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
  });
  return e;
}

function makeHarness(options: UseEdgeSwipeOptions): {
  el: HTMLDivElement;
  state: ReturnType<typeof useEdgeSwipe>;
  unmount: () => void;
} {
  const elRef = ref<HTMLDivElement | null>(null);
  let captured: ReturnType<typeof useEdgeSwipe> | undefined;

  const Harness = defineComponent({
    setup() {
      const g = useEdgeSwipe(elRef, options);
      captured = g;
      return { elRef };
    },
    template: '<div ref="elRef" style="width:100vw;height:100vh" />',
  });

  const wrapper = mount(Harness, { attachTo: document.body });
  const el = wrapper.find("div").element as HTMLDivElement;
  elRef.value = el;

  return {
    el,
    state: captured as ReturnType<typeof useEdgeSwipe>,
    unmount(): void {
      wrapper.unmount();
    },
  };
}

describe("useEdgeSwipe", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
  });

  it("fires onSwipe when start is near `left` edge and distance threshold is met", async () => {
    const onSwipe = vi.fn();

    const { el, state, unmount } = makeHarness({
      edge: "left",
      onSwipe,
      acceptMouse: true,
    });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 5, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 100, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 100, clientY: 200 }));

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(state.lastOutcome.value).toBe("recognized");

    unmount();
  });

  it("does NOT fire onSwipe when start is outside edge zone", async () => {
    const onSwipe = vi.fn();

    const { el, state, unmount } = makeHarness({
      edge: "left",
      onSwipe,
      acceptMouse: true,
    });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 100, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 250, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 250, clientY: 200 }));

    expect(onSwipe).not.toHaveBeenCalled();
    expect(state.lastOutcome.value).toBeNull();

    unmount();
  });

  it("does NOT fire onSwipe if distance threshold is not reached and velocity is low", async () => {
    const onSwipe = vi.fn();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const { el, state, unmount } = makeHarness({
      edge: "left",
      onSwipe,
      acceptMouse: true,
    });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 5, clientY: 200 }));
    vi.advanceTimersByTime(500);
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 25, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 25, clientY: 200 }));

    expect(onSwipe).not.toHaveBeenCalled();
    expect(state.lastOutcome.value).toBe("abandoned");

    unmount();
  });

  it("fires onSwipe via velocity threshold even when distance is short", async () => {
    const onSwipe = vi.fn();
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });

    const { el, state, unmount } = makeHarness({
      edge: "left",
      onSwipe,
      acceptMouse: true,
      distanceThreshold: 200, // make distance hard to reach
      velocityThreshold: 0.2, // ≥0.2 px/ms
    });
    await nextTick();

    now = 0;
    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 5, clientY: 200 }));
    now = 50; // 50ms later
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 50, clientY: 200 }));
    now = 100;
    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 50, clientY: 200 }));

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(state.lastOutcome.value).toBe("recognized");

    vi.unstubAllGlobals();
    unmount();
  });

  it("reports clamped progress 0..1 along the swipe axis", async () => {
    const progressValues: number[] = [];

    const { el, unmount } = makeHarness({
      edge: "left",
      distanceThreshold: 100,
      onSwipe: (): void => {},
      onProgress: (p): void => {
        progressValues.push(p);
      },
      acceptMouse: true,
    });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 0, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 25, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 50, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 200, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 200, clientY: 200 }));

    expect(progressValues[0]).toBeCloseTo(0.25);
    expect(progressValues[1]).toBeCloseTo(0.5);
    expect(progressValues[2]).toBe(1);

    unmount();
  });

  it.each<EdgeSwipeEdge>(["left", "right", "top", "bottom"])(
    "respects edge=%s zone detection",
    async (edge) => {
      const onSwipe = vi.fn();

      const { el, unmount } = makeHarness({
        edge,
        onSwipe,
        acceptMouse: true,
        edgeThreshold: 20,
        distanceThreshold: 60,
      });
      await nextTick();

      const startInside = {
        left: { x: 5, y: 400 },
        right: { x: 395, y: 400 },
        top: { x: 200, y: 5 },
        bottom: { x: 200, y: 795 },
      }[edge];

      const moveInside = {
        left: { x: 100, y: 400 },
        right: { x: 300, y: 400 },
        top: { x: 200, y: 100 },
        bottom: { x: 200, y: 700 },
      }[edge];

      const startOutside = {
        left: { x: 100, y: 400 },
        right: { x: 100, y: 400 },
        top: { x: 200, y: 200 },
        bottom: { x: 200, y: 200 },
      }[edge];

      el.dispatchEvent(
        makePointerEvent("pointerdown", { clientX: startOutside.x, clientY: startOutside.y }),
      );
      el.dispatchEvent(
        makePointerEvent("pointerup", { clientX: startOutside.x, clientY: startOutside.y }),
      );
      expect(onSwipe).not.toHaveBeenCalled();

      el.dispatchEvent(
        makePointerEvent("pointerdown", { clientX: startInside.x, clientY: startInside.y }),
      );
      el.dispatchEvent(
        makePointerEvent("pointermove", { clientX: moveInside.x, clientY: moveInside.y }),
      );
      el.dispatchEvent(
        makePointerEvent("pointerup", { clientX: moveInside.x, clientY: moveInside.y }),
      );

      expect(onSwipe).toHaveBeenCalledTimes(1);

      unmount();
    },
  );

  it("resets onProgress to 0 on abandoned swipe (sub-threshold release)", async () => {
    const progressValues: number[] = [];

    let now = 0;
    vi.stubGlobal("performance", { now: () => now });

    const { el, state, unmount } = makeHarness({
      edge: "left",
      distanceThreshold: 200,
      velocityThreshold: 0.3,
      onSwipe: (): void => {},
      onProgress: (p): void => {
        progressValues.push(p);
      },
      acceptMouse: true,
    });
    await nextTick();

    now = 0;
    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 0, clientY: 200 }));
    now = 1000; // very slow swipe → velocity = 40 / 1000 = 0.04 px/ms (≪ 0.3)
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 40, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 40, clientY: 200 }));

    expect(state.lastOutcome.value).toBe("abandoned");
    expect(progressValues.length).toBeGreaterThanOrEqual(2);
    expect(progressValues[progressValues.length - 1]).toBe(0);

    vi.unstubAllGlobals();
    unmount();
  });

  it("resets onProgress to 0 on pointercancel", async () => {
    const progressValues: number[] = [];

    const { el, state, unmount } = makeHarness({
      edge: "left",
      distanceThreshold: 200,
      onSwipe: (): void => {},
      onProgress: (p): void => {
        progressValues.push(p);
      },
      acceptMouse: true,
    });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 0, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 40, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointercancel", { clientX: 40, clientY: 200 }));

    expect(state.lastOutcome.value).toBe("cancelled");
    expect(progressValues[progressValues.length - 1]).toBe(0);

    unmount();
  });

  it("does NOT reset onProgress when the swipe is recognized (consumer-controlled)", async () => {
    const progressValues: number[] = [];

    const { el, state, unmount } = makeHarness({
      edge: "left",
      distanceThreshold: 50,
      onSwipe: (): void => {},
      onProgress: (p): void => {
        progressValues.push(p);
      },
      acceptMouse: true,
    });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 0, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 60, clientY: 200 }));
    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 60, clientY: 200 }));

    expect(state.lastOutcome.value).toBe("recognized");
    expect(progressValues[progressValues.length - 1]).toBe(1);

    unmount();
  });

  it("uses visualViewport.width when defined for right-edge detection", async () => {
    // Simulate iOS Safari: layout viewport says 400, but visualViewport is
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 380, height: 800 },
    });

    const onSwipe = vi.fn();
    const { el, unmount } = makeHarness({
      edge: "right",
      onSwipe,
      acceptMouse: true,
      edgeThreshold: 20,
      distanceThreshold: 60,
    });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 370, clientY: 400 }));
    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 280, clientY: 400 }));
    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 280, clientY: 400 }));

    expect(onSwipe).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("does nothing for mouse pointers when acceptMouse is left at default (false)", async () => {
    const onSwipe = vi.fn();

    const { el, unmount } = makeHarness({ edge: "left", onSwipe });
    await nextTick();

    el.dispatchEvent(
      makePointerEvent("pointerdown", { clientX: 5, clientY: 400, pointerType: "mouse" }),
    );
    el.dispatchEvent(
      makePointerEvent("pointermove", { clientX: 100, clientY: 400, pointerType: "mouse" }),
    );
    el.dispatchEvent(
      makePointerEvent("pointerup", { clientX: 100, clientY: 400, pointerType: "mouse" }),
    );

    expect(onSwipe).not.toHaveBeenCalled();

    unmount();
  });
});
