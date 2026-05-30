import { mount } from "@vue/test-utils";
import { describe, expect, it, afterEach, vi } from "vitest";
import { defineComponent, nextTick, type Component } from "vue";

import type { AppManifest } from "~/types/app";
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

const StubIcon = defineComponent({ template: "<svg />" });

function manifest(overrides: Partial<AppManifest> & { id: string }): AppManifest {
  return {
    name: overrides.id,
    icon: StubIcon as Component,
    category: "productivity",
    component: () => Promise.resolve({ default: defineComponent({ template: "<div />" }) }),
    ...overrides,
  };
}

function mountWindow(record: WindowRecord = makeRecord(), manifests: readonly AppManifest[] = []) {
  const dispatch = vi.fn(async () => undefined);
  const kernel = {
    apps: {
      list: vi.fn(() => [...manifests]),
      register: vi.fn(),
      launch: vi.fn(),
      unregister: vi.fn(),
    },
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

  it("renders the app icon before the window title", () => {
    const { wrapper } = mountWindow(makeRecord(), [manifest({ id: "notes", name: "Notes" })]);

    const titlebar = wrapper.get(".window__titlebar");
    const icon = titlebar.get(".window__title-icon");
    const title = titlebar.get(".window__title");

    expect(icon.element.compareDocumentPosition(title.element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
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

  it("shows Settings for apps with settings and dispatches the settings command", async () => {
    const { wrapper, dispatch } = mountWindow(makeRecord(), [
      manifest({ id: "notes", name: "Notes", settings: {} }),
    ]);

    dispatchContextMenu(wrapper.get(".window__titlebar").element);
    await flushReka();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Minimize",
      "Maximize",
      "Settings",
      "Close",
    ]);

    items[2]!.click();
    await flushReka();

    expect(dispatch).toHaveBeenCalledWith("desktop:window.openSettings", {
      source: "menu",
      payload: { windowId: "window-1" },
    });
  });
});
