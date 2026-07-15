import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import MenuBarBrand from "./MenuBarBrand.vue";

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

function makeKernel() {
  return {
    events: {
      emit: vi.fn(),
    },
    commands: {
      dispatch: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Kernel;
}

function mountBrand(kernel = makeKernel()) {
  const wrapper = mount(MenuBarBrand, {
    attachTo: document.body,
    global: {
      provide: { [KernelInjectionKey as symbol]: kernel },
    },
  });

  return { kernel, wrapper };
}

async function openMenu(wrapper: VueWrapper): Promise<void> {
  click(wrapper.get("button.brand").element);
  await flushOverlay();
}

function menuItem(label: string): Element {
  const item = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  expect(item).not.toBeUndefined();
  return item!;
}

describe("MenuBarBrand", () => {
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

  it("launches Settings from the WebOS menu", async () => {
    const { kernel, wrapper } = mountBrand();

    await openMenu(wrapper);
    click(menuItem("System Settings"));
    await flushOverlay();

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "settings",
      source: "menu",
    });

    wrapper.unmount();
  });

  it("opens Settings About from the WebOS menu", async () => {
    const { kernel, wrapper } = mountBrand();

    await openMenu(wrapper);
    click(menuItem("About"));
    await flushOverlay();

    expect(kernel.commands.dispatch).toHaveBeenCalledWith("settings:openSection", {
      source: "menu",
      payload: { section: "about" },
    });

    wrapper.unmount();
  });

  it("opens Spotlight from the WebOS menu", async () => {
    const { kernel, wrapper } = mountBrand();

    await openMenu(wrapper);
    click(menuItem("Spotlight"));
    await flushOverlay();

    expect(kernel.events.emit).toHaveBeenCalledWith("spotlight.open.requested", {
      source: "menu",
    });

    wrapper.unmount();
  });

  it("dispatches theme and session commands with menu source", async () => {
    const { kernel, wrapper } = mountBrand();

    await openMenu(wrapper);
    const labels = Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
      (candidate) => candidate.textContent?.trim(),
    );
    expect(labels).toEqual([
      "About",
      "System Settings",
      "Spotlight",
      "Toggle Theme",
      "Lock Desktop",
      "Sign Out",
    ]);

    click(menuItem("Toggle Theme"));
    await flushOverlay();

    expect(kernel.commands.dispatch).toHaveBeenCalledWith("theme:toggle", { source: "menu" });

    click(wrapper.get("button.brand").element);
    await flushOverlay();
    click(menuItem("Lock Desktop"));
    await flushOverlay();

    expect(kernel.commands.dispatch).toHaveBeenCalledWith("system:lock", { source: "menu" });

    click(wrapper.get("button.brand").element);
    await flushOverlay();
    click(menuItem("Sign Out"));
    await flushOverlay();

    expect(kernel.commands.dispatch).toHaveBeenCalledWith("system:signOut", { source: "menu" });

    wrapper.unmount();
  });
});
