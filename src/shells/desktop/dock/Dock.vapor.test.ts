import { mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { defineVaporComponent, nextTick, ref, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Dock from "./Dock.vue";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";
import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";
import type { SettingsState } from "~/types/settings";
import { SPOTLIGHT_DOCK_ITEM_KEY } from "./types";

import {
  __resetWindowManagerForTests,
  useWindowManager,
} from "~/shells/desktop/windowManager/useWindowManager";

const StubIcon = defineVaporComponent(() => document.createElement("svg"));
const StubApp = defineVaporComponent(() => document.createElement("span"));

function makeManifest(id: string, overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id,
    name: id.toUpperCase(),
    icon: StubIcon,
    category: "system",
    component: (): Promise<{ default: Component }> => Promise.resolve({ default: StubApp }),
    ...overrides,
  };
}

interface MountedDock {
  firstButton: () => HTMLButtonElement | null;
  buttons: () => HTMLButtonElement[];
  dockElement: () => HTMLElement;
  revealZone: () => HTMLElement;
  emitSpy: ReturnType<typeof vi.fn>;
  dispatchSpy: ReturnType<typeof vi.fn>;
  setSettingSpy: ReturnType<typeof vi.fn>;
  unmount: () => void;
}

function mountDock(
  manifests: AppManifest[],
  options: { dockAutoHide?: boolean; dockPinnedAppIds?: string[] } = {},
): MountedDock {
  const emitSpy = vi.fn();
  const dispatchSpy = vi.fn(async () => undefined);
  const dockAutoHideRef = ref(options.dockAutoHide ?? false);
  const dockPinnedAppIdsRef = ref(
    options.dockPinnedAppIds ?? manifests.map((manifest) => manifest.id),
  );
  const setSettingSpy = vi.fn(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    if (key === "dockAutoHide" && typeof value === "boolean") {
      dockAutoHideRef.value = value;
    }

    if (key === "dockPinnedAppIds") {
      dockPinnedAppIdsRef.value = [...(value as SettingsState["dockPinnedAppIds"])];
    }
  });

  const mockKernel = {
    apps: {
      list: (): AppManifest[] => manifests,
      register: (): void => {},
      launch: (): Promise<never> => Promise.reject(new Error("unimplemented")),
      unregister: (): void => {},
    },
    events: {
      emit: emitSpy,
      on: vi.fn(() => () => undefined),
      once: (): (() => void) => (): void => {},
      off: (): void => {},
    },
    commands: {
      register: vi.fn(),
      unregister: vi.fn(),
      dispatch: dispatchSpy,
      list: vi.fn(() => []),
    },
    settings: {
      use: vi.fn((key: string) => {
        if (key === "dockAutoHide") {
          return dockAutoHideRef;
        }
        if (key === "dockPinnedAppIds") {
          return dockPinnedAppIdsRef;
        }
        return ref(undefined);
      }),
      get: vi.fn((key: string) => {
        if (key === "dockAutoHide") {
          return dockAutoHideRef.value;
        }
        if (key === "dockPinnedAppIds") {
          return dockPinnedAppIdsRef.value;
        }
        return undefined;
      }),
      set: setSettingSpy,
      reset: vi.fn(),
    },
  } as unknown as Pick<Kernel, "apps" | "commands" | "events" | "settings">;

  const wrapper = mount(Dock, {
    attachTo: document.body,
    global: {
      provide: {
        [KernelInjectionKey as symbol]: mockKernel as Kernel,
      },
    },
  });

  return {
    firstButton: () => (wrapper.element as Element).querySelector<HTMLButtonElement>(".dock-item"),
    buttons: () =>
      Array.from((wrapper.element as Element).querySelectorAll<HTMLButtonElement>(".dock-item")),
    dockElement: () => wrapper.get(".dock").element as HTMLElement,
    revealZone: () => wrapper.get(".dock-reveal-zone").element as HTMLElement,
    emitSpy,
    dispatchSpy,
    setSettingSpy,
    unmount: () => {
      wrapper.unmount();
    },
  };
}

function buttonByLabel(dock: MountedDock, label: string): HTMLButtonElement {
  const button = dock.buttons().find((candidate) => candidate.getAttribute("aria-label") === label);

  if (!button) {
    throw new Error(`Missing dock button: ${label}`);
  }

  return button;
}

function dispatchContextMenu(target: Element): void {
  const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: 10 },
    clientY: { value: 20 },
    button: { value: 2 },
  });
  target.dispatchEvent(ev);
}

function pointerEvent(
  type: string,
  init: { button?: number; clientX?: number; clientY?: number; pointerId?: number } = {},
): PointerEvent {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(ev, {
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    button: { value: init.button ?? 0 },
    pointerId: { value: init.pointerId ?? 1 },
  });
  return ev;
}

async function flushOverlay(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe("Dock", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    serviceWorkerUpdateController.resetForTests();
    __resetWindowManagerForTests();
  });

  afterEach(() => {
    serviceWorkerUpdateController.resetForTests();
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows Spotlight when the app manifest list is empty", () => {
    const dock = mountDock([]);

    const first = dock.firstButton();
    expect(first).not.toBeNull();
    expect(first?.getAttribute("aria-label")).toBe("Open Spotlight");
    expect(dock.buttons().map((button) => button.getAttribute("aria-label"))).toEqual([
      "Open Spotlight",
      "Open Trash",
    ]);

    dock.unmount();
  });

  it("keeps fixed dock mode as the default", () => {
    const dock = mountDock([]);
    const zone = dock.revealZone();

    expect(zone.tagName).toBe("NAV");
    expect(zone.getAttribute("aria-label")).toBe("Application dock");
    expect(zone.dataset.autoHide).toBeUndefined();
    expect(zone.dataset.revealed).toBeUndefined();
    expect(zone.classList.contains("dock-reveal-zone--auto-hide")).toBe(false);
    expect(zone.classList.contains("dock-reveal-zone--revealed")).toBe(false);

    dock.unmount();
  });

  it("starts hidden when desktop dock auto-hide is enabled", () => {
    const dock = mountDock([], { dockAutoHide: true });
    const zone = dock.revealZone();

    expect(zone.dataset.autoHide).toBe("true");
    expect(zone.dataset.revealed).toBeUndefined();
    expect(zone.classList.contains("dock-reveal-zone--auto-hide")).toBe(true);
    expect(zone.classList.contains("dock-reveal-zone--revealed")).toBe(false);

    dock.unmount();
  });

  it("reveals from the bottom edge and hides after pointer leave", async () => {
    const dock = mountDock([], { dockAutoHide: true });
    const zone = dock.revealZone();

    zone.dispatchEvent(new Event("pointerenter"));
    await nextTick();

    expect(zone.dataset.revealed).toBe("true");

    zone.dispatchEvent(new Event("pointerleave"));
    await nextTick();

    expect(zone.dataset.revealed).toBeUndefined();

    dock.unmount();
  });

  it("reveals on pointer down in the bottom edge hit zone", async () => {
    const dock = mountDock([], { dockAutoHide: true });
    const zone = dock.revealZone();

    zone.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();

    expect(zone.dataset.revealed).toBe("true");

    dock.unmount();
  });

  it("reveals while keyboard focus is inside the dock", async () => {
    const dock = mountDock([], { dockAutoHide: true });
    const zone = dock.revealZone();

    zone.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await nextTick();

    expect(zone.dataset.revealed).toBe("true");

    zone.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await nextTick();

    expect(zone.dataset.revealed).toBeUndefined();

    dock.unmount();
  });

  it("clicking the Spotlight dock item emits the shell Spotlight event", () => {
    const dock = mountDock([]);

    dock.firstButton()?.click();

    expect(dock.emitSpy).toHaveBeenCalledWith("spotlight.open.requested", {
      source: "dock",
    });
    expect(dock.emitSpy).not.toHaveBeenCalledWith("app.launch.requested", {
      manifestId: SPOTLIGHT_DOCK_ITEM_KEY,
      source: "dock",
    });

    dock.unmount();
  });

  it("renders Settings attention separately from the running indicator", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    wm.open({ manifestId: "settings", handleId: "settings-1", title: "Settings" });
    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));

    const dock = mountDock([makeManifest("settings")]);
    const button = buttonByLabel(dock, "Activate SETTINGS, attention needed");

    expect(button.querySelector(".dock-item__attention")).not.toBeNull();
    expect(button.querySelector(".dock-item__indicator")).not.toBeNull();

    dock.unmount();
  });

  it("updates the Settings attention dot after the dock is mounted", async () => {
    const dock = mountDock([makeManifest("settings")]);
    const button = buttonByLabel(dock, "Launch SETTINGS");

    expect(button.querySelector(".dock-item__attention")).toBeNull();

    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    await nextTick();

    expect(button.querySelector(".dock-item__attention")).not.toBeNull();

    serviceWorkerUpdateController.dismiss();
    await nextTick();

    expect(button.querySelector(".dock-item__attention")).toBeNull();

    dock.unmount();
  });

  it("right-clicking an app item opens command-backed app actions", async () => {
    const dock = mountDock([makeManifest("one")]);
    const button = buttonByLabel(dock, "Launch ONE");

    dispatchContextMenu(button);
    await flushOverlay();

    expect(button.dataset.contextMenuOpen).toBe("true");
    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Open ONE",
      "Open New Window",
      "Remove from Dock",
    ]);

    (items[1] as HTMLElement).click();
    await flushOverlay();

    expect(dock.dispatchSpy).toHaveBeenCalledWith("app:spawnNew", {
      source: "menu",
      payload: { manifestId: "one" },
    });

    dock.unmount();
  });

  it("removes pinned app items from the dock context menu", async () => {
    const dock = mountDock([makeManifest("one")]);
    const button = buttonByLabel(dock, "Launch ONE");

    dispatchContextMenu(button);
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toContain("Remove from Dock");

    (items[2] as HTMLElement).click();
    await flushOverlay();

    expect(dock.setSettingSpy).toHaveBeenCalledWith("dockPinnedAppIds", []);
    expect(dock.firstButton()?.getAttribute("aria-label")).toBe("Open Spotlight");

    dock.unmount();
  });

  it("moves pinned app items from the dock context menu", async () => {
    const dock = mountDock([makeManifest("one"), makeManifest("two")]);
    const button = buttonByLabel(dock, "Launch ONE");

    dispatchContextMenu(button);
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Open ONE",
      "Open New Window",
      "Remove from Dock",
      "Move Left",
      "Move Right",
    ]);

    (items[4] as HTMLElement).click();
    await flushOverlay();

    expect(dock.setSettingSpy).toHaveBeenCalledWith("dockPinnedAppIds", ["two", "one"]);

    dock.unmount();
  });

  it("reorders pinned app items with a pointer drag", async () => {
    const dock = mountDock([makeManifest("one"), makeManifest("two")]);
    const one = buttonByLabel(dock, "Launch ONE");
    const two = buttonByLabel(dock, "Launch TWO");
    vi.spyOn(two, "getBoundingClientRect").mockReturnValue({
      bottom: 64,
      height: 64,
      left: 0,
      right: 64,
      top: 0,
      width: 64,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    one.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 32, pointerId: 7 }));
    window.dispatchEvent(pointerEvent("pointermove", { clientX: 48, clientY: 32, pointerId: 7 }));
    await nextTick();

    expect(one.dataset.dragging).toBe("true");
    expect(one.style.getPropertyValue("--dock-drag-x")).toBe("48px");
    expect(one.style.getPropertyValue("--dock-drag-y")).toBe("0px");
    expect(two.dataset.dragOver).toBe("after");

    window.dispatchEvent(pointerEvent("pointerup", { clientX: 48, clientY: 32, pointerId: 7 }));
    one.click();
    await nextTick();

    expect(dock.setSettingSpy).toHaveBeenCalledWith("dockPinnedAppIds", ["two", "one"]);
    expect(dock.emitSpy).not.toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "one",
      source: "dock",
    });
    expect(dock.buttons().map((button) => button.getAttribute("aria-label"))).toEqual([
      "Open Spotlight",
      "Launch TWO",
      "Launch ONE",
      "Open Trash",
    ]);

    dock.unmount();
  });

  it("removes pinned app items when dropped outside the dock", async () => {
    vi.useFakeTimers();
    const dock = mountDock([makeManifest("one")]);
    const button = buttonByLabel(dock, "Launch ONE");
    vi.spyOn(dock.dockElement(), "getBoundingClientRect").mockReturnValue({
      bottom: 64,
      height: 64,
      left: 0,
      right: 128,
      top: 0,
      width: 128,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    button.dispatchEvent(pointerEvent("pointerdown", { clientX: 96, clientY: 32, pointerId: 8 }));
    window.dispatchEvent(pointerEvent("pointermove", { clientX: 96, clientY: -48, pointerId: 8 }));
    await nextTick();

    expect(button.dataset.dragging).toBe("true");
    expect(button.dataset.dragRemoving).toBe("true");
    expect(button.dataset.dragRemoveTooltipVisible).toBeUndefined();
    expect(button.dataset.tooltip).toBe("ONE");
    vi.advanceTimersByTime(999);
    await nextTick();
    expect(button.dataset.tooltip).toBe("ONE");

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(button.dataset.dragRemoveTooltipVisible).toBe("true");
    expect(button.dataset.tooltip).toBe("Remove");
    expect(button.style.getPropertyValue("--dock-drag-y")).toBe("-80px");

    window.dispatchEvent(pointerEvent("pointerup", { clientX: 96, clientY: -48, pointerId: 8 }));
    button.click();
    await nextTick();

    expect(dock.setSettingSpy).toHaveBeenCalledWith("dockPinnedAppIds", []);
    expect(dock.emitSpy).not.toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "one",
      source: "dock",
    });
    expect(dock.buttons().map((candidate) => candidate.getAttribute("aria-label"))).toEqual([
      "Open Spotlight",
      "Open Trash",
    ]);

    dock.unmount();
  });

  it("keeps running unpinned app items in the dock context menu", async () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    wm.open({ manifestId: "two", handleId: "two-1", title: "Two" });

    const dock = mountDock([makeManifest("one"), makeManifest("two")], {
      dockPinnedAppIds: ["one"],
    });
    const button = dock
      .buttons()
      .find((candidate) => candidate.getAttribute("aria-label") === "Activate TWO");
    expect(button).not.toBeUndefined();

    dispatchContextMenu(button!);
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Activate TWO",
      "Open New Window",
      "Keep in Dock",
    ]);

    (items[2] as HTMLElement).click();
    await flushOverlay();

    expect(dock.setSettingSpy).toHaveBeenCalledWith("dockPinnedAppIds", ["one", "two"]);

    dock.unmount();
  });

  it("keeps auto-hidden dock revealed while a dock context menu is open", async () => {
    const dock = mountDock([makeManifest("one")], { dockAutoHide: true });
    const button = dock.firstButton();
    const zone = dock.revealZone();
    expect(button).not.toBeNull();

    dispatchContextMenu(button!);
    await flushOverlay();

    expect(zone.dataset.revealed).toBe("true");

    zone.dispatchEvent(new Event("pointerleave"));
    await nextTick();

    expect(zone.dataset.revealed).toBe("true");

    dock.unmount();
  });

  it("omits Open New Window for singleton app dock items", async () => {
    const dock = mountDock([makeManifest("settings", { singleton: true })]);
    const button = buttonByLabel(dock, "Launch SETTINGS");

    dispatchContextMenu(button);
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Open SETTINGS",
      "Remove from Dock",
    ]);

    dock.unmount();
  });

  it("right-clicking Spotlight opens Spotlight command actions", async () => {
    const dock = mountDock([]);
    const button = dock.firstButton();
    expect(button).not.toBeNull();

    dispatchContextMenu(button!);
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual(["Open Spotlight"]);

    (items[0] as HTMLElement).click();
    await flushOverlay();

    expect(dock.dispatchSpy).toHaveBeenCalledWith("spotlight:open", {
      source: "menu",
    });

    dock.unmount();
  });

  it("clicking the Trash dock item opens the hidden Trash app", () => {
    const dock = mountDock([]);
    const trash = buttonByLabel(dock, "Open Trash");

    trash.click();

    expect(dock.emitSpy).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "trash",
      source: "dock",
    });

    dock.unmount();
  });

  it("right-clicking Trash opens the Trash app action", async () => {
    const dock = mountDock([]);
    const trash = buttonByLabel(dock, "Open Trash");

    dispatchContextMenu(trash);
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual(["Open Trash"]);

    (items[0] as HTMLElement).click();
    await flushOverlay();

    expect(dock.emitSpy).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "trash",
      source: "menu",
    });

    dock.unmount();
  });
});
