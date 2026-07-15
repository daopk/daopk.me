import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import MenuBarApps from "./MenuBarApps.vue";

const TestIcon = defineComponent({
  name: "TestIcon",
  template: '<span class="test-icon" />',
});

function app(id: string, name: string): AppManifest {
  return {
    id,
    name,
    icon: TestIcon,
    category: "system",
    component: async () => ({ default: TestIcon }),
  };
}

function click(element: Element): void {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: false,
    }),
  );
}

async function flushOverlay(): Promise<void> {
  await nextTick();
  await nextTick();
}

function makeKernel(apps: readonly AppManifest[]) {
  return {
    apps: {
      list: vi.fn(() => [...apps]),
    },
    events: {
      emit: vi.fn(),
      on: vi.fn(() => () => undefined),
    },
  } as unknown as Kernel;
}

function mountApps(kernel: Kernel) {
  return mount(MenuBarApps, {
    attachTo: document.body,
    global: {
      provide: { [KernelInjectionKey as symbol]: kernel },
    },
  });
}

describe("MenuBarApps", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("lists registered apps in kernel order", async () => {
    const wrapper = mountApps(makeKernel([app("finder", "Finder"), app("settings", "Settings")]));

    click(wrapper.get(".apps-trigger").element);
    await flushOverlay();

    const itemLabels = Array.from(document.body.querySelectorAll('[role="menuitem"]')).map((item) =>
      item.textContent?.trim(),
    );
    expect(itemLabels).toEqual(["Finder", "Settings"]);

    wrapper.unmount();
  });

  it("omits hidden system apps from the menu", async () => {
    const wrapper = mountApps(
      makeKernel([app("finder", "Finder"), { ...app("trash", "Trash"), hidden: true }]),
    );

    click(wrapper.get(".apps-trigger").element);
    await flushOverlay();

    const itemLabels = Array.from(document.body.querySelectorAll('[role="menuitem"]')).map((item) =>
      item.textContent?.trim(),
    );
    expect(itemLabels).toEqual(["Finder"]);

    wrapper.unmount();
  });

  it("launches the selected app with menu source", async () => {
    const kernel = makeKernel([app("finder", "Finder"), app("settings", "Settings")]);
    const wrapper = mountApps(kernel);

    click(wrapper.get(".apps-trigger").element);
    await flushOverlay();

    const settingsItem = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find(
      (item) => item.textContent?.includes("Settings"),
    );
    expect(settingsItem).not.toBeUndefined();

    click(settingsItem!);
    await flushOverlay();

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "settings",
      source: "menu",
    });

    wrapper.unmount();
  });
});
