import { mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, type Component } from "vue";

import DockSection from "./DockSection.vue";

import { useSettingsStore } from "~/core/storage/SettingsStore";
import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

const StubIcon = defineVaporComponent(() =>
  document.createElementNS("http://www.w3.org/2000/svg", "svg"),
);
const StubApp = defineVaporComponent(() => document.createElement("div"));

function makeApp(overrides: Partial<AppManifest> & { id: string; name: string }): AppManifest {
  return {
    icon: StubIcon as Component,
    category: "productivity",
    component: () => Promise.resolve({ default: StubApp }),
    ...overrides,
  };
}

function makeKernel(apps: readonly AppManifest[] = []) {
  const setSettingSpy = vi.fn();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const kernel = {
    settings: {
      set: setSettingSpy,
    },
    apps: {
      list: vi.fn(() => [...apps]),
    },
    events: {
      on: vi.fn((channel: string, listener: (payload: unknown) => void) => {
        const bucket = listeners.get(channel) ?? new Set<(payload: unknown) => void>();
        bucket.add(listener);
        listeners.set(channel, bucket);
        return (): void => {
          bucket.delete(listener);
        };
      }),
    },
  } as unknown as Kernel;

  return { kernel, setSettingSpy };
}

function mountSection(kernel: Kernel) {
  return mount(DockSection, {
    attachTo: document.body,
    global: {
      provide: { [KernelInjectionKey as symbol]: kernel },
    },
  });
}

describe("DockSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders the desktop Dock autohide control", () => {
    const { kernel } = makeKernel();
    const wrapper = mountSection(kernel);

    expect(wrapper.find(".dock-settings").exists()).toBe(true);
    expect(wrapper.text()).toContain("Dock");
    expect(wrapper.text()).toContain("Automatically hide the Dock");
    expect(wrapper.find('[role="switch"][aria-labelledby="dock-autohide-label"]').exists()).toBe(
      true,
    );

    wrapper.unmount();
  });

  it("writes desktop dock auto-hide preference through kernel settings", async () => {
    const { kernel, setSettingSpy } = makeKernel();
    const wrapper = mountSection(kernel);

    await wrapper.find('[role="switch"][aria-labelledby="dock-autohide-label"]').trigger("click");

    expect(setSettingSpy).toHaveBeenCalledWith("dockAutoHide", true);

    wrapper.unmount();
  });

  it("reflects the desktop dock auto-hide setting", () => {
    const { kernel } = makeKernel();
    useSettingsStore().$patch({ dockAutoHide: true });

    const wrapper = mountSection(kernel);

    expect(
      wrapper
        .find('[role="switch"][aria-labelledby="dock-autohide-label"]')
        .attributes("aria-checked"),
    ).toBe("true");

    wrapper.unmount();
  });

  it("renders visible apps with pin switches", () => {
    const { kernel } = makeKernel([
      makeApp({ id: "notes", name: "Notes" }),
      makeApp({ id: "calendar", name: "Calendar" }),
      makeApp({ id: "trash", name: "Trash", hidden: true }),
      makeApp({ id: "_template", name: "Template" }),
    ]);
    useSettingsStore().$patch({ dockPinnedAppIds: ["notes"] });

    const wrapper = mountSection(kernel);

    const rows = wrapper.findAll(".dock-settings__app-item");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain("Calendar");
    expect(rows[1]?.text()).toContain("Notes");
    expect(wrapper.text()).not.toContain("Trash");
    expect(wrapper.text()).not.toContain("Template");
    expect(
      rows[0]
        ?.find('[role="switch"][aria-labelledby="dock-pin-calendar-label"]')
        .attributes("aria-checked"),
    ).toBe("false");
    expect(
      rows[1]
        ?.find('[role="switch"][aria-labelledby="dock-pin-notes-label"]')
        .attributes("aria-checked"),
    ).toBe("true");

    wrapper.unmount();
  });

  it("writes dock pinned apps through kernel settings", async () => {
    const { kernel, setSettingSpy } = makeKernel([makeApp({ id: "calendar", name: "Calendar" })]);
    useSettingsStore().$patch({ dockPinnedAppIds: [] });

    const wrapper = mountSection(kernel);

    await wrapper
      .find('[role="switch"][aria-labelledby="dock-pin-calendar-label"]')
      .trigger("click");

    expect(setSettingSpy).toHaveBeenCalledWith("dockPinnedAppIds", ["calendar"]);

    wrapper.unmount();
  });
});
