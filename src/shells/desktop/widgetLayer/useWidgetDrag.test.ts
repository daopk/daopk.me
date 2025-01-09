import { beforeEach, describe, expect, it, vi } from "vitest";

import { widgetPixelDimensions } from "~/core/widgets/sizing";

import { useWidgetDrag } from "./useWidgetDrag";

const SM_PX = widgetPixelDimensions("sm");

interface FakePointerEventInit {
  clientX?: number;
  clientY?: number;
  button?: number;
  pointerId?: number;
}

function fakePointerEvent(type: string, init: FakePointerEventInit = {}): PointerEvent {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    button: { value: init.button ?? 0 },
    pointerId: { value: init.pointerId ?? 1 },
  });
  return ev as unknown as PointerEvent;
}

interface DragHarness {
  getPosition: () => { x: number; y: number };
  getSize: () => { width: number; height: number };
  getHostSize: () => { width: number; height: number };
}

function defaultHarness(): DragHarness {
  return {
    getPosition: () => ({ x: 0, y: 0 }),
    getSize: () => ({ ...SM_PX }),
    getHostSize: () => ({ width: 1920, height: 1080 }),
  };
}

describe("useWidgetDrag (M3.7)", () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement("div");
    document.body.appendChild(element);
  });

  describe("pointerdown gate", () => {
    it("primary (left) button starts drag and fires onStart", () => {
      const onStart = vi.fn();
      const drag = useWidgetDrag({
        ...defaultHarness(),
        onMove: vi.fn(),
        onDrop: vi.fn(),
        onStart,
      });

      const down = fakePointerEvent("pointerdown", { clientX: 10, clientY: 10 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("right-click pointerdown is ignored (no drag start, no listeners attached)", () => {
      const onStart = vi.fn();
      const onMove = vi.fn();
      const drag = useWidgetDrag({
        ...defaultHarness(),
        onMove,
        onDrop: vi.fn(),
        onStart,
      });

      const down = fakePointerEvent("pointerdown", { button: 2 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      expect(onStart).not.toHaveBeenCalled();

      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 100, clientY: 100 }));
      expect(onMove).not.toHaveBeenCalled();
    });

    it("middle-click pointerdown is ignored", () => {
      const onStart = vi.fn();
      const drag = useWidgetDrag({
        ...defaultHarness(),
        onMove: vi.fn(),
        onDrop: vi.fn(),
        onStart,
      });

      const down = fakePointerEvent("pointerdown", { button: 1 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      expect(onStart).not.toHaveBeenCalled();
    });

    it("non-HTMLElement currentTarget is ignored (defensive instanceof check)", () => {
      // must early-return rather than crash on `setPointerCapture`.
      const onStart = vi.fn();
      const drag = useWidgetDrag({
        ...defaultHarness(),
        onMove: vi.fn(),
        onDrop: vi.fn(),
        onStart,
      });

      const down = fakePointerEvent("pointerdown");
      Object.defineProperty(down, "currentTarget", { value: null });
      expect(() => drag.onPointerDown(down)).not.toThrow();
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe("pointermove streaming", () => {
    it("streams clamped pixel position to onMove on each move event", () => {
      const onMove = vi.fn();
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 100, y: 50 }),
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => ({ width: 1920, height: 1080 }),
        onMove,
        onDrop: vi.fn(),
      });

      const down = fakePointerEvent("pointerdown", { clientX: 110, clientY: 60 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 200, clientY: 150 }));
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onMove).toHaveBeenCalledWith(190, 140);
    });

    it("clamps to host's top-left edge (negative coords → 0)", () => {
      const onMove = vi.fn();
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 100, y: 100 }),
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => ({ width: 1920, height: 1080 }),
        onMove,
        onDrop: vi.fn(),
      });

      const down = fakePointerEvent("pointerdown", { clientX: 110, clientY: 110 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 0, clientY: 0 }));
      expect(onMove).toHaveBeenCalledWith(0, 0);
    });

    it("clamps to host's bottom-right edge (positions outside host snap to maxX/maxY)", () => {
      const onMove = vi.fn();
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 100, y: 100 }),
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => ({ width: 500, height: 400 }),
        onMove,
        onDrop: vi.fn(),
      });

      const down = fakePointerEvent("pointerdown", { clientX: 110, clientY: 110 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 10000, clientY: 10000 }));
      expect(onMove).toHaveBeenCalledWith(404, 304);
    });

    it("degenerate host (smaller than widget) clamps to origin", () => {
      const onMove = vi.fn();
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 0, y: 0 }),
        getSize: () => ({ width: 200, height: 200 }),
        getHostSize: () => ({ width: 100, height: 100 }),
        onMove,
        onDrop: vi.fn(),
      });

      const down = fakePointerEvent("pointerdown", { clientX: 0, clientY: 0 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 50, clientY: 50 }));
      expect(onMove).toHaveBeenCalledWith(0, 0);
    });

    it("reads getSize / getHostSize fresh per move (responds to live resize)", () => {
      const onMove = vi.fn();
      let vp = { width: 200, height: 200 };
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 0, y: 0 }),
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => vp,
        onMove,
        onDrop: vi.fn(),
      });

      const down = fakePointerEvent("pointerdown", { clientX: 0, clientY: 0 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 500, clientY: 500 }));
      expect(onMove).toHaveBeenLastCalledWith(104, 104);

      vp = { width: 1000, height: 1000 };
      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 500, clientY: 500 }));
      expect(onMove).toHaveBeenLastCalledWith(500, 500);
    });
  });

  describe("snap on drop", () => {
    it("rounds pixel position to nearest grid unit and emits to onDrop", () => {
      const onDrop = vi.fn();
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 0, y: 0 }),
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => ({ width: 1920, height: 1080 }),
        onMove: vi.fn(),
        onDrop,
      });

      const down = fakePointerEvent("pointerdown", { clientX: 0, clientY: 0 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 50, clientY: 50 }));
      element.dispatchEvent(fakePointerEvent("pointerup"));

      expect(onDrop).toHaveBeenCalledTimes(1);
      expect(onDrop).toHaveBeenCalledWith(2, 2);
    });

    it("snap rounds correctly at half-pitch boundary", () => {
      const onDrop = vi.fn();
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 0, y: 0 }),
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => ({ width: 1920, height: 1080 }),
        onMove: vi.fn(),
        onDrop,
      });

      const down = fakePointerEvent("pointerdown", { clientX: 0, clientY: 0 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 12, clientY: 12 }));
      element.dispatchEvent(fakePointerEvent("pointerup"));

      expect(onDrop).toHaveBeenCalledWith(1, 1);
    });

    it("onDrop receives snapped position even when no pointermove fired (drop-in-place)", () => {
      // gets idempotent persistence and `onEnd` cleanup runs.
      const onDrop = vi.fn();
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 48, y: 48 }),
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => ({ width: 1920, height: 1080 }),
        onMove: vi.fn(),
        onDrop,
      });

      const down = fakePointerEvent("pointerdown", { clientX: 50, clientY: 50 });
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointerup"));

      expect(onDrop).toHaveBeenCalledWith(2, 2);
    });
  });

  describe("cleanup lifecycle", () => {
    it("pointerup detaches move listener and fires onEnd AFTER onDrop", () => {
      const calls: string[] = [];
      const onMove = vi.fn();
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 0, y: 0 }),
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => ({ width: 1920, height: 1080 }),
        onMove,
        onDrop: () => calls.push("drop"),
        onEnd: () => calls.push("end"),
      });

      const down = fakePointerEvent("pointerdown");
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointerup"));
      expect(calls).toEqual(["drop", "end"]);

      // Subsequent pointermove must not call onMove (listener detached).
      onMove.mockClear();
      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 100, clientY: 100 }));
      expect(onMove).not.toHaveBeenCalled();
    });

    it("pointercancel routes through the same cleanup (onDrop + onEnd both fire)", () => {
      const onDrop = vi.fn();
      const onEnd = vi.fn();
      const onMove = vi.fn();
      const drag = useWidgetDrag({
        getPosition: () => ({ x: 0, y: 0 }),
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => ({ width: 1920, height: 1080 }),
        onMove,
        onDrop,
        onEnd,
      });

      const down = fakePointerEvent("pointerdown");
      Object.defineProperty(down, "currentTarget", { value: element });
      drag.onPointerDown(down);

      element.dispatchEvent(fakePointerEvent("pointercancel"));
      expect(onDrop).toHaveBeenCalledTimes(1);
      expect(onEnd).toHaveBeenCalledTimes(1);

      onMove.mockClear();
      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 100, clientY: 100 }));
      expect(onMove).not.toHaveBeenCalled();
    });
  });

  describe("re-entrant safety", () => {
    it("a second pointerdown WHILE a drag is in flight is ignored (no listener stacking)", () => {
      // `active` flag must block the second gesture entirely so
      const onStart = vi.fn();
      const onMove = vi.fn();
      const onDrop = vi.fn();
      const drag = useWidgetDrag({
        ...defaultHarness(),
        onMove,
        onDrop,
        onStart,
      });

      const down1 = fakePointerEvent("pointerdown", { clientX: 0, clientY: 0, pointerId: 1 });
      Object.defineProperty(down1, "currentTarget", { value: element });
      drag.onPointerDown(down1);
      expect(onStart).toHaveBeenCalledTimes(1);

      const down2 = fakePointerEvent("pointerdown", { clientX: 100, clientY: 100, pointerId: 2 });
      Object.defineProperty(down2, "currentTarget", { value: element });
      drag.onPointerDown(down2);
      expect(onStart).toHaveBeenCalledTimes(1);

      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 48, clientY: 48 }));
      expect(onMove).toHaveBeenCalledTimes(1);

      element.dispatchEvent(fakePointerEvent("pointerup"));
      expect(onDrop).toHaveBeenCalledTimes(1);

      const down3 = fakePointerEvent("pointerdown", { clientX: 0, clientY: 0 });
      Object.defineProperty(down3, "currentTarget", { value: element });
      drag.onPointerDown(down3);
      expect(onStart).toHaveBeenCalledTimes(2);
    });

    it("second drag reads fresh getPosition (no accumulated offset error)", () => {
      const onDrop = vi.fn();
      // ref after the first drop. The composable must NOT cache the
      let pos = { x: 0, y: 0 };
      const drag = useWidgetDrag({
        getPosition: () => pos,
        getSize: () => ({ ...SM_PX }),
        getHostSize: () => ({ width: 1920, height: 1080 }),
        onMove: vi.fn(),
        onDrop,
      });

      const down1 = fakePointerEvent("pointerdown", { clientX: 0, clientY: 0 });
      Object.defineProperty(down1, "currentTarget", { value: element });
      drag.onPointerDown(down1);
      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 48, clientY: 48 }));
      element.dispatchEvent(fakePointerEvent("pointerup"));
      expect(onDrop).toHaveBeenLastCalledWith(2, 2);

      pos = { x: 48, y: 48 };

      // Drag 2: offset must anchor on 48, not 0. Pointer at 100 →
      const down2 = fakePointerEvent("pointerdown", { clientX: 100, clientY: 100 });
      Object.defineProperty(down2, "currentTarget", { value: element });
      drag.onPointerDown(down2);
      element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 124, clientY: 124 }));
      element.dispatchEvent(fakePointerEvent("pointerup"));
      expect(onDrop).toHaveBeenLastCalledWith(3, 3);
    });
  });
});
