import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it, afterEach, vi } from "vitest";
import { nextTick } from "vue";

import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import type { DesktopContextMenuItemManifest } from "~/types/desktop";

import DesktopContextMenuLayer from "./DesktopContextMenuLayer.vue";

function mountLayer(contributions: readonly DesktopContextMenuItemManifest[] = []) {
  const dispatch = vi.fn(async () => undefined);
  const spawn = vi.fn(() => ({
    id: "contribution-handle",
    manifestId: "notes",
    on: vi.fn(),
    postMessage: vi.fn(),
  }));
  const kill = vi.fn();
  const kernel = {
    commands: {
      register: vi.fn(),
      unregister: vi.fn(),
      dispatch,
      list: vi.fn(() => []),
    },
    desktop: {
      contextMenu: {
        list: vi.fn(() => contributions),
        register: vi.fn(),
        unregister: vi.fn(),
        get: vi.fn(),
      },
      renderers: {
        list: vi.fn(() => []),
        register: vi.fn(),
        unregister: vi.fn(),
        get: vi.fn(),
      },
    },
    events: {
      on: vi.fn(() => () => undefined),
      emit: vi.fn(),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
    processes: {
      spawn,
      kill,
      suspend: vi.fn(),
      resume: vi.fn(),
      list: vi.fn(),
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

  return { wrapper, dispatch, spawn, kill };
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

async function flushOverlay(): Promise<void> {
  await nextTick();
  await nextTick();
  await flushPromises();
}

describe("DesktopContextMenuLayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the desktop background menu on contextmenu", async () => {
    const { wrapper } = mountLayer();

    dispatchContextMenu(wrapper.get(".desktop-context-menu-layer").element);
    await flushOverlay();

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
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    items[1]!.click();
    await flushOverlay();

    expect(dispatch).toHaveBeenCalledWith("app:spawnNew", {
      source: "menu",
      payload: { manifestId: "terminal" },
    });
  });

  it("runs app-contributed desktop menu actions with a transient app process", async () => {
    const run = vi.fn(async () => undefined);
    const action = vi.fn(async () => run);
    const { wrapper, spawn, kill } = mountLayer([
      {
        id: "notes:new-desktop-note",
        label: "New Note",
        manifestId: "notes",
        surface: "desktop:background",
        group: "create",
        order: 0,
        action,
      },
    ]);

    dispatchContextMenu(wrapper.get(".desktop-context-menu-layer").element);
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Open Finder",
      "New Terminal Window",
      "New Note",
      "Change Wallpaper",
      "Add Widgets...",
      "Toggle Theme",
    ]);

    items[2]!.click();
    await flushOverlay();

    expect(spawn).toHaveBeenCalledWith("notes", {
      contributionId: "notes:new-desktop-note",
      surface: "desktop:background",
      position: { x: 12, y: 24, clientX: 12, clientY: 24 },
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestId: "notes",
        position: { x: 12, y: 24, clientX: 12, clientY: 24 },
      }),
    );
    expect(kill).toHaveBeenCalledWith("contribution-handle", "shell");
  });
});
