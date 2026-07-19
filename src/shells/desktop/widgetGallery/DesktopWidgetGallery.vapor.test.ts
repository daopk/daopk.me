import { mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick } from "vue";

import { kernel } from "~/core/kernel";
import { useWidgetPlacementStore } from "~/core/widgets/WidgetPlacementStore";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import type { WidgetSurface } from "~/types/widget";

import DesktopWidgetGallery from "./DesktopWidgetGallery.vue";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon = defineVaporComponent(() => document.createElement("svg"));

function mountGallery(): ReturnType<typeof mount> {
  return mount(DesktopWidgetGallery, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
  });
}

function openGallery(): void {
  kernel.events.emit("widget.gallery.open.requested", { source: "menu" });
}

function registerAppWidget(surface: WidgetSurface = "desktop:wallpaper"): void {
  kernel.apps.register({
    id: "calendar-gallery",
    name: "Calendar Gallery",
    icon: StubIcon,
    category: "productivity",
    component: () => Promise.resolve({ default: StubIcon }),
    widgets: [
      {
        id: "calendar-gallery:lunar",
        title: "Lunar Date",
        description: "Vietnamese lunar date",
        surface,
        size: "md",
        component: () => Promise.resolve({ default: StubIcon }),
      },
    ],
  });
}

function pointerEvent(
  type: string,
  options: { clientX: number; clientY: number; button?: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: options.button ?? 0 },
    clientX: { value: options.clientX },
    clientY: { value: options.clientY },
  });
  return event;
}

function pressTab(target: Element, shiftKey = false): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey,
    }),
  );
}

function addDesktopStage(
  size: { width: number; height: number } = { width: 1920, height: 1052 },
): HTMLElement {
  const stage = document.createElement("main");
  stage.className = "desktop-stage";
  stage.tabIndex = -1;
  Object.defineProperty(stage, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 28,
      right: size.width,
      bottom: 28 + size.height,
      width: size.width,
      height: size.height,
      x: 0,
      y: 28,
      toJSON: () => ({}),
    }),
  });
  document.body.appendChild(stage);
  return stage;
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

describe("DesktopWidgetGallery", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
      () => [new DOMRect(0, 0, 1, 1)] as unknown as DOMRectList,
    );
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
    document.body.innerHTML = "";
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("traps focus, closes on Escape, and returns focus to the opener", async () => {
    registerAppWidget();
    const opener = document.createElement("button");
    opener.textContent = "Open widgets";
    document.body.appendChild(opener);
    opener.focus();

    const wrapper = mountGallery();
    openGallery();
    await nextTick();

    const panel = wrapper.get<HTMLElement>(".desktop-widget-gallery");
    const search = wrapper.get<HTMLInputElement>('input[type="search"]').element;
    const closeButton = wrapper.get<HTMLButtonElement>(
      '.desktop-widget-gallery__close[aria-label="Close"]',
    ).element;
    const addButton = wrapper
      .get('[data-widget-id="calendar-gallery:lunar"]')
      .findAll<HTMLButtonElement>("button")
      .find((button) => button.text() === "Add")?.element;

    expect(addButton).toBeDefined();
    expect(panel.attributes("role")).toBe("dialog");
    expect(panel.attributes("aria-modal")).toBe("false");
    await vi.waitFor(() => expect(document.activeElement).toBe(search));

    addButton!.focus();
    pressTab(addButton!);
    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    pressTab(closeButton, true);
    expect(document.activeElement).toBe(addButton);

    search.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      }),
    );
    await nextTick();

    expect(wrapper.find(".desktop-widget-gallery").exists()).toBe(false);
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));

    wrapper.unmount();
  });

  it("returns focus to the desktop when its context-menu opener is removed", async () => {
    const stage = addDesktopStage();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const wrapper = mountGallery();
    openGallery();
    await nextTick();
    opener.remove();

    wrapper.get<HTMLInputElement>('input[type="search"]').element.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      }),
    );
    await nextTick();

    await vi.waitFor(() => expect(document.activeElement).toBe(stage));

    wrapper.unmount();
  });

  it("opens from the widget gallery event and shows desktop widgets without source filters", async () => {
    registerAppWidget();
    kernel.widgets.register({
      id: "desktop:system-clock",
      title: "System Clock",
      surface: "desktop:wallpaper",
      size: "sm",
      component: () => Promise.resolve({ default: StubIcon }),
    });

    const wrapper = mountGallery();
    openGallery();
    await nextTick();

    expect(wrapper.find(".desktop-widget-gallery").exists()).toBe(true);
    expect(wrapper.find(".desktop-widget-gallery__segments").exists()).toBe(false);
    expect(wrapper.text()).toContain("System Clock");
    expect(wrapper.text()).toContain("Lunar Date");

    wrapper.unmount();
  });

  it("drags the add widgets panel by its header", async () => {
    registerAppWidget();
    const wrapper = mountGallery();
    openGallery();
    await nextTick();

    const panel = wrapper.get(".desktop-widget-gallery");
    stubRect(panel.element, { left: 600, top: 44, width: 380, height: 480 });

    wrapper
      .get(".desktop-widget-gallery__header")
      .element.dispatchEvent(pointerEvent("pointerdown", { clientX: 760, clientY: 62 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 700, clientY: 122 }));
    await nextTick();

    const style = panel.element.getAttribute("style") ?? "";
    expect(style).toContain("inset-inline-start: 540px");
    expect(style).toContain("inset-block-start: 104px");

    document.dispatchEvent(pointerEvent("pointerup", { clientX: 700, clientY: 122 }));
    await nextTick();

    expect(panel.classes()).not.toContain("desktop-widget-gallery--dragging");

    wrapper.unmount();
  });

  it("does not expose mobile widgets from the desktop gallery", async () => {
    registerAppWidget("mobile:widgets");
    const wrapper = mountGallery();
    openGallery();
    await nextTick();

    const tabLabels = wrapper.findAll(".desktop-widget-gallery__tabs button").map((b) => b.text());
    expect(tabLabels).toEqual(["Desktop", "Menubar"]);
    expect(wrapper.text()).not.toContain("Lunar Date");

    wrapper.unmount();
  });

  it("clicking Add persists an explicit true override for optional app widgets", async () => {
    registerAppWidget();
    const wrapper = mountGallery();
    openGallery();
    await nextTick();

    const row = wrapper.find('[data-widget-id="calendar-gallery:lunar"]');
    expect(row.attributes("data-visible")).toBeUndefined();

    const addButton = row
      .findAll<HTMLButtonElement>("button")
      .find((button) => button.text() === "Add");
    expect(addButton).toBeDefined();
    await addButton!.trigger("click");
    await nextTick();

    expect(useWidgetPlacementStore().isEnabled("desktop", "calendar-gallery:lunar", false)).toBe(
      true,
    );
    expect(
      wrapper.find('[data-widget-id="calendar-gallery:lunar"]').attributes("data-visible"),
    ).toBe("true");

    wrapper.unmount();
  });

  it("dragging an app widget onto the desktop writes placement and adds it", async () => {
    addDesktopStage();
    registerAppWidget();
    const wrapper = mountGallery();
    openGallery();
    await nextTick();

    const preview = wrapper.find(
      '[data-widget-id="calendar-gallery:lunar"] .desktop-widget-gallery__preview',
    );
    preview.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 320, clientY: 120 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 520, clientY: 190 }));
    document.dispatchEvent(pointerEvent("pointerup", { clientX: 600, clientY: 220 }));
    await nextTick();

    const placements = useWidgetPlacementStore();
    expect(placements.isEnabled("desktop", "calendar-gallery:lunar", false)).toBe(true);
    expect(placements.get("calendar-gallery:lunar")).toEqual({ gridX: 21, gridY: 6 });

    wrapper.unmount();
  });

  it("renders the drag ghost at the collision-resolved desktop drop target", async () => {
    addDesktopStage();
    kernel.widgets.register({
      id: "desktop:occupied",
      title: "Occupied",
      surface: "desktop:wallpaper",
      size: "md",
      defaultPlacement: { gridX: 21, gridY: 6 },
      component: () => Promise.resolve({ default: StubIcon }),
    });
    registerAppWidget();
    const wrapper = mountGallery();
    openGallery();
    await nextTick();

    const panel = wrapper.get(".desktop-widget-gallery");
    const preview = wrapper.find(
      '[data-widget-id="calendar-gallery:lunar"] .desktop-widget-gallery__preview',
    );
    preview.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 320, clientY: 120 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 600, clientY: 220 }));
    await nextTick();

    const ghost = document.body.querySelector<HTMLElement>(".desktop-widget-gallery__drag-ghost");
    expect(ghost).not.toBeNull();
    if (ghost === null) {
      throw new Error("Expected the desktop widget drag ghost to render");
    }

    expect(panel.element.contains(ghost)).toBe(false);
    const style = ghost.getAttribute("style") ?? "";
    expect(style).toContain("inline-size: 192px");
    expect(style).toContain("block-size: 96px");
    expect(style).toContain("translate3d(504px, 52px, 0)");

    document.dispatchEvent(pointerEvent("pointerup", { clientX: 600, clientY: 220 }));
    await nextTick();

    expect(useWidgetPlacementStore().get("calendar-gallery:lunar")).toEqual({
      gridX: 21,
      gridY: 1,
    });
    expect(document.body.querySelector(".desktop-widget-gallery__drag-ghost")).toBeNull();

    wrapper.unmount();
  });

  it("dragging an app widget onto an occupied desktop slot uses the nearest legal gap-safe slot", async () => {
    addDesktopStage();
    kernel.widgets.register({
      id: "desktop:occupied",
      title: "Occupied",
      surface: "desktop:wallpaper",
      size: "md",
      defaultPlacement: { gridX: 21, gridY: 6 },
      component: () => Promise.resolve({ default: StubIcon }),
    });
    registerAppWidget();
    const wrapper = mountGallery();
    openGallery();
    await nextTick();

    const preview = wrapper.find(
      '[data-widget-id="calendar-gallery:lunar"] .desktop-widget-gallery__preview',
    );
    preview.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 320, clientY: 120 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 520, clientY: 190 }));
    document.dispatchEvent(pointerEvent("pointerup", { clientX: 600, clientY: 220 }));
    await nextTick();

    const placements = useWidgetPlacementStore();
    expect(placements.isEnabled("desktop", "calendar-gallery:lunar", false)).toBe(true);
    expect(placements.get("calendar-gallery:lunar")).toEqual({ gridX: 21, gridY: 1 });

    wrapper.unmount();
  });

  it("dragging an app widget onto a full desktop does not add it", async () => {
    addDesktopStage({ width: 192, height: 96 });
    kernel.widgets.register({
      id: "desktop:occupied",
      title: "Occupied",
      surface: "desktop:wallpaper",
      size: "md",
      defaultPlacement: { gridX: 0, gridY: 0 },
      component: () => Promise.resolve({ default: StubIcon }),
    });
    registerAppWidget();
    const wrapper = mountGallery();
    openGallery();
    await nextTick();

    const preview = wrapper.find(
      '[data-widget-id="calendar-gallery:lunar"] .desktop-widget-gallery__preview',
    );
    preview.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 40 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 90, clientY: 60 }));
    document.dispatchEvent(pointerEvent("pointerup", { clientX: 90, clientY: 60 }));
    await nextTick();

    const placements = useWidgetPlacementStore();
    expect(placements.isEnabled("desktop", "calendar-gallery:lunar", false)).toBe(false);
    expect(placements.get("calendar-gallery:lunar")).toBeUndefined();

    wrapper.unmount();
  });
});
