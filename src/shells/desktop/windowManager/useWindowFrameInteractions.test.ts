import { afterEach, describe, expect, it, vi } from "vitest";

import type { WindowRecord } from "./useWindowManager";
import { useWindowFrameInteractions } from "./useWindowFrameInteractions";

interface FakePointerEventInit {
  readonly button?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly pointerId?: number;
}

function fakePointerEvent(type: string, init: FakePointerEventInit = {}): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    pointerId: { value: init.pointerId ?? 1 },
  });

  return event as PointerEvent;
}

function pointerDown(
  element: HTMLElement,
  handler: (event: PointerEvent) => void,
  init: FakePointerEventInit = {},
): void {
  const event = fakePointerEvent("pointerdown", init);
  Object.defineProperty(event, "currentTarget", { value: element });
  handler(event);
}

function makeRecord(overrides: Partial<WindowRecord> = {}): WindowRecord {
  return {
    id: "window-1",
    manifestId: "notes",
    handleId: "handle-1",
    title: "Notes",
    x: 100,
    y: 80,
    width: 300,
    height: 240,
    minWidth: 240,
    minHeight: 160,
    z: 101,
    focused: true,
    singleton: false,
    maximized: false,
    minimized: false,
    argsRevision: 0,
    ...overrides,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useWindowFrameInteractions", () => {
  it("clamps drag output, reports snap intent, and commits the pending snap", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const record = makeRecord();
    const onFocus = vi.fn();
    const onMove = vi.fn();
    const onSnap = vi.fn();
    const onSnapIntent = vi.fn();
    const interactions = useWindowFrameInteractions({
      getRecord: () => record,
      getStageBounds: () => ({ width: 500, height: 400 }),
      getStageOffset: () => ({ x: 10, y: 20 }),
      onFocus,
      onMove,
      onResize: vi.fn(),
      onSnap,
      onSnapIntent,
    });

    pointerDown(element, interactions.drag.onPointerDown, { clientX: 110, clientY: 100 });

    expect(interactions.dragging.value).toBe(true);
    expect(onFocus).toHaveBeenCalledOnce();

    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 1_000, clientY: 1_000 }));

    expect(onMove).toHaveBeenLastCalledWith("window-1", 440, 372);
    expect(onSnapIntent).toHaveBeenLastCalledWith("window-1", "right");

    element.dispatchEvent(fakePointerEvent("pointerup"));

    expect(interactions.dragging.value).toBe(false);
    expect(onSnapIntent).toHaveBeenLastCalledWith("window-1", null);
    expect(onSnap).toHaveBeenCalledWith("window-1", "right");
  });

  it("clamps resize bounds to the stage and exposes resize lifecycle state", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const record = makeRecord();
    const onFocus = vi.fn();
    const onResize = vi.fn();
    const interactions = useWindowFrameInteractions({
      getRecord: () => record,
      getStageBounds: () => ({ width: 500, height: 400 }),
      getStageOffset: () => undefined,
      onFocus,
      onMove: vi.fn(),
      onResize,
      onSnap: vi.fn(),
      onSnapIntent: vi.fn(),
    });

    pointerDown(element, interactions.resizeHandlers.nw);

    expect(interactions.resizing.value).toBe(true);
    expect(onFocus).toHaveBeenCalledOnce();

    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: -200, clientY: -200 }));

    expect(onResize).toHaveBeenCalledWith("window-1", 0, 0, 400, 320);

    element.dispatchEvent(fakePointerEvent("pointerup"));
    expect(interactions.resizing.value).toBe(false);
  });

  it("provides all eight frame resize directions", () => {
    const interactions = useWindowFrameInteractions({
      getRecord: () => makeRecord(),
      getStageBounds: () => ({ width: 500, height: 400 }),
      getStageOffset: () => undefined,
      onFocus: vi.fn(),
      onMove: vi.fn(),
      onResize: vi.fn(),
      onSnap: vi.fn(),
      onSnapIntent: vi.fn(),
    });

    expect(interactions.resizeDirections).toEqual(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);
    expect(Object.keys(interactions.resizeHandlers)).toEqual(interactions.resizeDirections);
  });
});
