import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import { useWidgetGalleryPanelDrag } from "./useWidgetGalleryPanelDrag";

interface FakePointerEventInit {
  clientX?: number;
  clientY?: number;
  button?: number;
}

function fakePointerEvent(type: string, init: FakePointerEventInit = {}): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
  });
  return event as PointerEvent;
}

function stubRect(
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

function setViewport(width: number, height: number): void {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: width },
    innerHeight: { configurable: true, value: height },
  });
}

describe("useWidgetGalleryPanelDrag", () => {
  let panel: HTMLElement;

  beforeEach(() => {
    setViewport(1024, 768);
    panel = document.createElement("aside");
    document.body.appendChild(panel);
    stubRect(panel, { left: 600, top: 44, width: 380, height: 480 });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("drags the panel within desktop-stage viewport bounds", () => {
    const drag = useWidgetGalleryPanelDrag({
      panelRef: ref(panel),
      isOpen: () => true,
      getDesktopStageTop: () => 28,
    });

    drag.startPanelDrag(fakePointerEvent("pointerdown", { clientX: 760, clientY: 62 }));
    document.dispatchEvent(fakePointerEvent("pointermove", { clientX: 700, clientY: 122 }));

    expect(drag.panelPosition.value).toEqual({ x: 540, y: 104 });
    expect(drag.panelStyle.value).toEqual({
      insetBlockStart: "104px",
      insetInlineEnd: "auto",
      insetInlineStart: "540px",
    });

    document.dispatchEvent(fakePointerEvent("pointerup", { clientX: 700, clientY: 122 }));
    expect(drag.panelDragging.value).toBe(false);
  });

  it("ignores non-left pointerdown events", () => {
    const drag = useWidgetGalleryPanelDrag({
      panelRef: ref(panel),
      isOpen: () => true,
      getDesktopStageTop: () => 28,
    });

    drag.startPanelDrag(fakePointerEvent("pointerdown", { button: 2, clientX: 760, clientY: 62 }));
    document.dispatchEvent(fakePointerEvent("pointermove", { clientX: 700, clientY: 122 }));

    expect(drag.panelPosition.value).toBeNull();
    expect(drag.panelDragging.value).toBe(false);
  });

  it("re-clamps an existing panel position on viewport resize", () => {
    const drag = useWidgetGalleryPanelDrag({
      panelRef: ref(panel),
      isOpen: () => true,
      getDesktopStageTop: () => 28,
    });

    drag.startPanelDrag(fakePointerEvent("pointerdown", { clientX: 760, clientY: 62 }));
    document.dispatchEvent(fakePointerEvent("pointermove", { clientX: 900, clientY: 700 }));
    document.dispatchEvent(fakePointerEvent("pointerup", { clientX: 900, clientY: 700 }));

    setViewport(700, 600);
    drag.clampPanelToViewport();

    expect(drag.panelPosition.value).toEqual({ x: 312, y: 112 });
  });
});
