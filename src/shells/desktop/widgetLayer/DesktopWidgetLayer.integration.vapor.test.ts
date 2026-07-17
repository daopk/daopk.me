import { mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick } from "vue";

import { kernel } from "~/core/kernel";
import { useWidgetPlacementStore } from "~/core/widgets/WidgetPlacementStore";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import DesktopWidgetLayer from "./DesktopWidgetLayer.vue";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

const TinyWidget = defineVaporComponent(
  () => {
    const element = document.createElement("div");
    element.className = "tiny-widget";
    element.textContent = "tiny";
    return element;
  },
  { name: "TinyWidget" },
);

// ResizeObserver doesn't deliver callbacks, and the contract under
const observerCallbacks: Array<(entries: Array<{ contentRect: DOMRectReadOnly }>) => void> = [];
function fireResize(width: number, height: number): void {
  const rect = { width, height } as unknown as DOMRectReadOnly;
  for (const cb of observerCallbacks) {
    cb([{ contentRect: rect }]);
  }
}

vi.mock("@vueuse/core", async () => {
  const actual = await vi.importActual<typeof import("@vueuse/core")>("@vueuse/core");
  return {
    ...actual,
    useResizeObserver: (
      _target: unknown,
      callback: (entries: Array<{ contentRect: DOMRectReadOnly }>) => void,
    ) => {
      observerCallbacks.push(callback);
      return { stop: () => observerCallbacks.splice(observerCallbacks.indexOf(callback), 1) };
    },
  };
});

interface FakePointerEventInit {
  clientX?: number;
  clientY?: number;
  button?: number;
  pointerId?: number;
}

function dispatchPointer(target: Element, type: string, init: FakePointerEventInit = {}): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    button: { value: init.button ?? 0 },
    pointerId: { value: init.pointerId ?? 1 },
  });
  target.dispatchEvent(ev);
}

describe("DesktopWidgetLayer integration (M3.7)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    observerCallbacks.length = 0;
    await kernel.init();
  });

  afterEach(() => {
    useWidgetPlacementStore().dispose();
    kernel.dispose();
    document.body.innerHTML = "";
  });

  it("registers a widget, mounts layer, drags slot, persists snapped placement", async () => {
    kernel.widgets.register({
      id: "test:integration",
      title: "Integration",
      surface: "desktop:wallpaper",
      size: "sm",
      defaultPlacement: { gridX: 0, gridY: 0 },
      component: () => Promise.resolve({ default: TinyWidget }),
    });

    const w = mount(DesktopWidgetLayer, {
      attachTo: document.body,
      global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
    });

    fireResize(1920, 1080);
    await nextTick();
    await nextTick();

    const slot = w.find('.desktop-widget-slot[data-widget-id="test:integration"]');
    expect(slot.exists()).toBe(true);

    expect((slot.element as HTMLElement).style.transform).toBe("translate3d(0px, 0px, 0)");

    dispatchPointer(slot.element, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(slot.element, "pointermove", { clientX: 50, clientY: 50 });
    dispatchPointer(slot.element, "pointerup");
    await nextTick();

    const placements = useWidgetPlacementStore();
    expect(placements.get("test:integration")).toEqual({ gridX: 2, gridY: 2 });

    expect((slot.element as HTMLElement).style.transform).toBe("translate3d(48px, 48px, 0)");

    w.unmount();
  });

  it("dragging onto another widget persists the nearest gap-safe placement", async () => {
    kernel.widgets.register({
      id: "test:occupied",
      title: "Occupied",
      surface: "desktop:wallpaper",
      size: "sm",
      defaultPlacement: { gridX: 0, gridY: 0 },
      component: () => Promise.resolve({ default: TinyWidget }),
    });
    kernel.widgets.register({
      id: "test:dragged",
      title: "Dragged",
      surface: "desktop:wallpaper",
      size: "sm",
      defaultPlacement: { gridX: 10, gridY: 0 },
      component: () => Promise.resolve({ default: TinyWidget }),
    });

    const w = mount(DesktopWidgetLayer, {
      attachTo: document.body,
      global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
    });
    fireResize(1920, 1080);
    await nextTick();
    await nextTick();

    const dragged = w.find('.desktop-widget-slot[data-widget-id="test:dragged"]');
    expect((dragged.element as HTMLElement).style.transform).toBe("translate3d(240px, 0px, 0)");

    dispatchPointer(dragged.element, "pointerdown", { clientX: 240, clientY: 0 });
    dispatchPointer(dragged.element, "pointermove", { clientX: 0, clientY: 0 });
    dispatchPointer(dragged.element, "pointerup");
    await nextTick();

    const placements = useWidgetPlacementStore();
    expect(placements.get("test:dragged")).toEqual({ gridX: 5, gridY: 0 });
    expect((dragged.element as HTMLElement).style.transform).toBe("translate3d(120px, 0px, 0)");

    w.unmount();
  });

  it("renders a registered wallpaper widget at its persisted grid position", async () => {
    const placements = useWidgetPlacementStore();
    placements.hydrate();
    placements.set("test:hydrated", { gridX: 10, gridY: 5 });

    kernel.widgets.register({
      id: "test:hydrated",
      title: "Hydrated",
      surface: "desktop:wallpaper",
      size: "sm",
      component: () => Promise.resolve({ default: TinyWidget }),
    });

    const w = mount(DesktopWidgetLayer, {
      attachTo: document.body,
      global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
    });
    fireResize(1920, 1080);
    await nextTick();
    await nextTick();

    const slot = w.find('.desktop-widget-slot[data-widget-id="test:hydrated"]');
    expect(slot.exists()).toBe(true);
    expect((slot.element as HTMLElement).style.transform).toBe("translate3d(240px, 120px, 0)");

    w.unmount();
  });
});
