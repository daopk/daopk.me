import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, inject, nextTick, onMounted, type Component } from "vue";

import { AppChromeInjectionKey, type AppHandle, type AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import { useSettingsStore } from "~/core/storage/SettingsStore";
import { clearToasts, toastQueue } from "~/components/ui/useToast";

import MobileShell from "./MobileShell.vue";
import HomeScreen from "./homeScreen/HomeScreen.vue";
import HomeScreenIcon from "./homeScreen/HomeScreenIcon.vue";
import { __resetNavigationForTest } from "./navigation";

const StubIcon = defineComponent({ template: "<svg />" });

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: "alpha",
    name: "Alpha",
    icon: StubIcon as Component,
    category: "system",
    component: () => Promise.resolve({ default: defineComponent({ template: "<div />" }) }),
    ...overrides,
  };
}

let currentKernel: Pick<
  Kernel,
  "apps" | "processes" | "lifecycleCoordinator" | "events" | "widgets"
>;
let launchCount = 0;

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "apps" | "processes" | "lifecycleCoordinator" | "events" | "widgets"> {
    return currentKernel;
  },
}));

vi.mock("~/components/wallpaper/Wallpaper.vue", () => ({
  default: defineComponent({ template: "<div class='wallpaper-stub' />" }),
}));

function makeKernel(
  manifests: AppManifest[],
): Pick<Kernel, "apps" | "processes" | "lifecycleCoordinator" | "events" | "widgets"> {
  type EventListener = (payload: unknown) => void;
  const listeners = new Map<string, Set<EventListener>>();
  const emit = vi.fn((channel: string, payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  });
  const on = vi.fn((channel: string, listener: EventListener) => {
    const bucket = listeners.get(channel) ?? new Set<EventListener>();
    bucket.add(listener);
    listeners.set(channel, bucket);
    return (): void => {
      bucket.delete(listener);
    };
  });

  return {
    apps: {
      list: () => manifests,
      register: vi.fn(),
      async launch(manifestId: string): Promise<AppHandle> {
        launchCount += 1;
        return {
          id: `h-${launchCount}`,
          manifestId,
          on: () => () => undefined,
          postMessage: () => undefined,
        };
      },
      unregister: vi.fn(),
    },
    processes: {
      spawn: vi.fn(),
      kill: vi.fn(),
      suspend: vi.fn(),
      resume: vi.fn(),
      list: () =>
        [][Symbol.iterator]() as IterableIterator<[string, { state: string; manifestId: string }]>,
    },
    lifecycleCoordinator: {
      register: vi.fn(),
      unregister: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(() => () => undefined),
    },
    events: {
      on: on as unknown as Kernel["events"]["on"],
      emit: emit as unknown as Kernel["events"]["emit"],
      once: vi.fn(() => () => undefined) as unknown as Kernel["events"]["once"],
      off: vi.fn(),
    },
    widgets: {
      list: () => [],
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
    } as unknown as Kernel["widgets"],
  };
}

/** (display:none) but lose `aria-current="page"`. */
const FOREGROUND_APPVIEW = 'section.app-view[aria-current="page"]';

describe("MobileShell (v2 — back-as-suspend)", () => {
  beforeAll(async () => {
    await import("./appSwitcher/AppSwitcher.vue");
  });

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useSettingsStore().hydrate();
    __resetNavigationForTest();
    window.history.replaceState(null, "", "/");
    document.title = "WebOS";
    clearToasts();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T09:41:00"));
    launchCount = 0;
    currentKernel = makeKernel([manifest({ id: "alpha" })]);
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetNavigationForTest();
    try {
      useSettingsStore().dispose();
    } catch {}
    document.title = "WebOS";
  });

  it("composes the HomeScreen", () => {
    const wrapper = mount(MobileShell);

    expect(wrapper.findComponent(HomeScreen).exists()).toBe(true);
  });

  it("does not emit `launch` on its own root (HomeScreen → MobileShell only)", async () => {
    const wrapper = mount(MobileShell);
    const icon = wrapper.findComponent(HomeScreenIcon);
    expect(icon.exists()).toBe(true);

    await icon.trigger("click");

    expect(wrapper.emitted("launch")).toBeFalsy();
  });

  it("mounts a foreground AppView after an icon-driven launch (M1.2 integration)", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();

    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-manifest-id")).toBe("alpha");

    wrapper.unmount();
  });

  it("syncs the browser URL to the foreground mobile app fallback path", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" }), manifest({ id: "beta", name: "Beta" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    expect(window.location.pathname).toBe("/apps/alpha");
    expect(document.title).toBe("Alpha - WebOS");

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "beta",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    expect(window.location.pathname).toBe("/apps/beta");
    expect(document.title).toBe("Beta - WebOS");

    wrapper.unmount();
  });

  it("syncs the browser URL home when mobile goes home", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    expect(window.location.pathname).toBe("/apps/alpha");
    expect(document.title).toBe("Alpha - WebOS");

    await wrapper.find(".app-view__hide").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(window.location.pathname).toBe("/");
    expect(document.title).toBe("WebOS");

    wrapper.unmount();
  });

  it("stores custom mobile app URLs and restores them when the frame is foregrounded", async () => {
    currentKernel = makeKernel([manifest({ id: "blog", name: "Blog" }), manifest({ id: "alpha" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "blog",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    expect(window.location.pathname).toBe("/apps/blog");
    expect(document.title).toBe("Blog - WebOS");

    currentKernel.events.emit("app.url.changed", {
      manifestId: "blog",
      handleId: "h-1",
      path: "/blog/moving-apps-out-of-the-shell",
    });
    await flushPromises();
    await nextTick();

    expect(window.location.pathname).toBe("/blog/moving-apps-out-of-the-shell");
    expect(document.title).toBe("Blog - WebOS");

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    expect(window.location.pathname).toBe("/apps/alpha");
    expect(document.title).toBe("Alpha - WebOS");

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "blog",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    expect(window.location.pathname).toBe("/blog/moving-apps-out-of-the-shell");
    expect(document.title).toBe("Blog - WebOS");

    wrapper.unmount();
  });

  it("syncs the mobile browser title from hosted app chrome titles", async () => {
    const Probe = defineComponent({
      name: "MobileTitleProbe",
      setup() {
        const chrome = inject(AppChromeInjectionKey, null);
        onMounted(() => {
          chrome?.setTitle("Moving Apps Out of the Shell");
        });
      },
      template: "<div />",
    });
    currentKernel = makeKernel([
      manifest({
        id: "blog",
        name: "Blog",
        component: () =>
          Promise.resolve(
            Object.assign(Object.create(null) as { default: Component }, {
              default: Probe as Component,
              __esModule: true,
            }),
          ),
      }),
    ]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "blog",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    expect(document.title).toBe("Moving Apps Out of the Shell - WebOS");

    await wrapper.find(".app-view__hide").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(document.title).toBe("WebOS");

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "blog",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    expect(document.title).toBe("Moving Apps Out of the Shell - WebOS");

    wrapper.unmount();
  });

  it("falls back to the generic mobile app URL for invalid custom app URLs", async () => {
    currentKernel = makeKernel([manifest({ id: "blog", name: "Blog" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "blog",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    currentKernel.events.emit("app.url.changed", {
      manifestId: "blog",
      handleId: "h-1",
      path: "https://example.test/blog/bad",
    });
    await flushPromises();
    await nextTick();

    expect(window.location.pathname).toBe("/apps/blog");

    wrapper.unmount();
  });

  it("warns via a toast for desktop-only apps without launching them", async () => {
    currentKernel = makeKernel([
      manifest({ id: "desktop-tool", name: "Desktop Tool", supportedShells: ["desktop"] }),
    ]);

    const wrapper = mount(MobileShell, { attachTo: document.body });

    try {
      await wrapper.findComponent(HomeScreenIcon).trigger("click");
      await flushPromises();
      await nextTick();

      expect(launchCount).toBe(0);
      expect(toastQueue.value).toHaveLength(1);
      expect(toastQueue.value[0]).toMatchObject({
        tone: "warning",
        description: "Desktop Tool is not supported on mobile. Open it from the desktop shell.",
      });
      expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);
      expect(wrapper.find(".unsupported-app-view").exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("does NOT call `document.startViewTransition` for nav launch (M1.3.5 — R16 fix dropped VT from nav)", async () => {
    const vtSpy = vi.fn((cb: () => void | Promise<void>) => {
      cb();
      return { finished: Promise.resolve() };
    });

    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: vtSpy,
    });

    try {
      const wrapper = mount(MobileShell, { attachTo: document.body });
      await wrapper.findComponent(HomeScreenIcon).trigger("click");
      await flushPromises();
      await nextTick();

      expect(vtSpy).not.toHaveBeenCalled();
      expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);

      wrapper.unmount();
    } finally {
      Object.defineProperty(document, "startViewTransition", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    }
  });

  it("still mounts the AppView when reduced-motion is active (CSS path handles the duration drop)", async () => {
    useSettingsStore().$patch({ reduceMotion: "always" });

    const wrapper = mount(MobileShell, { attachTo: document.body });
    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();

    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);

    wrapper.unmount();
  });

  it("back from a foregrounded app suspends to home WITHOUT killing the kernel process (back-as-suspend acceptance)", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);

    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);
    expect(wrapper.findAll("section.app-view").length).toBe(1);
    const parkedApp = wrapper.find("section.app-view");
    expect(parkedApp.attributes("aria-hidden")).toBe("true");
    expect(parkedApp.attributes("inert")).toBeDefined();
    expect(currentKernel.processes.kill).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("hide from a foregrounded app suspends to home WITHOUT killing the kernel process", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);

    await wrapper.find(".app-view__hide").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(wrapper.findAll("section.app-view").length).toBe(1);
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);
    expect(currentKernel.processes.kill).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("close from a hosted app dismisses the frame and kills the process", async () => {
    const Probe = defineComponent({
      name: "CloseProbe",
      setup() {
        const chrome = inject(AppChromeInjectionKey, null);
        return { chrome };
      },
      template: '<button data-testid="close-app" @click="chrome?.close()">Close</button>',
    });

    currentKernel = makeKernel([
      manifest({
        chrome: { mobile: { titlebar: "hidden" } },
        component: () =>
          Promise.resolve(
            Object.assign(Object.create(null) as { default: Component }, {
              default: Probe as Component,
              __esModule: true,
            }),
          ),
      }),
    ]);

    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);
    expect(document.title).toBe("Alpha - WebOS");

    await wrapper.find('[data-testid="close-app"]').trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(wrapper.findAll("section.app-view").length).toBe(0);
    expect(currentKernel.processes.kill).toHaveBeenCalledWith("h-1", "user");
    expect(document.title).toBe("WebOS");

    wrapper.unmount();
  });

  it("hide from a foregrounded app returns home instead of foregrounding another alive app", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" }), manifest({ id: "beta", name: "Beta" })]);

    const wrapper = mount(MobileShell, { attachTo: document.body });
    const icons = wrapper.findAllComponents(HomeScreenIcon);

    await icons[0].trigger("click");
    await flushPromises();
    await nextTick();
    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();
    await icons[1].trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-manifest-id")).toBe("beta");

    await wrapper.find(FOREGROUND_APPVIEW).find(".app-view__hide").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(wrapper.findAll("section.app-view").length).toBe(2);
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);
    expect(wrapper.find(".home-screen__recents-fab").exists()).toBe(true);
    expect(currentKernel.processes.kill).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("replays app settings requests when a running app is resumed with settings args", async () => {
    currentKernel = makeKernel([manifest({ id: "calendar", name: "Calendar", settings: {} })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "calendar",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-manifest-id")).toBe("calendar");

    currentKernel.events.emit("app.launch.requested", {
      manifestId: "calendar",
      source: "api",
      args: { pane: "settings" },
    });
    await flushPromises();
    await nextTick();

    expect(currentKernel.events.emit).toHaveBeenCalledWith("app.settings.requested", {
      manifestId: "calendar",
      handleId: "h-1",
    });

    wrapper.unmount();
  });

  it("focuses an Editor frame that is already editing the requested path", async () => {
    currentKernel = makeKernel([manifest({ id: "editor", name: "Editor" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.spawn.new", {
      manifestId: "editor",
      source: "api",
      args: { path: "/home/a.md" },
    });
    await flushPromises();
    await nextTick();

    currentKernel.events.emit("app.document.changed", {
      manifestId: "editor",
      handleId: "h-1",
      path: "/home/a.md",
    });
    currentKernel.events.emit("editor.open.requested", {
      source: "api",
      path: "/home/a.md",
    });
    await flushPromises();
    await nextTick();

    expect(launchCount).toBe(1);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-handle-id")).toBe("h-1");

    wrapper.unmount();
  });

  it("reuses a confirmed-empty Editor frame when no matching path exists", async () => {
    currentKernel = makeKernel([manifest({ id: "editor", name: "Editor" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.spawn.new", {
      manifestId: "editor",
      source: "api",
    });
    await flushPromises();
    await nextTick();

    currentKernel.events.emit("app.document.changed", {
      manifestId: "editor",
      handleId: "h-1",
      path: null,
    });
    currentKernel.events.emit("editor.open.requested", {
      source: "api",
      path: "/home/new.md",
    });
    await flushPromises();
    await nextTick();

    expect(launchCount).toBe(1);
    expect(currentKernel.events.emit).toHaveBeenCalledWith("editor.window.open.requested", {
      handleId: "h-1",
      path: "/home/new.md",
    });
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-handle-id")).toBe("h-1");

    wrapper.unmount();
  });

  it("spawns a new Editor frame when no matching or empty frame exists", async () => {
    currentKernel = makeKernel([manifest({ id: "editor", name: "Editor" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.spawn.new", {
      manifestId: "editor",
      source: "api",
      args: { path: "/home/a.md" },
    });
    await flushPromises();
    await nextTick();

    currentKernel.events.emit("app.document.changed", {
      manifestId: "editor",
      handleId: "h-1",
      path: "/home/a.md",
    });
    currentKernel.events.emit("editor.open.requested", {
      source: "api",
      path: "/home/b.md",
    });
    await flushPromises();
    await nextTick();

    expect(launchCount).toBe(2);
    expect(wrapper.findAll("section.app-view")).toHaveLength(2);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-handle-id")).toBe("h-2");

    wrapper.unmount();
  });

  it("focuses a Blog frame that is already showing the requested post", async () => {
    currentKernel = makeKernel([manifest({ id: "blog", name: "Blog" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.spawn.new", {
      manifestId: "blog",
      source: "api",
      args: { path: "/home/posts/a.md", slug: "a" },
    });
    await flushPromises();
    await nextTick();

    currentKernel.events.emit("app.document.changed", {
      manifestId: "blog",
      handleId: "h-1",
      path: "/home/posts/a.md",
    });
    currentKernel.events.emit("blog.post.open.requested", {
      source: "api",
      path: "/home/posts/a.md",
      slug: "a",
    });
    await flushPromises();
    await nextTick();

    expect(launchCount).toBe(1);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-handle-id")).toBe("h-1");

    wrapper.unmount();
  });

  it("spawns a new Blog frame when no frame is showing the requested post", async () => {
    currentKernel = makeKernel([manifest({ id: "blog", name: "Blog" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.spawn.new", {
      manifestId: "blog",
      source: "api",
      args: { path: "/home/posts/a.md", slug: "a" },
    });
    await flushPromises();
    await nextTick();

    currentKernel.events.emit("app.document.changed", {
      manifestId: "blog",
      handleId: "h-1",
      path: "/home/posts/a.md",
    });
    currentKernel.events.emit("blog.post.open.requested", {
      source: "api",
      path: "/home/posts/b.md",
      slug: "b",
    });
    await flushPromises();
    await nextTick();

    expect(launchCount).toBe(2);
    expect(wrapper.findAll("section.app-view")).toHaveLength(2);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-handle-id")).toBe("h-2");

    wrapper.unmount();
  });

  it("focuses a PDF Viewer frame that is already showing the requested file", async () => {
    currentKernel = makeKernel([manifest({ id: "pdf-viewer", name: "PDF Viewer" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.spawn.new", {
      manifestId: "pdf-viewer",
      source: "api",
      args: { path: "/docs/a.pdf" },
    });
    await flushPromises();
    await nextTick();

    currentKernel.events.emit("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: "h-1",
      path: "/docs/a.pdf",
    });
    currentKernel.events.emit("pdf-viewer.open.requested", {
      source: "api",
      path: "/docs/a.pdf",
    });
    await flushPromises();
    await nextTick();

    expect(launchCount).toBe(1);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-handle-id")).toBe("h-1");

    wrapper.unmount();
  });

  it("spawns a new PDF Viewer frame when no frame is showing the requested file", async () => {
    currentKernel = makeKernel([manifest({ id: "pdf-viewer", name: "PDF Viewer" })]);
    const wrapper = mount(MobileShell, { attachTo: document.body });

    currentKernel.events.emit("app.spawn.new", {
      manifestId: "pdf-viewer",
      source: "api",
      args: { path: "/docs/a.pdf" },
    });
    await flushPromises();
    await nextTick();

    currentKernel.events.emit("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: "h-1",
      path: "/docs/a.pdf",
    });
    currentKernel.events.emit("pdf-viewer.open.requested", {
      source: "api",
      path: "/docs/b.pdf",
    });
    await flushPromises();
    await nextTick();

    expect(launchCount).toBe(2);
    expect(wrapper.findAll("section.app-view")).toHaveLength(2);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-handle-id")).toBe("h-2");

    wrapper.unmount();
  });

  it("two-app coexistence: launch alpha → back → launch beta → both frames alive in the stack", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" }), manifest({ id: "beta", name: "Beta" })]);

    const wrapper = mount(MobileShell, { attachTo: document.body });

    const icons = wrapper.findAllComponents(HomeScreenIcon);
    await icons[0].trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-manifest-id")).toBe("alpha");

    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    await icons[1].trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-manifest-id")).toBe("beta");

    expect(wrapper.findAll("section.app-view").length).toBe(2);
    expect(currentKernel.processes.kill).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("reopening an older parked app foregrounds it above a newer parked frame", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" }), manifest({ id: "beta", name: "Beta" })]);

    const wrapper = mount(MobileShell, { attachTo: document.body });

    const icons = wrapper.findAllComponents(HomeScreenIcon);
    await icons[0].trigger("click");
    await flushPromises();
    await nextTick();

    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    await icons[1].trigger("click");
    await flushPromises();
    await nextTick();

    await wrapper.find(FOREGROUND_APPVIEW).find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    await icons[0].trigger("click");
    await flushPromises();
    await nextTick();
    vi.runOnlyPendingTimers();
    await flushPromises();
    await nextTick();

    const alphaView = wrapper.find('section.app-view[data-manifest-id="alpha"]');
    const betaView = wrapper.find('section.app-view[data-manifest-id="beta"]');

    expect(alphaView.attributes("aria-current")).toBe("page");
    expect(alphaView.classes()).toContain("app-view--foreground");
    expect(betaView.attributes("aria-hidden")).toBe("true");
    expect(betaView.attributes("inert")).toBeDefined();
    expect(betaView.classes()).not.toContain("app-view--foreground");

    wrapper.unmount();
  });

  it("re-tapping an alive app's icon resumes its existing frame (no duplicate spawned)", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    expect(launchCount).toBe(1);

    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();

    expect(launchCount).toBe(1);
    expect(wrapper.findAll("section.app-view").length).toBe(1);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-manifest-id")).toBe("alpha");

    wrapper.unmount();
  });

  it("M1.3.6: HomeScreenIcon flips to aria-busy while the kernel launch is in flight, restores on resolve", async () => {
    let resolveLaunch: (handle: AppHandle) => void = () => {
      throw new Error("launch resolver was not captured");
    };
    const kernel = makeKernel([manifest({ id: "alpha" })]);
    let kernelLaunchCalls = 0;
    kernel.apps.launch = (manifestId: string): Promise<AppHandle> => {
      kernelLaunchCalls += 1;
      void manifestId;
      return new Promise((res) => {
        resolveLaunch = (handle) => res(handle);
      });
    };
    currentKernel = kernel;

    const wrapper = mount(MobileShell, { attachTo: document.body });
    try {
      const iconWrapper = wrapper.findComponent(HomeScreenIcon);
      const iconButton = wrapper.find("button.home-icon");

      expect(iconButton.attributes("aria-busy")).toBeUndefined();

      await iconButton.trigger("click");
      await flushPromises();
      await nextTick();

      expect(iconButton.attributes("aria-busy")).toBe("true");
      expect(iconButton.attributes("disabled")).toBeDefined();
      expect(iconWrapper.props("launching")).toBe(true);
      expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);

      await iconButton.trigger("click");
      await flushPromises();
      expect(kernelLaunchCalls).toBe(1);

      resolveLaunch({
        id: "h-1",
        manifestId: "alpha",
        on: () => () => undefined,
        postMessage: () => undefined,
      });
      await flushPromises();
      await nextTick();
      vi.runOnlyPendingTimers();
      await flushPromises();
      await nextTick();

      expect(wrapper.find("button.home-icon").attributes("aria-busy")).toBeUndefined();
      expect(wrapper.find("button.home-icon").attributes("disabled")).toBeUndefined();
      expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  it("M1.3.6 — review nit #4: resume tap (icon for an alive app) does NOT show the spinner", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });
    try {
      const icon = wrapper.findComponent(HomeScreenIcon);

      await icon.trigger("click");
      await flushPromises();
      await nextTick();
      expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);

      await wrapper.find(".app-view__back").trigger("click");
      await flushPromises();
      await nextTick();
      await nextTick();

      // Re-tap. The spinner state must NOT appear at any observable
      await icon.trigger("click");
      await flushPromises();
      // a flicker resolve. `aria-busy` should still be undefined.
      const buttonAfterResume = wrapper.find("button.home-icon");
      expect(buttonAfterResume.attributes("aria-busy")).toBeUndefined();
      expect(buttonAfterResume.attributes("disabled")).toBeUndefined();

      await nextTick();
      expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);
      expect(wrapper.find("button.home-icon").attributes("aria-busy")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it("M1.3.X-anim — review nit #5: switcher opened during app entry keeps foreground class", async () => {
    // Launch alpha and open the switcher before any animation duration elapses.
    // The switcher's `inert` + `aria-hidden` don't remove the foreground class.
    const wrapper = mount(MobileShell, { attachTo: document.body });
    try {
      await wrapper.findComponent(HomeScreenIcon).trigger("click");
      await flushPromises();
      await nextTick();
      await wrapper.find(".app-view__recents").trigger("click");
      await flushPromises();
      await flushPromises();
      await nextTick();

      const appView = wrapper.find("section.app-view");
      expect(appView.classes()).toContain("app-view--foreground");
      expect(appView.attributes("inert")).toBeDefined();
      expect(appView.attributes("aria-current")).toBeUndefined(); // switcher steals current
    } finally {
      wrapper.unmount();
    }
  });

  it("review nit #1: `data-input-mode` defaults to `touch`, flips to `keyboard` on keydown", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });
    try {
      const root = wrapper.find(".mobile-shell");
      expect(root.attributes("data-input-mode")).toBe("touch");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      await nextTick();
      expect(root.attributes("data-input-mode")).toBe("keyboard");

      window.dispatchEvent(new PointerEvent("pointerdown"));
      await nextTick();
      expect(root.attributes("data-input-mode")).toBe("touch");
    } finally {
      wrapper.unmount();
    }
  });

  it("M1.3.6: HomeScreenIcon spinner state clears on launch reject (user can retry)", async () => {
    let rejectLaunch: (reason: Error) => void = () => {
      throw new Error("launch rejecter was not captured");
    };
    const kernel = makeKernel([manifest({ id: "alpha" })]);
    kernel.apps.launch = (manifestId: string): Promise<AppHandle> => {
      void manifestId;
      return new Promise((_, rej) => {
        rejectLaunch = (reason) => rej(reason);
      });
    };
    currentKernel = kernel;

    const wrapper = mount(MobileShell, { attachTo: document.body });
    try {
      const iconButton = wrapper.find("button.home-icon");

      await iconButton.trigger("click");
      await flushPromises();
      await nextTick();
      expect(iconButton.attributes("aria-busy")).toBe("true");

      rejectLaunch(new Error("kernel refused"));
      await flushPromises();
      await nextTick();

      expect(wrapper.find("button.home-icon").attributes("aria-busy")).toBeUndefined();
      expect(wrapper.find("button.home-icon").attributes("disabled")).toBeUndefined();
      expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("does not commit lastLaunchedManifestId when launch rejects (review fix NI2)", async () => {
    const kernel = makeKernel([manifest({ id: "alpha" }), manifest({ id: "beta", name: "Beta" })]);

    const originalLaunch = kernel.apps.launch;
    kernel.apps.launch = async (manifestId: string): Promise<AppHandle> => {
      if (manifestId === "beta") {
        throw new Error("launch refused");
      }
      return originalLaunch(manifestId);
    };
    currentKernel = kernel;

    const wrapper = mount(MobileShell, { attachTo: document.body });
    const icons = wrapper.findAllComponents(HomeScreenIcon);
    const alphaIcon = icons[0];
    const betaIcon = icons[1];
    const alphaEl = alphaIcon.element as HTMLButtonElement;

    alphaEl.focus();
    await alphaIcon.trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);

    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);

    // 3. Launch beta → rejects. lastLaunchedManifestId must NOT update.
    await betaIcon.trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);

    alphaEl.focus();
    await alphaIcon.trigger("click");
    await flushPromises();
    await nextTick();

    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    const liveAlpha = document.querySelector<HTMLButtonElement>(
      '.home-icon[data-manifest-id="alpha"]',
    );
    expect(liveAlpha).not.toBeNull();
    expect(document.activeElement).toBe(liveAlpha);

    wrapper.unmount();
  });

  it("mounts the AppSwitcher overlay when AppView emits `recents` (M1.3.1)", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(".app-switcher").exists()).toBe(false);

    await wrapper.find(".app-view__recents").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();
    expect(wrapper.find(".app-switcher").exists()).toBe(true);

    wrapper.unmount();
  });

  it("closes the AppSwitcher when it emits `close`", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    await wrapper.find(".app-view__recents").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();

    expect(wrapper.find(".app-switcher").exists()).toBe(true);

    await wrapper.find(".app-switcher__close").trigger("click");
    await nextTick();

    expect(wrapper.find(".app-switcher").exists()).toBe(false);

    wrapper.unmount();
  });

  it("M1.3.X-anim: opening the switcher KEEPS `app-view--foreground` on the underlying frame (no slide-out behind overlay)", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();

    const appViewBefore = wrapper.find("section.app-view");
    expect(appViewBefore.classes()).toContain("app-view--foreground");

    await wrapper.find(".app-view__recents").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();

    const appViewAfter = wrapper.find("section.app-view");
    expect(appViewAfter.attributes("aria-current")).toBeUndefined(); // a11y-inert
    expect(appViewAfter.classes()).toContain("app-view--foreground"); // animation stays put

    wrapper.unmount();
  });

  it("flips the AppView to `inert` + `aria-hidden` while the switcher is active (a11y isolation)", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    await wrapper.find(".app-view__recents").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();

    const appView = wrapper.find("section.app-view");
    expect(appView.attributes("aria-hidden")).toBe("true");
    expect(appView.attributes("inert")).toBeDefined();

    wrapper.unmount();
  });

  it("HomeScreen Recents FAB is hidden when no apps are alive", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });
    await nextTick();

    expect(wrapper.find(".home-screen__recents-fab").exists()).toBe(false);

    wrapper.unmount();
  });

  it("HomeScreen Recents FAB hides while an app is foreground and appears after back-suspend", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(".home-screen__recents-fab").exists()).toBe(false);

    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();
    expect(wrapper.find(".home-screen__recents-fab").exists()).toBe(true);

    wrapper.unmount();
  });

  it("HomeScreen Recents FAB opens the AppSwitcher (suspended apps reachable from home)", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    await wrapper.find(".home-screen__recents-fab").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();

    expect(wrapper.find(".app-switcher").exists()).toBe(true);

    wrapper.unmount();
  });

  it("M1.3.4 — tapping a switcher card brings that frame to the foreground and closes the switcher", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" }), manifest({ id: "beta", name: "Beta" })]);

    const wrapper = mount(MobileShell, { attachTo: document.body });
    const icons = wrapper.findAllComponents(HomeScreenIcon);

    await icons[0].trigger("click");
    await flushPromises();
    await nextTick();
    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();
    await icons[1].trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-manifest-id")).toBe("beta");

    await wrapper.find(".app-view__recents").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();
    expect(wrapper.find(".app-switcher").exists()).toBe(true);

    const cards = wrapper.findAll(".app-switcher-card");
    expect(cards.length).toBe(2);
    await cards[1].find(".app-switcher-card__select").trigger("click");
    await flushPromises();
    await nextTick();

    expect(wrapper.find(".app-switcher").exists()).toBe(false);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-manifest-id")).toBe("alpha");
    expect(wrapper.findAll("section.app-view").length).toBe(2);
    expect(currentKernel.processes.kill).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("M1.3.2 — dismissing the foreground card falls back and keeps the switcher open", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" }), manifest({ id: "beta", name: "Beta" })]);

    const wrapper = mount(MobileShell, { attachTo: document.body });
    const icons = wrapper.findAllComponents(HomeScreenIcon);

    await icons[0].trigger("click");
    await flushPromises();
    await nextTick();
    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();
    await icons[1].trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.findAll("section.app-view").length).toBe(2);
    expect(wrapper.find(FOREGROUND_APPVIEW).attributes("data-manifest-id")).toBe("beta");

    await wrapper.find(".app-view__recents").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();
    expect(wrapper.findAll(".app-switcher-card").length).toBe(2);

    const dismissButtons = wrapper.findAll(".app-switcher-card__dismiss");
    await dismissButtons[0].trigger("click");
    await flushPromises();
    await nextTick();

    expect(wrapper.findAll("section.app-view").length).toBe(1);
    expect(wrapper.find(".app-switcher").exists()).toBe(true);
    expect(wrapper.findAll(".app-switcher-card").length).toBe(1);
    expect(currentKernel.processes.kill).toHaveBeenCalledWith("h-2", "user");

    wrapper.unmount();
  });

  it("M1.3.2 — dismissing a background card splices it out, foreground stays put", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" }), manifest({ id: "beta", name: "Beta" })]);

    const wrapper = mount(MobileShell, { attachTo: document.body });
    const icons = wrapper.findAllComponents(HomeScreenIcon);

    await icons[0].trigger("click");
    await flushPromises();
    await nextTick();
    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();
    await icons[1].trigger("click");
    await flushPromises();
    await nextTick();

    await wrapper.find(".app-view__recents").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();
    expect(wrapper.findAll(".app-switcher-card").length).toBe(2);

    const dismissButtons = wrapper.findAll(".app-switcher-card__dismiss");
    await dismissButtons[1].trigger("click");
    await flushPromises();
    await nextTick();

    expect(wrapper.findAll("section.app-view").length).toBe(1);
    expect(wrapper.find(".app-switcher").exists()).toBe(true);
    expect(wrapper.findAll(".app-switcher-card").length).toBe(1);
    expect(currentKernel.processes.kill).toHaveBeenCalledWith("h-1", "user");

    expect(wrapper.find("section.app-view").attributes("data-handle-id")).toBe("h-2");

    wrapper.unmount();
  });

  it("M1.3.2 — dismissing the only remaining card drains the stack and auto-closes the switcher", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });

    await wrapper.findComponent(HomeScreenIcon).trigger("click");
    await flushPromises();
    await nextTick();
    await wrapper.find(".app-view__recents").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();
    expect(wrapper.find(".app-switcher").exists()).toBe(true);
    expect(wrapper.findAll(".app-switcher-card").length).toBe(1);

    await wrapper.find(".app-switcher-card__dismiss").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(wrapper.findAll("section.app-view").length).toBe(0);
    expect(wrapper.find(".app-switcher").exists()).toBe(false);
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);

    wrapper.unmount();
  });

  it("closes every running app from the AppSwitcher header action", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" }), manifest({ id: "beta", name: "Beta" })]);

    const wrapper = mount(MobileShell, { attachTo: document.body });
    const icons = wrapper.findAllComponents(HomeScreenIcon);

    await icons[0].trigger("click");
    await flushPromises();
    await nextTick();
    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();
    await icons[1].trigger("click");
    await flushPromises();
    await nextTick();

    await wrapper.find(".app-view__recents").trigger("click");
    await flushPromises();
    await flushPromises();
    await nextTick();
    expect(wrapper.findAll(".app-switcher-card").length).toBe(2);

    await wrapper.find(".app-switcher__dismiss-all").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(wrapper.findAll("section.app-view").length).toBe(0);
    expect(wrapper.find(".app-switcher").exists()).toBe(false);
    expect(currentKernel.processes.kill).toHaveBeenCalledTimes(2);
    expect(currentKernel.processes.kill).toHaveBeenNthCalledWith(1, "h-1", "user");
    expect(currentKernel.processes.kill).toHaveBeenNthCalledWith(2, "h-2", "user");

    wrapper.unmount();
  });

  it("restores focus to the launching HomeScreen icon after a back-suspend (foreground null transition)", async () => {
    const wrapper = mount(MobileShell, { attachTo: document.body });
    const icon = wrapper.findComponent(HomeScreenIcon);
    (icon.element as HTMLButtonElement).focus();

    await icon.trigger("click");
    await flushPromises();
    await nextTick();
    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(true);

    await wrapper.find(".app-view__back").trigger("click");
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(wrapper.find(FOREGROUND_APPVIEW).exists()).toBe(false);

    const liveIcon = document.querySelector<HTMLButtonElement>(
      '.home-icon[data-manifest-id="alpha"]',
    );
    expect(liveIcon).not.toBeNull();
    expect(document.activeElement).toBe(liveIcon);

    wrapper.unmount();
  });
});
