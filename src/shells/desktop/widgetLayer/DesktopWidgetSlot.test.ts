import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { useWidgetPlacementStore } from "~/core/widgets/WidgetPlacementStore";
import { widgetPixelDimensions, WIDGET_GRID_PITCH_PX } from "~/core/widgets/sizing";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import type { WidgetManifest } from "~/types/widget";

import DesktopWidgetSlot from "./DesktopWidgetSlot.vue";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

function makeManifest(overrides: Partial<WidgetManifest> = {}): WidgetManifest {
  const Stub = defineComponent({
    name: "WidgetStub",
    setup() {
      return () => h("div", { class: "widget-stub", "data-testid": "widget-stub" }, "stub");
    },
  });

  return {
    id: "test:widget",
    title: "Test Widget",
    surface: "desktop:wallpaper",
    size: "sm",
    component: () => Promise.resolve({ default: Stub }),
    ...overrides,
  };
}

interface FakePointerEventInit {
  clientX?: number;
  clientY?: number;
  button?: number;
  pointerId?: number;
}

function dispatchPointer(target: Element, type: string, init: FakePointerEventInit = {}): boolean {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    button: { value: init.button ?? 0 },
    pointerId: { value: init.pointerId ?? 1 },
  });
  return target.dispatchEvent(ev);
}

function mountSlot(
  manifest: WidgetManifest,
  placement: { gridX: number; gridY: number },
  hostSize: { width: number; height: number } = { width: 1920, height: 1080 },
): ReturnType<typeof mount> {
  const dispatch = vi.fn(async (id: string, options?: { payload?: Record<string, unknown> }) => {
    if (id === "desktop:widget.remove" && typeof options?.payload?.widgetId === "string") {
      useWidgetPlacementStore().setEnabled("desktop", options.payload.widgetId, false);
    }
  });

  return mount(DesktopWidgetSlot, {
    attachTo: document.body,
    props: { manifest, placement, hostSize },
    global: {
      provide: {
        [KernelInjectionKey as symbol]: {
          commands: {
            dispatch,
            register: vi.fn(),
            unregister: vi.fn(),
            list: vi.fn(() => []),
          },
        } as unknown as Kernel,
      },
    },
  });
}

function slotEl(wrapper: ReturnType<typeof mount>): HTMLElement {
  return wrapper.get(".desktop-widget-slot").element as HTMLElement;
}

describe("DesktopWidgetSlot (M3.7)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    // Dispose so the cross-tab `storage` listener doesn't leak into
    useWidgetPlacementStore().dispose();
    document.body.innerHTML = "";
  });

  describe("position binding", () => {
    it("maps placement.gridX/Y to transform translate3d via gridToPixels", () => {
      const manifest = makeManifest({ size: "sm" });
      const wrapper = mountSlot(manifest, { gridX: 4, gridY: 2 });

      const style = slotEl(wrapper).style;
      const expectedX = 4 * WIDGET_GRID_PITCH_PX;
      const expectedY = 2 * WIDGET_GRID_PITCH_PX;
      expect(style.transform).toBe(`translate3d(${expectedX}px, ${expectedY}px, 0)`);
    });

    it("recomputes transform when placement prop changes (reactive bind)", async () => {
      const manifest = makeManifest();
      const wrapper = mountSlot(manifest, { gridX: 0, gridY: 0 });

      await wrapper.setProps({ placement: { gridX: 8, gridY: 4 } });

      const style = slotEl(wrapper).style;
      expect(style.transform).toBe(
        `translate3d(${8 * WIDGET_GRID_PITCH_PX}px, ${4 * WIDGET_GRID_PITCH_PX}px, 0)`,
      );
    });
  });

  describe("size binding", () => {
    it("sm manifest renders at 96×96 (4×4 grid units)", () => {
      const wrapper = mountSlot(makeManifest({ size: "sm" }), { gridX: 0, gridY: 0 });
      const expected = widgetPixelDimensions("sm");
      const style = slotEl(wrapper).style;
      expect(style.width).toBe(`${expected.width}px`);
      expect(style.height).toBe(`${expected.height}px`);
    });

    it("md manifest renders at 192×96 (8×4 grid units)", () => {
      const wrapper = mountSlot(makeManifest({ size: "md" }), { gridX: 0, gridY: 0 });
      const expected = widgetPixelDimensions("md");
      const style = slotEl(wrapper).style;
      expect(style.width).toBe(`${expected.width}px`);
      expect(style.height).toBe(`${expected.height}px`);
    });

    it("lg manifest renders at 192×192 (8×8 grid units)", () => {
      const wrapper = mountSlot(makeManifest({ size: "lg" }), { gridX: 0, gridY: 0 });
      const expected = widgetPixelDimensions("lg");
      const style = slotEl(wrapper).style;
      expect(style.width).toBe(`${expected.width}px`);
      expect(style.height).toBe(`${expected.height}px`);
    });
  });

  describe("ARIA + data attributes", () => {
    it("renders with role=figure and aria-label from manifest.title", () => {
      const wrapper = mountSlot(makeManifest({ title: "Big Clock" }), { gridX: 0, gridY: 0 });
      const el = slotEl(wrapper);
      expect(el.getAttribute("role")).toBe("figure");
      expect(el.getAttribute("aria-label")).toBe("Big Clock");
    });

    it("exposes data-widget-id matching manifest.id (for layer-side targeting)", () => {
      const wrapper = mountSlot(makeManifest({ id: "clock:desktop-big" }), {
        gridX: 0,
        gridY: 0,
      });
      expect(slotEl(wrapper).dataset.widgetId).toBe("clock:desktop-big");
    });

    it("data-dragging is absent at rest", () => {
      const wrapper = mountSlot(makeManifest(), { gridX: 0, gridY: 0 });
      expect(slotEl(wrapper).dataset.dragging).toBeUndefined();
    });
  });

  describe("drag lifecycle", () => {
    it("pointerdown arms the gesture; movement past threshold sets data-dragging", async () => {
      const wrapper = mountSlot(makeManifest(), { gridX: 0, gridY: 0 });
      const el = slotEl(wrapper);

      dispatchPointer(el, "pointerdown", { clientX: 0, clientY: 0 });
      await wrapper.vm.$nextTick();
      expect(el.dataset.dragging).toBeUndefined();

      dispatchPointer(el, "pointermove", { clientX: 12, clientY: 0 });
      await wrapper.vm.$nextTick();

      expect(el.dataset.dragging).toBe("true");

      dispatchPointer(el, "pointerup");
      await wrapper.vm.$nextTick();

      expect(el.dataset.dragging).toBeUndefined();
    });

    it("lets interactive widget controls receive click when no drag starts", async () => {
      const onClick = vi.fn();
      const ButtonWidget = defineComponent({
        name: "ButtonWidget",
        setup() {
          return () => h("button", { class: "widget-button", onClick }, "Launch");
        },
      });
      const buttonModule = { default: ButtonWidget };
      Object.defineProperty(buttonModule, Symbol.toStringTag, { value: "Module" });
      const wrapper = mountSlot(
        makeManifest({
          component: () => Promise.resolve(buttonModule),
        }),
        { gridX: 0, gridY: 0 },
      );
      await flushPromises();

      const el = slotEl(wrapper);
      const button = wrapper.get("button").element;

      expect(dispatchPointer(button, "pointerdown", { clientX: 4, clientY: 4 })).toBe(true);
      expect(dispatchPointer(button, "pointerup", { clientX: 4, clientY: 4 })).toBe(true);
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await wrapper.vm.$nextTick();

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(el.dataset.dragging).toBeUndefined();
      expect(wrapper.emitted("drop")).toBeUndefined();
    });

    it("pointermove overrides the persisted position (transform follows pointer)", async () => {
      const wrapper = mountSlot(makeManifest(), { gridX: 0, gridY: 0 });
      const el = slotEl(wrapper);

      dispatchPointer(el, "pointerdown", { clientX: 0, clientY: 0 });
      dispatchPointer(el, "pointermove", { clientX: 60, clientY: 30 });
      await wrapper.vm.$nextTick();

      expect(el.style.transform).toBe("translate3d(60px, 30px, 0)");
    });

    it("on drop, emits `drop` with manifest id + snapped grid coords", async () => {
      const wrapper = mountSlot(makeManifest({ id: "test:widget" }), {
        gridX: 0,
        gridY: 0,
      });
      const el = slotEl(wrapper);

      dispatchPointer(el, "pointerdown", { clientX: 0, clientY: 0 });
      dispatchPointer(el, "pointermove", { clientX: 50, clientY: 50 });
      dispatchPointer(el, "pointerup");
      await wrapper.vm.$nextTick();

      const dropEvents = wrapper.emitted("drop");
      expect(dropEvents).toBeDefined();
      expect(dropEvents).toHaveLength(1);
      expect(dropEvents![0]).toEqual(["test:widget", 2, 2]);
    });

    it("clears drag override on drop so the next render snaps to persisted position", async () => {
      const wrapper = mountSlot(makeManifest(), { gridX: 0, gridY: 0 });
      const el = slotEl(wrapper);

      dispatchPointer(el, "pointerdown", { clientX: 0, clientY: 0 });
      dispatchPointer(el, "pointermove", { clientX: 50, clientY: 50 });
      dispatchPointer(el, "pointerup");
      await wrapper.setProps({ placement: { gridX: 2, gridY: 2 } });

      expect(el.style.transform).toBe("translate3d(48px, 48px, 0)");
    });

    it("non-primary button is ignored — no dragging state and no drop emit", async () => {
      const wrapper = mountSlot(makeManifest(), { gridX: 0, gridY: 0 });
      const el = slotEl(wrapper);

      dispatchPointer(el, "pointerdown", { button: 2, clientX: 0, clientY: 0 });
      dispatchPointer(el, "pointermove", { clientX: 50, clientY: 50 });
      dispatchPointer(el, "pointerup");
      await wrapper.vm.$nextTick();

      expect(el.dataset.dragging).toBeUndefined();
      expect(wrapper.emitted("drop")).toBeUndefined();
    });

    it("clamps drag to the live hostSize (drag past edge stops at edge)", async () => {
      const wrapper = mountSlot(
        makeManifest({ size: "sm" }),
        { gridX: 0, gridY: 0 },
        {
          width: 200,
          height: 200,
        },
      );
      const el = slotEl(wrapper);

      dispatchPointer(el, "pointerdown", { clientX: 0, clientY: 0 });
      dispatchPointer(el, "pointermove", { clientX: 10000, clientY: 10000 });
      await wrapper.vm.$nextTick();

      expect(el.style.transform).toBe("translate3d(104px, 104px, 0)");
    });
  });

  describe("component caching", () => {
    it("reuses the async component wrapper across re-renders with the same manifest reference", async () => {
      let loaderCalls = 0;
      const Stub = defineComponent({
        name: "WidgetStub",
        setup() {
          return () => h("div", { class: "stub-cached" });
        },
      });
      const manifest = makeManifest({
        component: () => {
          loaderCalls += 1;
          return Promise.resolve({ default: Stub });
        },
      });

      const wrapper = mountSlot(manifest, { gridX: 0, gridY: 0 });
      await wrapper.setProps({ placement: { gridX: 2, gridY: 0 } });
      await wrapper.setProps({ placement: { gridX: 4, gridY: 0 } });
      await wrapper.setProps({ hostSize: { width: 500, height: 500 } });

      expect(loaderCalls).toBeLessThanOrEqual(1);
    });
  });

  describe("context menu — Remove from desktop (post-F1)", () => {
    function dispatchContextMenu(target: Element): boolean {
      const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
      Object.defineProperties(ev, {
        clientX: { value: 12 },
        clientY: { value: 16 },
        button: { value: 2 },
      });
      return target.dispatchEvent(ev);
    }

    async function flushReka(): Promise<void> {
      await nextTick();
      await nextTick();
    }

    it("right-click on the slot opens a menu with a 'Remove from desktop' item", async () => {
      const placements = useWidgetPlacementStore();
      placements.hydrate();

      const wrapper = mountSlot(makeManifest({ id: "wp:clock" }), { gridX: 0, gridY: 0 });
      const el = slotEl(wrapper);

      dispatchContextMenu(el);
      await flushReka();

      const menu = document.body.querySelector('[role="menu"]');
      expect(menu).not.toBeNull();
      const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
      expect(items.map((n) => n.textContent?.trim())).toEqual(["Remove from desktop"]);
    });

    it("activating 'Remove from desktop' flips isEnabled(id) to false in the placement store", async () => {
      const placements = useWidgetPlacementStore();
      placements.hydrate();
      expect(placements.isEnabled("desktop", "wp:clock")).toBe(true);

      const wrapper = mountSlot(makeManifest({ id: "wp:clock" }), { gridX: 0, gridY: 0 });
      const el = slotEl(wrapper);

      dispatchContextMenu(el);
      await flushReka();

      const item = document.body.querySelector('[role="menuitem"]') as HTMLElement | null;
      expect(item).not.toBeNull();
      item!.click();
      await flushReka();

      expect(placements.isEnabled("desktop", "wp:clock")).toBe(false);
    });

    it("placement entry survives the remove (D7 — re-enable round-trip is non-destructive)", async () => {
      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.set("wp:clock", { gridX: 3, gridY: 5 });

      const wrapper = mountSlot(makeManifest({ id: "wp:clock" }), { gridX: 3, gridY: 5 });
      const el = slotEl(wrapper);

      dispatchContextMenu(el);
      await flushReka();
      (document.body.querySelector('[role="menuitem"]') as HTMLElement).click();
      await flushReka();

      expect(placements.isEnabled("desktop", "wp:clock")).toBe(false);
      expect(placements.list()["wp:clock"]).toEqual({ gridX: 3, gridY: 5 });
    });
  });

  describe("z-index on drag", () => {
    it("z-index is unset at rest, lifted while dragging", async () => {
      const wrapper = mountSlot(makeManifest(), { gridX: 0, gridY: 0 });
      const el = slotEl(wrapper);

      expect(el.style.zIndex).toBe("");

      dispatchPointer(el, "pointerdown", { clientX: 0, clientY: 0 });
      await wrapper.vm.$nextTick();
      expect(el.style.zIndex).toBe("");

      dispatchPointer(el, "pointermove", { clientX: 12, clientY: 0 });
      await wrapper.vm.$nextTick();
      expect(el.style.zIndex).toBe("var(--desktop-widget-drag-z)");

      dispatchPointer(el, "pointerup");
      await wrapper.vm.$nextTick();
      expect(el.style.zIndex).toBe("");
    });
  });
});
