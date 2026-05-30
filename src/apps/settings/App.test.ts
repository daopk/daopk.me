import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref, type Component } from "vue";

const { resizeCallbacks } = vi.hoisted(() => ({
  resizeCallbacks: [] as Array<(entries: Array<{ contentRect: { width: number } }>) => void>,
}));

vi.mock("@vueuse/core", () => ({
  useResizeObserver: (
    _target: unknown,
    callback: (entries: Array<{ contentRect: { width: number } }>) => void,
  ): (() => void) => {
    resizeCallbacks.push(callback);

    return () => undefined;
  },
}));

import { builtinWallpapers, DEFAULT_WALLPAPER_ID } from "~/core/theme/wallpapers";
import {
  PWA_INSTALL_DISMISSED_KEY,
  pwaInstallController,
  type BeforeInstallPromptEventLike,
  type PwaInstallWindowLike,
} from "~/service-worker/installController";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";
import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  type AppManifest,
  type AppChromeBackAction,
  type AppChromeController,
  type AppContext,
} from "~/types/app";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import App from "./App.vue";

const StubIcon = defineComponent({ template: "<svg />" });

function makeApp(overrides: Partial<AppManifest> & { id: string; name: string }): AppManifest {
  return {
    icon: StubIcon as Component,
    category: "productivity",
    component: () => Promise.resolve({ default: defineComponent({ template: "<div />" }) }),
    ...overrides,
  };
}

function makeFakeKernel(apps: readonly AppManifest[] = []): Kernel {
  const desktopWallpaperIdRef = ref<string>(DEFAULT_WALLPAPER_ID);
  const mobileWallpaperIdRef = ref<string>(DEFAULT_WALLPAPER_ID);
  const telemetryEnabledRef = ref(false);
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const on = vi.fn((channel: string, listener: (payload: unknown) => void) => {
    const bucket = listeners.get(channel) ?? new Set<(payload: unknown) => void>();
    bucket.add(listener);
    listeners.set(channel, bucket);
    return (): void => {
      bucket.delete(listener);
    };
  });
  const emit = vi.fn((channel: string, payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  });
  return {
    theme: {
      current: (): "light" => "light",
      setTheme: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      list: () => ["light", "dark"] as const,
      currentOverrides: () => ({}),
      setOverride: vi.fn(),
      unsetOverride: vi.fn(),
      setOverrides: vi.fn(),
      resetOverrides: vi.fn(),
    },
    settings: {
      use: vi.fn((key: string) => {
        if (key === "desktopWallpaperActiveId") {
          return desktopWallpaperIdRef;
        }
        if (key === "mobileWallpaperActiveId") {
          return mobileWallpaperIdRef;
        }
        if (key === "telemetryEnabled") {
          return telemetryEnabledRef;
        }
        return ref(undefined);
      }),
      get: vi.fn(),
      set: vi.fn(),
      reset: vi.fn(),
    },
    wallpapers: {
      list: () => builtinWallpapers,
      get: (id: string) => builtinWallpapers.find((w) => w.id === id),
      register: vi.fn(() => () => undefined),
      unregister: vi.fn(),
    },
    widgets: {
      list: vi.fn(() => []),
      get: vi.fn(),
      register: vi.fn(() => () => undefined),
      unregister: vi.fn(),
    },
    events: {
      on,
      once: vi.fn(),
      off: vi.fn(),
      emit,
    },
    apps: {
      list: vi.fn(() => [...apps]),
      register: vi.fn(),
      launch: vi.fn(),
      unregister: vi.fn(),
    },
    permissions: {
      list: vi.fn(() => []),
      request: vi.fn(),
      respond: vi.fn(),
      revoke: vi.fn(),
    },
    profile: {
      current: vi.fn(() => ({
        profileId: "alpha",
        displayName: "Alpha",
        authMode: "passkey",
        encryption: "none",
        encrypted: false,
      })),
      lock: vi.fn(async () => undefined),
      signOut: vi.fn(async () => undefined),
      deleteCurrentAccount: vi.fn(async () => undefined),
    },
  } as unknown as Kernel;
}

function mountApp(
  options: {
    kernel?: Kernel;
    appArgs?: Record<string, unknown>;
    appChrome?: AppChromeController;
  } = {},
) {
  const kernel = options.kernel ?? makeFakeKernel();
  const provide: Record<symbol, unknown> = {
    [KernelInjectionKey as symbol]: kernel,
  };
  if (options.appArgs !== undefined) {
    provide[AppContextInjectionKey as symbol] = {
      manifestId: "settings",
      handleId: "settings-1",
      args: Object.freeze({ ...options.appArgs }),
    } satisfies AppContext;
  }
  if (options.appChrome !== undefined) {
    provide[AppChromeInjectionKey as symbol] = options.appChrome;
  }

  return mount(App, {
    attachTo: document.body,
    global: {
      provide,
    },
  });
}

function setSettingsWidth(width: number): void {
  for (const callback of resizeCallbacks) {
    callback([{ contentRect: { width } }]);
  }
}

function setShellViewportWidth(width: number): void {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("visualViewport", { width, height: 800 });
}

function findButtonByText(wrapper: ReturnType<typeof mountApp>, text: string) {
  return wrapper.findAll("button").find((button) => button.text() === text);
}

function createPwaWindowStub() {
  const listeners = new Map<string, Set<EventListener>>();
  const windowLike: PwaInstallWindowLike = {
    navigator: { onLine: true },
    addEventListener: vi.fn((type: "appinstalled" | "beforeinstallprompt", listener) => {
      const bucket = listeners.get(type) ?? new Set<EventListener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    }),
    removeEventListener: vi.fn((type: "appinstalled" | "beforeinstallprompt", listener) => {
      listeners.get(type)?.delete(listener);
    }),
    matchMedia: vi.fn(() => ({ matches: false })),
  };

  return {
    windowLike,
    fire(type: "appinstalled" | "beforeinstallprompt", event: Event = new Event(type)): void {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
}

function createBeforeInstallPromptEvent(prompt: () => Promise<void>): BeforeInstallPromptEventLike {
  const event = new Event("beforeinstallprompt", {
    cancelable: true,
  }) as BeforeInstallPromptEventLike & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" }>;
  };
  event.prompt = prompt;
  event.userChoice = Promise.resolve({ outcome: "accepted" });

  return event;
}

describe("Settings App.vue", () => {
  beforeEach(() => {
    resizeCallbacks.length = 0;
    localStorage.removeItem(PWA_INSTALL_DISMISSED_KEY);
    setActivePinia(createPinia());
    pwaInstallController.resetForTests();
    serviceWorkerUpdateController.resetForTests();
  });

  afterEach(() => {
    localStorage.removeItem(PWA_INSTALL_DISMISSED_KEY);
    pwaInstallController.resetForTests();
    serviceWorkerUpdateController.resetForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders desktop section nav items in the expected order", () => {
    const wrapper = mountApp();

    const items = wrapper.findAll(".settings__nav-item");
    expect(items).toHaveLength(7);

    const labels = items.map((item) => item.find(".settings__nav-label").text());
    expect(labels).toEqual([
      "Appearance",
      "Background",
      "Comfort",
      "Dock",
      "Account",
      "Privacy",
      "About device",
    ]);

    wrapper.unmount();
  });

  it("hides desktop-only settings from the mobile shell", () => {
    setShellViewportWidth(390);
    const wrapper = mountApp();

    const labels = wrapper.findAll(".settings__nav-label").map((item) => item.text());
    expect(labels).toEqual([
      "Appearance",
      "Background",
      "Comfort",
      "Account",
      "Privacy",
      "Apps",
      "About device",
    ]);
    expect(wrapper.text()).not.toContain("Desktop Dock");
    expect(wrapper.text()).not.toContain("Automatically hide the Dock");

    wrapper.unmount();
  });

  it("Appearance is the active section on mount", () => {
    const wrapper = mountApp();

    const items = wrapper.findAll(".settings__nav-item");
    expect(items[0]?.classes()).toContain("settings__nav-item--active");
    expect(items[0]?.attributes("aria-current")).toBe("page");

    // The other sections must NOT be active simultaneously.
    for (const item of items.slice(1)) {
      expect(item.classes()).not.toContain("settings__nav-item--active");
      expect(item.attributes("aria-current")).toBeUndefined();
    }

    wrapper.unmount();
  });

  it("uses AppContext.args.section as the initial active section", () => {
    const wrapper = mountApp({ appArgs: { section: "background" } });

    const items = wrapper.findAll(".settings__nav-item");
    expect(items[1]?.classes()).toContain("settings__nav-item--active");
    expect(items[1]?.attributes("aria-current")).toBe("page");
    expect(wrapper.find(".background").exists()).toBe(true);

    wrapper.unmount();
  });

  it("falls back when the mobile shell receives a desktop-only section arg", () => {
    setShellViewportWidth(390);
    const wrapper = mountApp({ appArgs: { section: "dock" } });

    const items = wrapper.findAll(".settings__nav-item");
    expect(items[0]?.find(".settings__nav-label").text()).toBe("Appearance");
    expect(items[0]?.classes()).toContain("settings__nav-item--active");
    expect(wrapper.find(".appearance").exists()).toBe(true);
    expect(wrapper.find(".dock-settings").exists()).toBe(false);

    wrapper.unmount();
  });

  it("switches sections when settings.section.requested is emitted", async () => {
    const kernel = makeFakeKernel();
    const wrapper = mountApp({ kernel });

    kernel.events.emit("settings.section.requested", { section: "background" });
    await nextTick();

    const items = wrapper.findAll(".settings__nav-item");
    expect(items[1]?.classes()).toContain("settings__nav-item--active");
    expect(items[1]?.attributes("aria-current")).toBe("page");
    expect(wrapper.find(".background").exists()).toBe(true);

    wrapper.unmount();
  });

  it("falls back when mobile receives a desktop-only section request", async () => {
    setShellViewportWidth(390);
    const kernel = makeFakeKernel();
    const wrapper = mountApp({ kernel });

    kernel.events.emit("settings.section.requested", { section: "dock" });
    await nextTick();

    const items = wrapper.findAll(".settings__nav-item");
    expect(items[0]?.find(".settings__nav-label").text()).toBe("Appearance");
    expect(items[0]?.classes()).toContain("settings__nav-item--active");
    expect(wrapper.find(".appearance").exists()).toBe(true);
    expect(wrapper.find(".dock-settings").exists()).toBe(false);

    wrapper.unmount();
  });

  it("renders mobile app settings entries and launches the selected app settings pane", async () => {
    setShellViewportWidth(390);
    const kernel = makeFakeKernel([
      makeApp({
        id: "notes",
        name: "Notes",
      }),
      makeApp({
        id: "calendar",
        name: "Calendar",
        settings: { keywords: ["calendar settings"] },
      }),
      makeApp({
        id: "hidden-settings",
        name: "Hidden Settings",
        hidden: true,
        settings: {},
      }),
      makeApp({
        id: "_template",
        name: "Template",
        settings: {},
      }),
    ]);
    const wrapper = mountApp({ kernel });

    const appsItem = wrapper
      .findAll(".settings__nav-item")
      .find((item) => item.find(".settings__nav-label").text() === "Apps");
    await appsItem?.trigger("click");

    const appItems = wrapper.findAll(".apps-settings__item");
    expect(appItems).toHaveLength(1);
    expect(appItems[0]?.text()).toContain("Calendar");

    await appItems[0]?.trigger("click");

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "calendar",
      source: "api",
      args: { pane: "settings" },
    });

    wrapper.unmount();
  });

  it("clicking Comfort swaps the active section + renders Comfort content", async () => {
    const wrapper = mountApp();

    const comfortItem = wrapper.findAll(".settings__nav-item")[2];
    await comfortItem?.trigger("click");

    expect(comfortItem?.classes()).toContain("settings__nav-item--active");
    expect(comfortItem?.attributes("aria-current")).toBe("page");

    expect(wrapper.text()).toContain("Comfort");
    expect(wrapper.text()).toContain("Density");
    expect(wrapper.text()).toContain("Motion");
    expect(wrapper.text()).toContain("Typography");
    expect(wrapper.text()).not.toContain("Desktop Dock");
    expect(wrapper.findAll(".comfort__density-card")).toHaveLength(3);
    expect(wrapper.findAll(".comfort__motion-card")).toHaveLength(3);
    expect(wrapper.findAll(".comfort__type-card")).toHaveLength(6);

    // Appearance content must be gone — no theme cards visible.
    expect(wrapper.findAll(".appearance__theme-card")).toHaveLength(0);

    wrapper.unmount();
  });

  it("smoke: cycling forward + backward through all desktop sections mounts each without throwing", async () => {
    const wrapper = mountApp();
    const navItems = wrapper.findAll(".settings__nav-item");

    const expectations: ReadonlyArray<[number, string, string]> = [
      [0, "appearance", "Theme"],
      [1, "background", "Wallpaper"],
      [2, "comfort", "Density"],
      [3, "dock-settings", "Automatically hide the Dock"],
      [4, "account", "Lock Session"],
      [5, "privacy", "Privacy"],
      [6, "about-device", "Boot count"],
    ];

    for (const [idx, rootClass, marker] of expectations) {
      await navItems[idx]?.trigger("click");
      expect(wrapper.find(`.${rootClass}`).exists()).toBe(true);
      expect(wrapper.text()).toContain(marker);
    }

    for (const [idx, rootClass, marker] of [...expectations].reverse()) {
      await navItems[idx]?.trigger("click");
      expect(wrapper.find(`.${rootClass}`).exists()).toBe(true);
      expect(wrapper.text()).toContain(marker);
    }

    wrapper.unmount();
  });

  it("does not render service worker status while idle", () => {
    const wrapper = mountApp();

    expect(wrapper.find(".sw-update-row").exists()).toBe(false);
    expect(wrapper.find(".pwa-install-row").exists()).toBe(false);

    wrapper.unmount();
  });

  it("renders native install controls above update status and delegates install", async () => {
    let resolvePrompt: (() => void) | undefined;
    const prompt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
    );
    const pwaWindow = createPwaWindowStub();
    pwaInstallController.register({
      window: pwaWindow.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel" },
      storage: localStorage,
    });
    pwaWindow.fire("beforeinstallprompt", createBeforeInstallPromptEvent(prompt));
    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    const wrapper = mountApp();

    expect(wrapper.text()).toContain("Install WebOS");
    expect(wrapper.text()).toContain("Update available");
    const installRow = wrapper.find(".pwa-install-row").element;
    const updateRow = wrapper.find(".sw-update-row").element;
    expect(
      installRow.compareDocumentPosition(updateRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await findButtonByText(wrapper, "Install")?.trigger("click");
    await nextTick();

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(findButtonByText(wrapper, "Install")?.attributes("aria-busy")).toBe("true");

    resolvePrompt?.();
    wrapper.unmount();
  });

  it("renders iOS manual install guidance without a fake install button", async () => {
    const pwaWindow = createPwaWindowStub();
    pwaInstallController.register({
      window: pwaWindow.windowLike,
      navigator: { userAgent: "Mobile Safari", platform: "iPhone", maxTouchPoints: 5 },
      storage: localStorage,
    });
    const wrapper = mountApp();

    expect(wrapper.text()).toContain("Add to Home Screen");
    expect(wrapper.text()).toContain("In Safari, use Share, then Add to Home Screen.");
    expect(findButtonByText(wrapper, "Install")).toBeUndefined();

    await findButtonByText(wrapper, "Later")?.trigger("click");

    expect(wrapper.find(".pwa-install-row").exists()).toBe(false);

    wrapper.unmount();
  });

  it("renders update controls and refresh delegates to the controller action", async () => {
    const update = vi.fn(() => new Promise<void>(() => undefined));
    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    const wrapper = mountApp();

    expect(wrapper.text()).toContain("Update available");
    expect(wrapper.text()).toContain("Refresh to use the latest version.");

    await findButtonByText(wrapper, "Refresh")?.trigger("click");
    await nextTick();

    expect(update).toHaveBeenCalledTimes(1);
    expect(findButtonByText(wrapper, "Refresh")?.attributes("aria-busy")).toBe("true");

    wrapper.unmount();
  });

  it("Later dismisses the update row, and a later update event shows it again", async () => {
    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    const wrapper = mountApp();

    await findButtonByText(wrapper, "Later")?.trigger("click");

    expect(wrapper.find(".sw-update-row").exists()).toBe(false);

    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    await nextTick();

    expect(wrapper.find(".sw-update-row").exists()).toBe(true);
    expect(wrapper.text()).toContain("Update available");

    wrapper.unmount();
  });

  it("renders refresh errors with a retry action", async () => {
    serviceWorkerUpdateController.notifyUpdateAvailable(
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const wrapper = mountApp();

    await findButtonByText(wrapper, "Refresh")?.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Update couldn't finish");
    expect(wrapper.text()).toContain("network down");
    expect(findButtonByText(wrapper, "Try again")?.exists()).toBe(true);

    wrapper.unmount();
  });

  it("renders offline-ready as a quiet status without actions", () => {
    serviceWorkerUpdateController.notifyOfflineReady();
    const wrapper = mountApp();

    expect(wrapper.text()).toContain("Ready offline");
    expect(findButtonByText(wrapper, "Refresh")).toBeUndefined();
    expect(findButtonByText(wrapper, "Later")).toBeUndefined();

    wrapper.unmount();
  });

  it("keeps the update row visible in narrow nav mode", async () => {
    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    const wrapper = mountApp();

    setSettingsWidth(320);
    await nextTick();

    expect(wrapper.find(".sw-update-row").exists()).toBe(true);
    expect(wrapper.find(".settings__nav").exists()).toBe(true);
    expect(wrapper.find(".settings__mobile-title").exists()).toBe(false);
    expect(wrapper.find(".settings__content").exists()).toBe(false);
    expect(wrapper.text()).toContain("Update available");

    wrapper.unmount();
  });

  it("keeps the install row visible in narrow nav and content modes", async () => {
    const pwaWindow = createPwaWindowStub();
    pwaInstallController.register({
      window: pwaWindow.windowLike,
      navigator: { userAgent: "Mobile Safari", platform: "iPhone", maxTouchPoints: 5 },
      storage: localStorage,
    });
    const wrapper = mountApp();

    setSettingsWidth(320);
    await nextTick();

    expect(wrapper.find(".pwa-install-row").exists()).toBe(true);
    expect(wrapper.find(".settings__nav").exists()).toBe(true);
    expect(wrapper.find(".settings__content").exists()).toBe(false);

    await wrapper.findAll(".settings__nav-item")[0]?.trigger("click");

    expect(wrapper.find(".settings__nav").exists()).toBe(false);
    expect(wrapper.find(".settings__content-header").exists()).toBe(false);
    expect(wrapper.find(".settings__content-title").exists()).toBe(false);
    expect(wrapper.find(".settings__content .pwa-install-row").exists()).toBe(true);

    wrapper.unmount();
  });

  it("uses AppView chrome for narrow section title and back navigation", async () => {
    let backAction: AppChromeBackAction | null = null;
    const appChrome: AppChromeController = {
      setTitle: vi.fn(),
      setBackAction: vi.fn((action) => {
        backAction = action;
      }),
    };
    const wrapper = mountApp({ appChrome });

    setSettingsWidth(320);
    await nextTick();

    expect(appChrome.setTitle).toHaveBeenLastCalledWith(null);
    expect(appChrome.setBackAction).toHaveBeenLastCalledWith(null);

    await wrapper.findAll(".settings__nav-item")[0]?.trigger("click");
    await nextTick();

    expect(wrapper.find(".settings__nav").exists()).toBe(false);
    expect(wrapper.find(".settings__content").exists()).toBe(true);
    expect(wrapper.find(".settings__content-header").exists()).toBe(false);
    expect(appChrome.setTitle).toHaveBeenLastCalledWith("Appearance");
    expect(backAction?.ariaLabel).toBe("Back to Settings");

    backAction?.handler();
    await nextTick();

    expect(wrapper.find(".settings__nav").exists()).toBe(true);
    expect(wrapper.find(".settings__content").exists()).toBe(false);
    expect(appChrome.setTitle).toHaveBeenLastCalledWith(null);
    expect(appChrome.setBackAction).toHaveBeenLastCalledWith(null);

    wrapper.unmount();
  });
});
