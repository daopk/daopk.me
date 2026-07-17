import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { useGesture, type GestureSnapshot } from "~/composables/useGesture";
import { mountVaporElementComposable } from "~/test/mountVapor";

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

function makeHarness(options: Parameters<typeof useGesture>[1] = {}): {
  el: HTMLDivElement;
  state: ReturnType<typeof useGesture>;
  unmount: () => void;
} {
  const mounted = mountVaporElementComposable(
    () => document.createElement("div"),
    (target) => useGesture(target, options),
  );

  return {
    el: mounted.element,
    state: mounted.result,
    unmount: mounted.unmount,
  };
}

describe("useGesture", () => {
  it("invokes onStart, onMove, onEnd in order with consistent snapshots", async () => {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();

    const { el, state, unmount } = makeHarness({ onStart, onMove, onEnd });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 10, clientY: 20 }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(state.active.value).toBe(true);
    const startSnap = onStart.mock.calls[0][0] as GestureSnapshot;
    expect(startSnap.startX).toBe(10);
    expect(startSnap.startY).toBe(20);

    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 50, clientY: 60 }));
    expect(onMove).toHaveBeenCalledTimes(1);
    const moveSnap = onMove.mock.calls[0][0] as GestureSnapshot;
    expect(moveSnap.deltaX).toBe(40);
    expect(moveSnap.deltaY).toBe(40);

    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 80, clientY: 90 }));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(state.active.value).toBe(false);
    const endSnap = onEnd.mock.calls[0][0] as GestureSnapshot;
    expect(endSnap.deltaX).toBe(70);
    expect(endSnap.deltaY).toBe(70);

    unmount();
  });

  it("aborts the gesture when onStart returns false", async () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();

    const { el, state, unmount } = makeHarness({
      onStart: () => false,
      onMove,
      onEnd,
    });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 5, clientY: 5 }));
    expect(state.active.value).toBe(false);

    el.dispatchEvent(makePointerEvent("pointermove", { clientX: 50, clientY: 50 }));
    expect(onMove).not.toHaveBeenCalled();

    el.dispatchEvent(makePointerEvent("pointerup", { clientX: 80, clientY: 80 }));
    expect(onEnd).not.toHaveBeenCalled();

    unmount();
  });

  it("rejects mouse pointers when acceptMouse=false", async () => {
    const onStart = vi.fn();

    const { el, unmount } = makeHarness({ onStart, acceptMouse: false });
    await nextTick();

    el.dispatchEvent(
      makePointerEvent("pointerdown", { pointerType: "mouse", clientX: 1, clientY: 1 }),
    );
    expect(onStart).not.toHaveBeenCalled();

    el.dispatchEvent(
      makePointerEvent("pointerdown", { pointerType: "touch", clientX: 1, clientY: 1 }),
    );
    expect(onStart).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("ignores pointermove/up from a different pointerId mid-gesture", async () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();

    const { el, unmount } = makeHarness({ onMove, onEnd });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { pointerId: 7, clientX: 0, clientY: 0 }));

    el.dispatchEvent(makePointerEvent("pointermove", { pointerId: 99, clientX: 20, clientY: 20 }));
    expect(onMove).not.toHaveBeenCalled();

    el.dispatchEvent(makePointerEvent("pointerup", { pointerId: 99, clientX: 20, clientY: 20 }));
    expect(onEnd).not.toHaveBeenCalled();

    el.dispatchEvent(makePointerEvent("pointermove", { pointerId: 7, clientX: 30, clientY: 30 }));
    expect(onMove).toHaveBeenCalledTimes(1);

    el.dispatchEvent(makePointerEvent("pointerup", { pointerId: 7, clientX: 50, clientY: 50 }));
    expect(onEnd).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("emits onCancel on pointercancel, not onEnd", async () => {
    const onEnd = vi.fn();
    const onCancel = vi.fn();

    const { el, state, unmount } = makeHarness({ onEnd, onCancel });
    await nextTick();

    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    el.dispatchEvent(makePointerEvent("pointercancel", { clientX: 5, clientY: 5 }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    expect(state.active.value).toBe(false);

    unmount();
  });

  it("dispose detaches listeners — further events do nothing", async () => {
    const onStart = vi.fn();

    const { el, state, unmount } = makeHarness({ onStart });
    await nextTick();

    state.dispose();
    el.dispatchEvent(makePointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    expect(onStart).not.toHaveBeenCalled();

    unmount();
  });
});
