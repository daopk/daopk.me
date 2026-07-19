import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createComponent,
  defineVaporComponent,
  inject,
  insert,
  nextTick,
  onMounted,
  ref,
  type Component,
} from "vue";
import { Modal } from "ropav/modal";

import { APP_OVERLAY_PORTAL_ID } from "~/components/ui/portalTarget";
import { AppChromeInjectionKey, type AppChromeController, type AppManifest } from "~/types/app";
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
    minWidth: 240,
    minHeight: 160,
    z: 101,
    focused: true,
    singleton: false,
    maximized: false,
    minimized: false,
    argsRevision: 0,
    ...overrides,
  };
}

const StubIcon = defineVaporComponent(() =>
  document.createElementNS("http://www.w3.org/2000/svg", "svg"),
);
const StubApp = defineVaporComponent(() => document.createElement("div"));
const FocusableApp = defineVaporComponent(() => {
  const root = document.createElement("div");
  const first = document.createElement("button");
  const last = document.createElement("button");
  const hidden = document.createElement("button");

  first.dataset.appFocusFirst = "";
  first.textContent = "First app action";
  last.dataset.appFocusLast = "";
  last.textContent = "Last app action";
  hidden.dataset.appFocusHidden = "";
  hidden.hidden = true;
  hidden.textContent = "Hidden app action";
  root.append(first, last, hidden);

  return root;
});
const ModalApp = defineVaporComponent(() => {
  const open = ref(true);
  const root = document.createElement("div");
  const first = document.createElement("button");
  const last = document.createElement("button");

  first.dataset.appFocusFirst = "";
  first.textContent = "First app action";
  last.dataset.appFocusLast = "";
  last.textContent = "Last app action";
  root.append(first, last);
  insert(
    createComponent(
      Modal,
      {
        open: () => open.value,
        title: "Window-owned dialog",
        focusTrapOptions: { tabbableOptions: { displayCheck: "none" } },
      },
      {
        default: () => {
          const close = document.createElement("button");
          close.dataset.closeWindowModal = "";
          close.textContent = "Close dialog";
          close.addEventListener("click", () => (open.value = false));
          return close;
        },
      },
    ),
    root,
  );

  return root;
});

function ensureAppOverlayPortal(): HTMLElement {
  const existing = document.getElementById(APP_OVERLAY_PORTAL_ID);

  if (existing !== null) {
    return existing;
  }

  const portal = document.createElement("div");
  portal.id = APP_OVERLAY_PORTAL_ID;
  portal.dataset.windowTestOverlayPortal = "";
  document.body.appendChild(portal);

  return portal;
}

function asEsm(component: Component): { default: Component } {
  return Object.assign(Object.create(null) as { default: Component }, {
    default: component,
    __esModule: true,
  });
}

function manifest(overrides: Partial<AppManifest> & { id: string }): AppManifest {
  return {
    name: overrides.id,
    icon: StubIcon,
    category: "productivity",
    component: () => Promise.resolve(asEsm(StubApp)),
    ...overrides,
  };
}

function mountWindow(
  record: WindowRecord = makeRecord(),
  manifests: readonly AppManifest[] = [manifest({ id: "notes", name: "Notes" })],
) {
  ensureAppOverlayPortal();

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
    lifecycleCoordinator: {
      register: vi.fn(),
      unregister: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(() => () => undefined),
    },
    events: {
      emit: vi.fn(),
      on: vi.fn(() => () => undefined),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
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

async function flushOverlay(): Promise<void> {
  await nextTick();
  await nextTick();
}

function pressTab(target: Element, shiftKey = false): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey,
    }),
  );
}

describe("Window", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
      function (this: HTMLElement) {
        if (this.hidden || this.closest("[hidden]") !== null) {
          return [] as unknown as DOMRectList;
        }

        return [new DOMRect(0, 0, 1, 1)] as unknown as DOMRectList;
      },
    );
  });

  afterEach(() => {
    document.querySelectorAll("[data-window-focus-outside]").forEach((node) => node.remove());
    vi.restoreAllMocks();
  });

  afterAll(() => {
    document.querySelector("[data-window-test-overlay-portal]")?.remove();
  });

  it("renders the app icon before the window title", () => {
    const { wrapper } = mountWindow(makeRecord(), [manifest({ id: "notes", name: "Notes" })]);

    const titlebar = wrapper.get(".window__titlebar");
    const icon = titlebar.get(".window__title-icon");
    const title = titlebar.get(".window__title");

    expect(icon.element.compareDocumentPosition(title.element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(wrapper.get(".window").attributes("role")).toBe("dialog");
    expect(wrapper.get(".window").attributes("aria-modal")).toBe("false");
    expect(wrapper.get(".window").attributes("tabindex")).toBe("-1");
  });

  it("cycles Tab and Shift+Tab inside the focused window", async () => {
    const { wrapper } = mountWindow(makeRecord(), [
      manifest({
        id: "notes",
        name: "Notes",
        component: () => Promise.resolve(asEsm(FocusableApp)),
      }),
    ]);

    await flushPromises();

    const windowElement = wrapper.get<HTMLElement>(".window").element;
    const first = wrapper.get<HTMLButtonElement>(
      '.window__action[aria-label="Minimize Notes"]',
    ).element;
    const last = wrapper.get<HTMLButtonElement>("[data-app-focus-last]").element;

    await vi.waitFor(() => expect(document.activeElement).toBe(windowElement));

    last.focus();
    pressTab(last);
    expect(document.activeElement).toBe(first);

    first.focus();
    pressTab(first, true);
    expect(document.activeElement).toBe(last);
  });

  it("yields focus to shell controls and reactivates when focus returns", async () => {
    const outside = document.createElement("button");
    outside.dataset.windowFocusOutside = "";
    outside.textContent = "Dock item";
    document.body.appendChild(outside);

    const { wrapper } = mountWindow(makeRecord(), [
      manifest({
        id: "notes",
        name: "Notes",
        component: () => Promise.resolve(asEsm(FocusableApp)),
      }),
    ]);

    await flushPromises();

    const windowElement = wrapper.get<HTMLElement>(".window").element;
    const first = wrapper.get<HTMLButtonElement>(
      '.window__action[aria-label="Minimize Notes"]',
    ).element;
    const last = wrapper.get<HTMLButtonElement>("[data-app-focus-last]").element;

    await vi.waitFor(() => expect(document.activeElement).toBe(windowElement));

    outside.focus();
    expect(document.activeElement).toBe(outside);

    await wrapper.setProps({ record: makeRecord({ z: 102 }) });
    await vi.waitFor(() => expect(document.activeElement).toBe(windowElement));

    outside.focus();
    expect(document.activeElement).toBe(outside);

    windowElement.focus();
    expect(document.activeElement).toBe(windowElement);

    last.focus();
    pressTab(last);
    expect(document.activeElement).toBe(first);
  });

  it("requests window-manager focus without stealing focus from the selected control", async () => {
    const { wrapper } = mountWindow(makeRecord({ focused: false }), [
      manifest({
        id: "notes",
        name: "Notes",
        component: () => Promise.resolve(asEsm(FocusableApp)),
      }),
    ]);

    await flushPromises();

    const selected = wrapper.get<HTMLButtonElement>("[data-app-focus-first]").element;
    selected.focus();

    expect(wrapper.emitted("focus:window")).toEqual([["window-1"]]);
    expect(document.activeElement).toBe(selected);
  });

  it("keeps an app modal in the window overlay and resumes the window trap after close", async () => {
    const outside = document.createElement("button");
    outside.dataset.windowFocusOutside = "";
    outside.textContent = "Menu bar action";
    document.body.appendChild(outside);

    const { wrapper } = mountWindow(makeRecord(), [
      manifest({
        id: "notes",
        name: "Notes",
        component: () => Promise.resolve(asEsm(ModalApp)),
      }),
    ]);

    await flushPromises();
    await flushOverlay();

    const windowElement = wrapper.get<HTMLElement>(".window").element;
    const overlay = document.querySelector<HTMLElement>('[data-window-overlay="window-1"]')!;
    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;

    expect(dialog.textContent).toContain("Window-owned dialog");
    await vi.waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    outside.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    overlay.querySelector<HTMLButtonElement>("[data-close-window-modal]")!.click();
    await flushOverlay();
    await vi.waitFor(() => expect(windowElement.contains(document.activeElement)).toBe(true));

    const first = wrapper.get<HTMLButtonElement>(
      '.window__action[aria-label="Minimize Notes"]',
    ).element;
    const last = wrapper.get<HTMLButtonElement>("[data-app-focus-last]").element;
    last.focus();
    pressTab(last);
    expect(document.activeElement).toBe(first);
  });

  it("passes desktop app chrome through AppMount and emits title updates", async () => {
    const ChromeProbe = defineVaporComponent(() => {
      const chrome = inject(AppChromeInjectionKey) as AppChromeController;

      onMounted(() => {
        chrome.setTitle("YouTube Developers Live");
        chrome.setContentSize?.({ width: 640, height: 360 });
        chrome.setTitle(null);
        chrome.setContentSize?.(null);
      });

      const root = document.createElement("div");
      root.dataset.appMountProbe = "";
      return root;
    });
    const { wrapper } = mountWindow(
      makeRecord({ manifestId: "youtube-player", title: "YouTube Player" }),
      [
        manifest({
          id: "youtube-player",
          name: "YouTube Player",
          component: () => Promise.resolve(asEsm(ChromeProbe)),
        }),
      ],
    );

    await flushPromises();
    await nextTick();

    expect(wrapper.emitted("title:window")).toEqual([
      ["window-1", "YouTube Developers Live"],
      ["window-1", "YouTube Player"],
    ]);
    expect(wrapper.emitted("content-size:window")).toEqual([
      ["window-1", { width: 640, height: 360 }],
      ["window-1", null],
    ]);
  });

  it("opens command-backed titlebar actions", async () => {
    const { wrapper, dispatch } = mountWindow();

    dispatchContextMenu(wrapper.get(".window__titlebar").element);
    await flushOverlay();

    const overlay = document.querySelector<HTMLElement>('[data-window-overlay="window-1"]')!;
    const items = Array.from(overlay.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Minimize",
      "Maximize",
      "Close",
    ]);
    expect(overlay.contains(document.activeElement)).toBe(true);

    items[0]!.click();
    await flushOverlay();

    expect(dispatch).toHaveBeenCalledWith("desktop:window.minimize", {
      source: "menu",
      payload: { windowId: "window-1" },
    });
  });

  it("labels the maximize action as Restore for maximized windows", async () => {
    const { wrapper } = mountWindow(makeRecord({ maximized: true }));

    dispatchContextMenu(wrapper.get(".window__titlebar").element);
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    expect(items.map((node) => node.textContent?.trim())).toEqual(["Minimize", "Restore", "Close"]);
  });

  it("shows Settings for apps with settings and dispatches the settings command", async () => {
    const { wrapper, dispatch } = mountWindow(makeRecord(), [
      manifest({ id: "notes", name: "Notes", settings: {} }),
    ]);

    dispatchContextMenu(wrapper.get(".window__titlebar").element);
    await flushOverlay();

    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    expect(items.map((node) => node.textContent?.trim())).toEqual([
      "Minimize",
      "Maximize",
      "Settings",
      "Close",
    ]);

    items[2]!.click();
    await flushOverlay();

    expect(dispatch).toHaveBeenCalledWith("desktop:window.openSettings", {
      source: "menu",
      payload: { windowId: "window-1" },
    });
  });
});
