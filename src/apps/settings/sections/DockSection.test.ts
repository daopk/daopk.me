import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DockSection from "./DockSection.vue";

import { useSettingsStore } from "~/core/storage/SettingsStore";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

function makeKernel() {
  const setSettingSpy = vi.fn();
  const kernel = {
    settings: {
      set: setSettingSpy,
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
});
