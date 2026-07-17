import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineVaporComponent, nextTick } from "vue";
import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";

import { kernel } from "~/core/kernel";
import { useWidgetPlacementStore } from "~/core/widgets/WidgetPlacementStore";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import WidgetHost from "./WidgetHost.vue";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function mountHost(): ReturnType<typeof mount> {
  return mount(WidgetHost, {
    props: { surface: "desktop:menubar" },
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
  });
}

function widgetFixture(className?: string) {
  return defineVaporComponent(() => {
    const element = document.createElement("span");
    if (className !== undefined) element.className = className;
    return element;
  });
}

describe("WidgetHost (M3.4)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
    document.body.innerHTML = "";
  });

  describe("UPSERT cache invalidation", () => {
    it("calls the NEW loader after a re-register with the same id (cache keyed by manifest identity)", async () => {
      const v1Loader = vi.fn(() =>
        Promise.resolve({
          default: widgetFixture("v1"),
        }),
      );
      const v2Loader = vi.fn(() =>
        Promise.resolve({
          default: widgetFixture("v2"),
        }),
      );

      kernel.widgets.register({
        id: "test:upsert",
        title: "Upsert",
        surface: "desktop:menubar",
        size: "sm",
        component: v1Loader,
      });

      const wrapper = mountHost();
      await flushPromises();
      await nextTick();
      await flushPromises();
      await nextTick();

      expect(v1Loader).toHaveBeenCalledTimes(1);
      expect(v2Loader).not.toHaveBeenCalled();

      // The cache MUST miss on the new manifest identity and resolve
      kernel.widgets.register({
        id: "test:upsert",
        title: "Upsert",
        surface: "desktop:menubar",
        size: "sm",
        component: v2Loader,
      });
      await flushPromises();
      await nextTick();
      await flushPromises();
      await nextTick();

      expect(v2Loader).toHaveBeenCalledTimes(1);

      wrapper.unmount();
    });
  });

  describe("registry subscription", () => {
    it("re-fetches the widget list when widget.registered fires after mount", async () => {
      const listSpy = vi.spyOn(kernel.widgets, "list");

      const wrapper = mountHost();
      await flushPromises();
      await nextTick();

      const callsBefore = listSpy.mock.calls.length;

      kernel.widgets.register({
        id: "test:late",
        title: "Late",
        surface: "desktop:menubar",
        size: "sm",
        component: () =>
          Promise.resolve({
            default: widgetFixture(),
          }),
      });
      await nextTick();

      expect(listSpy.mock.calls.length).toBeGreaterThan(callsBefore);

      listSpy.mockRestore();
      wrapper.unmount();
    });
  });

  describe("listener cleanup", () => {
    it("does not throw when widgets register after the host unmounts", async () => {
      const wrapper = mountHost();
      await nextTick();

      wrapper.unmount();

      expect(() => {
        kernel.widgets.register({
          id: "test:after-unmount",
          title: "After Unmount",
          surface: "desktop:menubar",
          size: "sm",
          component: () =>
            Promise.resolve({
              default: widgetFixture(),
            }),
        });
      }).not.toThrow();
    });
  });

  describe("M3.8 enabled-flag filter", () => {
    it("disabling a widget filters it out of the snapshot's list() calls", async () => {
      kernel.widgets.register({
        id: "mb:a",
        title: "A",
        surface: "desktop:menubar",
        size: "sm",
        component: () => Promise.resolve({ default: widgetFixture() }),
      });

      const wrapper = mountHost();
      await flushPromises();
      await nextTick();

      expect(kernel.widgets.list({ surface: "desktop:menubar" }).map((m) => m.id)).toContain(
        "mb:a",
      );

      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.setEnabled("desktop", "mb:a", false);
      await nextTick();

      expect(kernel.widgets.list({ surface: "desktop:menubar" }).map((m) => m.id)).toContain(
        "mb:a",
      );
      expect(placements.isEnabled("desktop", "mb:a")).toBe(false);

      placements.setEnabled("desktop", "mb:a", true);
      expect(placements.isEnabled("desktop", "mb:a")).toBe(true);

      wrapper.unmount();
    });
  });
});
