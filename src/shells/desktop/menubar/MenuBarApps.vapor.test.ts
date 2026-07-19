import { mountVaporTest as mount } from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick } from "vue";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import MenuBarApps from "./MenuBarApps.vue";

const TestIcon = defineVaporComponent(
  () => {
    const element = document.createElement("span");
    element.className = "test-icon";
    return element;
  },
  { name: "TestIcon" },
);

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

function key(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
}

async function flushOverlay(): Promise<void> {
  await nextTick();
  await nextTick();
}

function activeMenuItem(menu: HTMLElement): HTMLElement | null {
  const activeId = menu.getAttribute("aria-activedescendant");
  return activeId ? document.getElementById(activeId) : null;
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

  it("renders the icon through the Button left slot", () => {
    const wrapper = mountApps(makeKernel([]));
    const trigger = wrapper.get(".apps-trigger");

    expect(trigger.find(".rp-button__left .apps-trigger__icon").exists()).toBe(true);
    expect(trigger.get(".rp-button__label").text()).toBe("Apps");
    expect(trigger.find(".rp-button__label .apps-trigger__icon").exists()).toBe(false);

    wrapper.unmount();
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
    const trigger = wrapper.get<HTMLButtonElement>(".apps-trigger").element;

    click(trigger);
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
    expect(document.activeElement).not.toBe(trigger);

    wrapper.unmount();
  });

  it("moves through apps with ArrowDown and ArrowUp after a pointer open", async () => {
    const wrapper = mountApps(
      makeKernel([
        app("finder", "Finder"),
        app("terminal", "Terminal"),
        app("settings", "Settings"),
      ]),
    );

    click(wrapper.get(".apps-trigger").element);
    await flushOverlay();

    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    expect(document.activeElement).toBe(menu);
    expect(activeMenuItem(menu)?.textContent?.trim()).toBe("Finder");

    key(menu, "ArrowDown");
    await nextTick();
    expect(activeMenuItem(menu)?.textContent?.trim()).toBe("Terminal");

    key(menu, "ArrowUp");
    await nextTick();
    expect(activeMenuItem(menu)?.textContent?.trim()).toBe("Finder");

    wrapper.unmount();
  });
});
