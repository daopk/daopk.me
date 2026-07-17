import { afterEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent } from "vue";

import type { WidgetCatalogItem } from "~/core/widgets/catalog";
import type { WidgetManifest } from "~/types/widget";

import { useWidgetGalleryDesktopDrag } from "./useWidgetGalleryDesktopDrag";

const StubWidget = defineVaporComponent(() => document.createElement("div"));

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

function makeRect(): DOMRect {
  return {
    left: 0,
    top: 28,
    right: 1920,
    bottom: 1080,
    width: 1920,
    height: 1052,
    x: 0,
    y: 28,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeManifest(overrides: Partial<WidgetManifest> = {}): WidgetManifest {
  return {
    id: overrides.id ?? "calendar-gallery:lunar",
    title: "Lunar Date",
    description: "Vietnamese lunar date",
    surface: "desktop:wallpaper",
    size: "md",
    component: () => Promise.resolve({ default: StubWidget }),
    ...overrides,
  };
}

function makeItem(overrides: Partial<WidgetCatalogItem> = {}): WidgetCatalogItem {
  const manifest = overrides.manifest ?? makeManifest();
  return {
    manifest,
    id: manifest.id,
    title: manifest.title,
    description: manifest.description ?? "",
    provider: { kind: "app", label: "App: Calendar" },
    surface: manifest.surface,
    surfaceLabel: "Desktop",
    sizeLabel: "Medium",
    visible: false,
    defaultVisible: false,
    desktopPlaceable: true,
    ...overrides,
  };
}

describe("useWidgetGalleryDesktopDrag", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows a snapped drag ghost after the movement threshold and places on pointerup", () => {
    const item = makeItem();
    const onPlace = vi.fn();
    const resolveTargetAtPointer = vi.fn(() => ({
      placement: { gridX: 21, gridY: 1 },
      stageRect: makeRect(),
    }));
    const drag = useWidgetGalleryDesktopDrag({ resolveTargetAtPointer, onPlace });

    drag.startDesktopDrag(item, fakePointerEvent("pointerdown", { clientX: 320, clientY: 120 }));
    document.dispatchEvent(fakePointerEvent("pointermove", { clientX: 323, clientY: 123 }));

    expect(drag.dragging.value).toBeNull();
    expect(resolveTargetAtPointer).not.toHaveBeenCalled();

    document.dispatchEvent(fakePointerEvent("pointermove", { clientX: 600, clientY: 220 }));

    expect(drag.dragging.value).toEqual({
      item,
      x: 504,
      y: 52,
      width: 192,
      height: 96,
    });
    expect(drag.dragStyle.value).toEqual({
      inlineSize: "192px",
      blockSize: "96px",
      transform: "translate3d(504px, 52px, 0)",
    });

    document.dispatchEvent(fakePointerEvent("pointerup", { clientX: 600, clientY: 220 }));

    expect(onPlace).toHaveBeenCalledWith(item, { gridX: 21, gridY: 1 });
    expect(drag.dragging.value).toBeNull();
  });

  it("falls back to pointer-centered ghost position when no desktop target resolves", () => {
    const item = makeItem();
    const drag = useWidgetGalleryDesktopDrag({
      resolveTargetAtPointer: () => null,
      onPlace: vi.fn(),
    });

    drag.startDesktopDrag(item, fakePointerEvent("pointerdown", { clientX: 320, clientY: 120 }));
    document.dispatchEvent(fakePointerEvent("pointermove", { clientX: 600, clientY: 220 }));

    expect(drag.dragging.value).toMatchObject({
      x: 504,
      y: 172,
      width: 192,
      height: 96,
    });

    drag.stopDesktopDrag();
  });

  it("ignores visible, non-placeable, and non-left-button gestures", () => {
    const resolveTargetAtPointer = vi.fn();
    const onPlace = vi.fn();
    const drag = useWidgetGalleryDesktopDrag({ resolveTargetAtPointer, onPlace });

    drag.startDesktopDrag(makeItem({ visible: true }), fakePointerEvent("pointerdown"));
    drag.startDesktopDrag(
      makeItem({ desktopPlaceable: false }),
      fakePointerEvent("pointerdown", { clientX: 10, clientY: 10 }),
    );
    drag.startDesktopDrag(
      makeItem(),
      fakePointerEvent("pointerdown", { button: 2, clientX: 10, clientY: 10 }),
    );
    document.dispatchEvent(fakePointerEvent("pointermove", { clientX: 100, clientY: 100 }));
    document.dispatchEvent(fakePointerEvent("pointerup", { clientX: 100, clientY: 100 }));

    expect(resolveTargetAtPointer).not.toHaveBeenCalled();
    expect(onPlace).not.toHaveBeenCalled();
    expect(drag.dragging.value).toBeNull();
  });
});
