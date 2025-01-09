import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWindowResize, type ResizeDirection } from "./useWindowResize";

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

interface ResizeResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

function captureResizeOnce(
  direction: ResizeDirection,
  startBounds: ResizeResult,
  delta: { dx: number; dy: number },
): ResizeResult {
  const element = document.createElement("div");
  document.body.appendChild(element);

  let captured: ResizeResult | null = null;
  const resize = useWindowResize({
    direction,
    getBounds: () => startBounds,
    onResize: (x, y, width, height) => {
      captured = { x, y, width, height };
    },
  });

  const down = fakePointerEvent("pointerdown", { clientX: 0, clientY: 0 });
  Object.defineProperty(down, "currentTarget", { value: element });
  resize.onPointerDown(down);

  element.dispatchEvent(fakePointerEvent("pointermove", { clientX: delta.dx, clientY: delta.dy }));

  if (captured === null) {
    throw new Error("onResize was not called");
  }

  return captured;
}

describe("useWindowResize", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const start: ResizeResult = { x: 100, y: 80, width: 400, height: 300 };

  it("east handle grows width to the east; origin unchanged", () => {
    const out = captureResizeOnce("e", start, { dx: 50, dy: 999 });
    expect(out).toEqual({ x: 100, y: 80, width: 450, height: 300 });
  });

  it("south handle grows height downward; origin unchanged", () => {
    const out = captureResizeOnce("s", start, { dx: 999, dy: 70 });
    expect(out).toEqual({ x: 100, y: 80, width: 400, height: 370 });
  });

  it("west handle moves x and shrinks width by the same dx", () => {
    const out = captureResizeOnce("w", start, { dx: -40, dy: 0 });
    expect(out).toEqual({ x: 60, y: 80, width: 440, height: 300 });
  });

  it("north handle moves y and shrinks height by the same dy", () => {
    const out = captureResizeOnce("n", start, { dx: 0, dy: -30 });
    expect(out).toEqual({ x: 100, y: 50, width: 400, height: 330 });
  });

  it("se corner combines east + south", () => {
    const out = captureResizeOnce("se", start, { dx: 25, dy: 15 });
    expect(out).toEqual({ x: 100, y: 80, width: 425, height: 315 });
  });

  it("nw corner combines north + west (origin shifts, dimensions shrink)", () => {
    const out = captureResizeOnce("nw", start, { dx: -20, dy: -10 });
    expect(out).toEqual({ x: 80, y: 70, width: 420, height: 310 });
  });

  it("ne corner combines north + east", () => {
    const out = captureResizeOnce("ne", start, { dx: 30, dy: -20 });
    expect(out).toEqual({ x: 100, y: 60, width: 430, height: 320 });
  });

  it("sw corner combines south + west", () => {
    const out = captureResizeOnce("sw", start, { dx: -15, dy: 25 });
    expect(out).toEqual({ x: 85, y: 80, width: 415, height: 325 });
  });

  it("non-left-button pointerdown is ignored", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const onResize = vi.fn();
    const onStart = vi.fn();

    const resize = useWindowResize({
      direction: "e",
      getBounds: () => start,
      onResize,
      onStart,
    });

    const down = fakePointerEvent("pointerdown", { button: 2 });
    Object.defineProperty(down, "currentTarget", { value: element });
    resize.onPointerDown(down);

    expect(onStart).not.toHaveBeenCalled();
    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 50, clientY: 0 }));
    expect(onResize).not.toHaveBeenCalled();
  });

  it("pointercancel cleans up listeners and fires onEnd", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const onResize = vi.fn();
    const onEnd = vi.fn();

    const resize = useWindowResize({
      direction: "e",
      getBounds: () => start,
      onResize,
      onEnd,
    });

    const down = fakePointerEvent("pointerdown", { clientX: 0, clientY: 0 });
    Object.defineProperty(down, "currentTarget", { value: element });
    resize.onPointerDown(down);

    element.dispatchEvent(fakePointerEvent("pointercancel"));

    expect(onEnd).toHaveBeenCalledTimes(1);

    onResize.mockClear();
    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 100, clientY: 100 }));
    expect(onResize).not.toHaveBeenCalled();
  });
});
