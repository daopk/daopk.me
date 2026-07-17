import { mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick } from "vue";

import { kernel } from "~/core/kernel";
import { useWidgetPlacementStore } from "~/core/widgets/WidgetPlacementStore";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import MobileWidgetsPage from "./MobileWidgetsPage.vue";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function stubComponent(tag: "div" | "svg" = "div", className?: string) {
  return defineVaporComponent(() => {
    const element = document.createElement(tag);
    if (className !== undefined) element.setAttribute("class", className);
    return element;
  });
}

function mountPage(): ReturnType<typeof mount> {
  return mount(MobileWidgetsPage, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
  });
}

function registerStub(id: string, size: "sm" | "md" | "lg"): () => void {
  return kernel.widgets.register({
    id,
    title: id,
    surface: "mobile:widgets",
    size,
    component: () => Promise.resolve({ default: stubComponent("div", id) }),
  });
}

describe("MobileWidgetsPage (M1.4 commit B)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
    document.body.innerHTML = "";
  });

  it("renders the empty state when no mobile:widgets manifests exist", () => {
    const wrapper = mountPage();
    expect(wrapper.find(".mobile-widgets-page__empty").exists()).toBe(true);
    expect(wrapper.find(".mobile-widgets-page__grid").exists()).toBe(false);
    wrapper.unmount();
  });

  it("renders one .widget-slot per registered manifest in registry order", () => {
    registerStub("w:alpha", "sm");
    registerStub("w:beta", "md");

    const wrapper = mountPage();

    const slots = wrapper.findAll(".widget-slot");
    expect(slots.length).toBe(2);
    expect(slots[0].attributes("data-widget-id")).toBe("w:alpha");
    expect(slots[1].attributes("data-widget-id")).toBe("w:beta");

    wrapper.unmount();
  });

  it("maps size → grid-span class (sm | md | lg)", () => {
    registerStub("w:sm", "sm");
    registerStub("w:md", "md");
    registerStub("w:lg", "lg");

    const wrapper = mountPage();

    const slot = (id: string) => wrapper.find(`[data-widget-id="${id}"]`);
    expect(slot("w:sm").classes()).toContain("widget-slot--sm");
    expect(slot("w:md").classes()).toContain("widget-slot--md");
    expect(slot("w:lg").classes()).toContain("widget-slot--lg");

    wrapper.unmount();
  });

  it("re-renders the grid when a widget is registered after mount", async () => {
    const wrapper = mountPage();
    expect(wrapper.find(".mobile-widgets-page__empty").exists()).toBe(true);

    registerStub("w:late", "sm");
    await nextTick();

    expect(wrapper.find(".mobile-widgets-page__empty").exists()).toBe(false);
    expect(wrapper.findAll(".widget-slot").length).toBe(1);
    expect(wrapper.find('[data-widget-id="w:late"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it("re-renders the grid when a widget is unregistered after mount", async () => {
    const dispose = registerStub("w:transient", "md");
    const wrapper = mountPage();
    expect(wrapper.findAll(".widget-slot").length).toBe(1);

    dispose();
    await nextTick();

    expect(wrapper.find(".widget-slot").exists()).toBe(false);
    expect(wrapper.find(".mobile-widgets-page__empty").exists()).toBe(true);

    wrapper.unmount();
  });

  it("does NOT render widgets from other surfaces (filter correctness)", () => {
    kernel.widgets.register({
      id: "w:not-mobile",
      title: "Not Mobile",
      surface: "desktop:wallpaper",
      size: "sm",
      component: () => Promise.resolve({ default: stubComponent() }),
    });
    registerStub("w:any", "sm");
    kernel.widgets.register({
      id: "w:wildcard",
      title: "Wildcard",
      surface: "any",
      size: "sm",
      component: () => Promise.resolve({ default: stubComponent() }),
    });

    const wrapper = mountPage();

    const ids = wrapper.findAll(".widget-slot").map((el) => el.attributes("data-widget-id"));
    expect(ids).toEqual(["w:any", "w:wildcard"]);

    wrapper.unmount();
  });

  it("does not throw when widgets register after the page unmounts", () => {
    const wrapper = mountPage();
    wrapper.unmount();

    expect(() => registerStub("w:after-unmount", "sm")).not.toThrow();
  });

  describe("M3.8 enabled-flag filter", () => {
    it("disabling the only widget renders the empty state", async () => {
      registerStub("w:solo", "lg");
      const wrapper = mountPage();
      expect(wrapper.find(".widget-slot").exists()).toBe(true);

      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.setEnabled("mobile", "w:solo", false);
      await nextTick();

      expect(wrapper.find(".widget-slot").exists()).toBe(false);
      expect(wrapper.find(".mobile-widgets-page__empty").exists()).toBe(true);

      placements.setEnabled("mobile", "w:solo", true);
      await nextTick();
      expect(wrapper.find(".widget-slot").exists()).toBe(true);
      expect(wrapper.find(".mobile-widgets-page__empty").exists()).toBe(false);

      wrapper.unmount();
    });

    it("partial disable keeps the grid; only the disabled slot vanishes", async () => {
      registerStub("w:keep", "sm");
      registerStub("w:hide", "md");

      const wrapper = mountPage();
      expect(wrapper.findAll(".widget-slot").length).toBe(2);

      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.setEnabled("mobile", "w:hide", false);
      await nextTick();

      const visibleIds = wrapper.findAll(".widget-slot").map((s) => s.attributes("data-widget-id"));
      expect(visibleIds).toEqual(["w:keep"]);

      wrapper.unmount();
    });

    it("keeps app-owned widgets hidden until the user adds them", async () => {
      kernel.apps.register({
        id: "calendar-test",
        name: "Calendar Test",
        icon: stubComponent("svg"),
        category: "productivity",
        component: () => Promise.resolve({ default: stubComponent() }),
        widgets: [
          {
            id: "calendar-test:lunar",
            title: "Lunar Date",
            surface: "mobile:widgets",
            size: "md",
            component: () =>
              Promise.resolve({
                default: stubComponent("div", "lunar"),
              }),
          },
        ],
      });

      const wrapper = mountPage();
      expect(wrapper.find(".mobile-widgets-page__empty").exists()).toBe(true);
      expect(wrapper.find(".widget-slot").exists()).toBe(false);

      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.setEnabled("mobile", "calendar-test:lunar", true, false);
      await nextTick();

      expect(wrapper.find(".mobile-widgets-page__empty").exists()).toBe(false);
      expect(wrapper.find('[data-widget-id="calendar-test:lunar"]').exists()).toBe(true);

      wrapper.unmount();
    });
  });
});
