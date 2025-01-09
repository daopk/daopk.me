import { mount } from "@vue/test-utils";
import { describe, expect, it, afterEach, vi } from "vitest";
import { nextTick } from "vue";

import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import Window from "./Window.vue";
import type { WindowRecord } from "./useWindowManager";

function makeRecord(overrides: Partial<WindowRecord> = {}): WindowRecord {
  return {
    id: "window-1",
    manifestId: "notes",
    handleId: "handle-1",
    title: "Notes",
    x: 20,
    y: 30,
    width: 400,
    height: 300,
    z: 101,
    focused: true,
    singleton: false,
    maximized: false,
    minimized: false,
    ...overrides,
  };
}

function mountWindow(record: WindowRecord = makeRecord()) {
  const dispatch = vi.fn(async () => undefined);
  const kernel = {
    commands: {
      register: vi.fn(),
      unregister: vi.fn(),
      dispatch,
      list: vi.fn(() => []),
    },
  } as unknown as Kernel;

  const wrapper = mount(Window, {
    attachTo: document.body,
    props: {
      record,
      stageBounds: { width: 1200, height: 800 },
    },
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
      },
      stubs: {
        AppMount: { template: "<div data-app-mount-stub />" },
      },
    },
  });

  return { wrapper, dispatch };
}

function dispatchContextMenu(target: Element): void {
  const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: 16 },
    clientY: { value: 16 },
    button: { value: 2 },
  });
  target.dispatchEvent(ev);
}

async function flushReka(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe("Window context menu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("opens command-backed titlebar actions", async () => {
    const { wrapper, dispatch } = mountWindow();

    dispatchContextMenu(wrapper.get(".window__titlebar").element);
    await flushReka();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Minimize",
      "Maximize",
      "Close",
    ]);

    items[0]!.click();
    await flushReka();

    expect(dispatch).toHaveBeenCalledWith("desktop:window.minimize", {
      source: "menu",
      payload: { windowId: "window-1" },
    });
  });

  it("labels the maximize action as Restore for maximized windows", async () => {
    const { wrapper } = mountWindow(makeRecord({ maximized: true }));

    dispatchContextMenu(wrapper.get(".window__titlebar").element);
    await flushReka();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual(["Minimize", "Restore", "Close"]);
  });
});
