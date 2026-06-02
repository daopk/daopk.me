import { describe, expect, it } from "vitest";

import { pointFromPointerEvent } from "./babyTouchPointer";

function testRect(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function setElementRect(element: Element, width: number, height: number): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => testRect(width, height),
  });
}

function makePointerEvent(target: HTMLElement, clientX: number, clientY: number): PointerEvent {
  const event = new Event("pointerdown", { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    currentTarget: { value: target },
  });
  return event;
}

describe("babyTouchPointer", () => {
  it("maps natural pointer coordinates against the event target rect", () => {
    const target = document.createElement("div");
    setElementRect(target, 200, 100);

    expect(pointFromPointerEvent(makePointerEvent(target, 50, 25))).toEqual({
      x: 0.25,
      y: 0.25,
    });
  });

  it("maps landscape-right coordinates so logical top is on the physical right", () => {
    const target = document.createElement("div");
    setElementRect(target, 100, 200);

    expect(pointFromPointerEvent(makePointerEvent(target, 25, 50), "landscape-right")).toEqual({
      x: 0.25,
      y: 0.75,
    });
  });
});
