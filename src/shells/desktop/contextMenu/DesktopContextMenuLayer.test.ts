import { mount } from "@vue/test-utils";
import { describe, expect, it, afterEach, vi } from "vitest";
import { nextTick } from "vue";

import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import DesktopContextMenuLayer from "./DesktopContextMenuLayer.vue";

function mountLayer() {
  const dispatch = vi.fn(async () => undefined);
  const kernel = {
    commands: {
      register: vi.fn(),
      unregister: vi.fn(),
      dispatch,
      list: vi.fn(() => []),
    },
  } as unknown as Kernel;

  const wrapper = mount(DesktopContextMenuLayer, {
    attachTo: document.body,
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
      },
    },
  });

  return { wrapper, dispatch };
}

function dispatchContextMenu(target: Element): void {
  const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: 12 },
    clientY: { value: 24 },
    button: { value: 2 },
  });
  target.dispatchEvent(ev);
}

async function flushReka(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe("DesktopContextMenuLayer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("opens the desktop background menu on contextmenu", async () => {
    const { wrapper } = mountLayer();

    dispatchContextMenu(wrapper.get(".desktop-context-menu-layer").element);
    await flushReka();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Open Finder",
      "New Terminal Window",
      "Change Wallpaper",
      "Add Widgets...",
      "Toggle Theme",
    ]);
  });

  it("dispatches menu actions through kernel.commands with source='menu'", async () => {
    const { wrapper, dispatch } = mountLayer();

    dispatchContextMenu(wrapper.get(".desktop-context-menu-layer").element);
    await flushReka();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    items[1]!.click();
    await flushReka();

    expect(dispatch).toHaveBeenCalledWith("app:spawnNew", {
      source: "menu",
      payload: { manifestId: "terminal" },
    });
  });
});
