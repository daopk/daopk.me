import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWindowDrag } from "./useWindowDrag";

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

describe("useWindowDrag", () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement("div");
    document.body.appendChild(element);
  });

  it("pointerdown with left button starts the drag and fires onStart", () => {
    const onStart = vi.fn();
    const drag = useWindowDrag({
      getPosition: () => ({ x: 100, y: 50 }),
      onMove: vi.fn(),
      onStart,
      onEnd: vi.fn(),
    });

    const down = fakePointerEvent("pointerdown", { clientX: 10, clientY: 5 });
    Object.defineProperty(down, "currentTarget", { value: element });

    drag.onPointerDown(down);

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("non-left-button pointerdown is ignored", () => {
    const onStart = vi.fn();
    const drag = useWindowDrag({
      getPosition: () => ({ x: 0, y: 0 }),
      onMove: vi.fn(),
      onStart,
      onEnd: vi.fn(),
    });

    const down = fakePointerEvent("pointerdown", { button: 2 });
    Object.defineProperty(down, "currentTarget", { value: element });

    drag.onPointerDown(down);

    expect(onStart).not.toHaveBeenCalled();
  });

  it("pointermove streams delta-applied position and forwards client coords", () => {
    const onMove = vi.fn();
    const drag = useWindowDrag({
      getPosition: () => ({ x: 100, y: 50 }),
      onMove,
      onStart: vi.fn(),
      onEnd: vi.fn(),
    });

    const down = fakePointerEvent("pointerdown", { clientX: 10, clientY: 5 });
    Object.defineProperty(down, "currentTarget", { value: element });
    drag.onPointerDown(down);

    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 30, clientY: 25 }));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(120, 70, 30, 25);
  });

  it("pointerup fires onEnd and detaches the move listener", () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const drag = useWindowDrag({
      getPosition: () => ({ x: 0, y: 0 }),
      onMove,
      onStart: vi.fn(),
      onEnd,
    });

    const down = fakePointerEvent("pointerdown");
    Object.defineProperty(down, "currentTarget", { value: element });
    drag.onPointerDown(down);

    element.dispatchEvent(fakePointerEvent("pointerup"));
    expect(onEnd).toHaveBeenCalledTimes(1);

    onMove.mockClear();
    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 100, clientY: 100 }));
    expect(onMove).not.toHaveBeenCalled();
  });

  it("pointercancel routes through the same cleanup as pointerup (onEnd fires)", () => {
    const onEnd = vi.fn();
    const onMove = vi.fn();
    const drag = useWindowDrag({
      getPosition: () => ({ x: 0, y: 0 }),
      onMove,
      onStart: vi.fn(),
      onEnd,
    });

    const down = fakePointerEvent("pointerdown");
    Object.defineProperty(down, "currentTarget", { value: element });
    drag.onPointerDown(down);

    element.dispatchEvent(fakePointerEvent("pointercancel"));
    expect(onEnd).toHaveBeenCalledTimes(1);

    onMove.mockClear();
    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 10, clientY: 10 }));
    expect(onMove).not.toHaveBeenCalled();
  });
});
