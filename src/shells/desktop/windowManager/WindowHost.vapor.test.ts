import { mountVaporTest as mount } from "~/test/mountVapor";
import { defineVaporComponent, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppHandle, AppManifest } from "~/types/app";
import type { CommandContext, CommandManifest } from "~/types/command";
import type { Kernel } from "~/types/kernel";

import WindowHost from "./WindowHost.vue";
import {
  DEFAULT_H,
  DEFAULT_W,
  TITLEBAR_HEIGHT,
  __resetWindowManagerForTests,
  useWindowManager,
} from "./useWindowManager";
import { clearDockReveal, setDockReveal } from "../dock/dockReveal";

const windowHostMocks = vi.hoisted(() => ({
  contentSize: null as { width: number; height: number } | null,
}));

vi.mock("./Window.vue", async () => {
  const { defineVaporComponent, onMounted } = await import("vue");
  return {
    default: defineVaporComponent(
      (props: { record: { id: string } }, { emit }) => {
        onMounted(() => {
          if (windowHostMocks.contentSize !== null) {
            emit("content-size:window", props.record.id, windowHostMocks.contentSize);
          }
        });
        const root = document.createElement("div");
        root.dataset.windowStub = "";
        return root;
      },
      { name: "WindowFixture", props: ["record"], emits: ["content-size:window"] },
    ),
  };
});

vi.mock("./SnapPreview.vue", async () => {
  const { defineVaporComponent } = await import("vue");
  return {
    default: defineVaporComponent(() => {
      const root = document.createElement("div");
      root.dataset.snapPreviewStub = "";
      return root;
    }),
  };
});

const StubIcon = defineVaporComponent(() =>
  document.createElementNS("http://www.w3.org/2000/svg", "svg"),
);
const StubApp = defineVaporComponent(() => document.createElement("div"));

function asEsm(component: Component): { default: Component } {
  return Object.assign(Object.create(null) as { default: Component }, {
    default: component,
    __esModule: true,
  });
}

function manifest(id = "alpha", name = "Alpha", overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id,
    name,
    icon: StubIcon,
    category: "system",
    component: () => Promise.resolve(asEsm(StubApp)),
    ...overrides,
  };
}

function makeBus(): {
  emitted: Array<{ channel: string; payload: Record<string, unknown> }>;
  emit: (channel: string, payload: Record<string, unknown>) => void;
  on: (channel: string, listener: (payload: Record<string, unknown>) => void) => () => void;
} {
  const listeners = new Map<string, Set<(payload: Record<string, unknown>) => void>>();
  const emitted: Array<{ channel: string; payload: Record<string, unknown> }> = [];
  return {
    emitted,
    emit(channel, payload) {
      emitted.push({ channel, payload });
      const set = listeners.get(channel);
      if (!set) {
        return;
      }
      for (const listener of set) {
        listener(payload);
      }
    },
    on(channel, listener) {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      set.add(listener);
      return (): void => {
        set?.delete(listener);
      };
    },
  };
}

const debugWarnSpy = vi.fn();

vi.mock("~/core/debug", () => ({
  debugWarn: (...args: unknown[]): void => debugWarnSpy(...args),
  debugLog: vi.fn(),
}));

let kernelMock: Pick<Kernel, "apps" | "commands" | "events" | "processes">;

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "apps" | "commands" | "events" | "processes"> {
    return kernelMock;
  },
}));

function makeKernel(
  manifests: readonly AppManifest[] = [
    manifest(),
    manifest("finder", "Finder"),
    manifest("settings", "Settings"),
  ],
): {
  kernel: Pick<Kernel, "apps" | "commands" | "events" | "processes">;
  launchSpy: ReturnType<typeof vi.fn>;
  commands: Map<string, CommandManifest>;
  bus: ReturnType<typeof makeBus>;
} {
  const bus = makeBus();
  const commands = new Map<string, CommandManifest>();
  const launchSpy = vi.fn(async (id: string): Promise<AppHandle> => {
    return {
      id: `handle-${id}-${Math.random().toString(36).slice(2, 7)}`,
      manifestId: id,
      on: () => () => undefined,
      postMessage: () => undefined,
    };
  });
  return {
    bus,
    commands,
    launchSpy,
    kernel: {
      apps: {
        list: () => [...manifests],
        register: vi.fn(),
        launch: launchSpy as unknown as Kernel["apps"]["launch"],
        unregister: vi.fn(),
      },
      events: {
        emit: bus.emit,
        on: bus.on,
        once: vi.fn(() => () => undefined),
        off: vi.fn(),
      } as unknown as Kernel["events"],
      commands: {
        register: vi.fn((manifest: CommandManifest) => {
          commands.set(manifest.id, manifest);
          return (): void => {
            commands.delete(manifest.id);
          };
        }),
        unregister: vi.fn((id: string) => {
          commands.delete(id);
        }),
        dispatch: vi.fn(async () => undefined),
        list: vi.fn(() => Array.from(commands.values())),
      },
      processes: {
        spawn: vi.fn(),
        kill: vi.fn(),
        suspend: vi.fn(),
        resume: vi.fn(),
        list: vi.fn(() => [][Symbol.iterator]()),
      } as unknown as Kernel["processes"],
    },
  };
}

function commandCtx(kernel: Kernel, payload: Record<string, unknown>): CommandContext {
  return {
    kernel,
    source: "menu",
    activeHandle: null,
    payload,
    signal: new AbortController().signal,
  };
}

function rect(bounds: { top: number; left: number; width: number; height: number }): DOMRect {
  return {
    x: bounds.left,
    y: bounds.top,
    top: bounds.top,
    left: bounds.left,
    right: bounds.left + bounds.width,
    bottom: bounds.top + bounds.height,
    width: bounds.width,
    height: bounds.height,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Registers a fake dock with the dock-reveal registry the window host reads.
 * `occupiesStage` mirrors a pinned/revealed dock; the measured rect stands in
 * for the live `.dock` geometry the real dock publishes.
 */
function registerDockFixture({
  occupiesStage,
  top = 820,
  height = 58,
}: {
  occupiesStage: boolean;
  top?: number;
  height?: number;
}): void {
  setDockReveal({ occupiesStage, measure: () => ({ top, height }) });
}

describe("WindowHost — F1 D3a (shell policy drop)", () => {
  beforeEach(() => {
    windowHostMocks.contentSize = null;
    debugWarnSpy.mockReset();
    __resetWindowManagerForTests();
    window.history.replaceState(null, "", "/");
    document.title = "WebOS";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetWindowManagerForTests();
    clearDockReveal();
    document.title = "WebOS";
  });

  it("emits one debugWarn + skips kernel.apps.launch when restore/focus wins AND args were supplied", async () => {
    const { kernel, launchSpy, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
      args: { initial: true },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(launchSpy).toHaveBeenCalledWith("alpha", { initial: true });

    debugWarnSpy.mockClear();

    // wins. Supplied args MUST be dropped + warned, kernel launch is
    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
      args: { second: true },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(launchSpy).toHaveBeenCalledTimes(1);

    const dropCalls = debugWarnSpy.mock.calls.filter(
      (call) => typeof call[1] === "string" && call[1].includes("dropping launch args"),
    );
    expect(dropCalls).toHaveLength(1);

    wrapper.unmount();
  });

  it("does NOT log the drop warning when restore/focus wins but no args were supplied (quiet common path)", async () => {
    const { kernel, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    debugWarnSpy.mockClear();

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const dropCalls = debugWarnSpy.mock.calls.filter(
      (call) => typeof call[1] === "string" && call[1].includes("dropping launch args"),
    );
    expect(dropCalls).toHaveLength(0);

    wrapper.unmount();
  });

  it("centers newly opened deeplink windows inside the desktop stage", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 700,
      width: 1000,
      height: 700,
      toJSON: () => ({}),
    } as DOMRect);

    const { kernel, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "deeplink",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "alpha");
    expect(record).toBeDefined();
    expect(record!.x).toBe(Math.floor((1000 - DEFAULT_W) / 2));
    expect(record!.y).toBe(Math.floor((700 - DEFAULT_H) / 2));

    wrapper.unmount();
  });

  it("syncs the browser URL to the focused desktop app fallback path", async () => {
    const { kernel, bus } = makeKernel([manifest("alpha", "Alpha"), manifest("beta", "Beta")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(window.location.pathname).toBe("/apps/alpha");
    expect(document.title).toBe("Alpha - WebOS");

    const manager = useWindowManager();
    const alpha = manager.windows.find((entry) => entry.manifestId === "alpha");
    expect(alpha).toBeDefined();
    manager.setTitle(alpha!.id, "Alpha Document");
    await wrapper.vm.$nextTick();

    expect(document.title).toBe("Alpha Document - WebOS");

    bus.emit("app.launch.requested", {
      manifestId: "beta",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(window.location.pathname).toBe("/apps/beta");
    expect(document.title).toBe("Beta - WebOS");

    wrapper.unmount();
  });

  it("syncs the browser URL home when no desktop window is focused", async () => {
    const { kernel, bus } = makeKernel([manifest("alpha", "Alpha")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "alpha");
    expect(record).toBeDefined();
    expect(window.location.pathname).toBe("/apps/alpha");
    expect(document.title).toBe("Alpha - WebOS");

    manager.minimize(record!.id);
    await wrapper.vm.$nextTick();

    expect(window.location.pathname).toBe("/");
    expect(document.title).toBe("WebOS");

    manager.restore(record!.id);
    await wrapper.vm.$nextTick();

    expect(window.location.pathname).toBe("/apps/alpha");
    expect(document.title).toBe("Alpha - WebOS");

    manager.close(record!.id);
    await wrapper.vm.$nextTick();

    expect(window.location.pathname).toBe("/");
    expect(document.title).toBe("WebOS");

    wrapper.unmount();
  });

  it("falls back to desktop window title and manifest id for browser titles", async () => {
    const { kernel } = makeKernel([]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    const manager = useWindowManager();
    manager.open({ manifestId: "ghost", handleId: "h-ghost", title: "Ghost Title" });
    await wrapper.vm.$nextTick();

    expect(document.title).toBe("Ghost Title - WebOS");

    manager.open({ manifestId: "blank", handleId: "h-blank", title: "" });
    await wrapper.vm.$nextTick();

    expect(document.title).toBe("blank - WebOS");

    wrapper.unmount();
  });

  it("stores custom app URLs and restores them when the window is refocused", async () => {
    const { kernel, bus } = makeKernel([manifest("blog", "Blog"), manifest("alpha", "Alpha")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "blog",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const blog = manager.windows.find((entry) => entry.manifestId === "blog");
    expect(blog).toBeDefined();
    expect(window.location.pathname).toBe("/apps/blog");
    expect(document.title).toBe("Blog - WebOS");

    bus.emit("app.url.changed", {
      manifestId: "blog",
      handleId: blog!.handleId,
      path: "/blog/moving-apps-out-of-the-shell",
    });
    await wrapper.vm.$nextTick();

    expect(window.location.pathname).toBe("/blog/moving-apps-out-of-the-shell");
    expect(document.title).toBe("Blog - WebOS");

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(window.location.pathname).toBe("/apps/alpha");
    expect(document.title).toBe("Alpha - WebOS");

    manager.focus(blog!.id);
    await wrapper.vm.$nextTick();

    expect(window.location.pathname).toBe("/blog/moving-apps-out-of-the-shell");
    expect(document.title).toBe("Blog - WebOS");

    wrapper.unmount();
  });

  it("falls back to the generic app URL for invalid custom app URLs", async () => {
    const { kernel, bus } = makeKernel([manifest("blog", "Blog")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "blog",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const blog = manager.windows.find((entry) => entry.manifestId === "blog");
    expect(blog).toBeDefined();

    bus.emit("app.url.changed", {
      manifestId: "blog",
      handleId: blog!.handleId,
      path: "https://example.test/blog/bad",
    });
    await wrapper.vm.$nextTick();

    expect(window.location.pathname).toBe("/apps/blog");

    wrapper.unmount();
  });

  it("maximizes Blog deeplink windows to the desktop stage", async () => {
    const { kernel, bus } = makeKernel([
      manifest("blog", "Blog", {
        defaultWindow: { width: 720, height: 520, centered: true },
      }),
    ]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      attachTo: document.body,
    });

    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(
      rect({ top: 0, left: 0, width: 1200, height: 800 }),
    );

    bus.emit("app.launch.requested", {
      manifestId: "blog",
      source: "deeplink",
      args: {
        path: "/home/posts/moving-apps-out-of-the-shell.md",
        slug: "moving-apps-out-of-the-shell",
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "blog");
    expect(record).toBeDefined();
    expect(record!.maximized).toBe(true);
    expect(record!.snap).toBe("max");
    expect(record!.x).toBe(0);
    expect(record!.y).toBe(0);
    expect(record!.width).toBe(1200);
    expect(record!.height).toBe(800);
    expect(record!.preMaximize).toEqual({
      x: Math.floor((1200 - 720) / 2),
      y: Math.floor((800 - 520) / 2),
      width: 720,
      height: 520,
    });

    wrapper.unmount();
  });

  it("keeps non-deeplink Blog launches at the default window size", async () => {
    const { kernel, bus } = makeKernel([
      manifest("blog", "Blog", {
        defaultWindow: { width: 720, height: 520, centered: true },
      }),
    ]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      attachTo: document.body,
    });

    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(
      rect({ top: 0, left: 0, width: 1200, height: 800 }),
    );

    bus.emit("app.launch.requested", {
      manifestId: "blog",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "blog");
    expect(record).toBeDefined();
    expect(record!.maximized).toBe(false);
    expect(record!.snap).toBeUndefined();
    expect(record!.width).toBe(720);
    expect(record!.height).toBe(520);

    wrapper.unmount();
  });

  it("maximizes an existing Blog window for deeplinks and replays the post intent", async () => {
    const { kernel, launchSpy, bus } = makeKernel([
      manifest("blog", "Blog", {
        defaultWindow: { width: 720, height: 520, centered: true },
      }),
    ]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      attachTo: document.body,
    });

    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(
      rect({ top: 0, left: 0, width: 1200, height: 800 }),
    );

    bus.emit("app.launch.requested", {
      manifestId: "blog",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const existing = manager.windows.find((entry) => entry.manifestId === "blog");
    expect(existing).toBeDefined();
    expect(existing!.maximized).toBe(false);

    bus.emit("app.launch.requested", {
      manifestId: "blog",
      source: "deeplink",
      args: {
        path: "/home/posts/moving-apps-out-of-the-shell.md",
        slug: "moving-apps-out-of-the-shell",
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(manager.windows.filter((entry) => entry.manifestId === "blog")).toHaveLength(1);

    const maxed = manager.windows.find((entry) => entry.id === existing!.id)!;
    expect(maxed.maximized).toBe(true);
    expect(maxed.snap).toBe("max");
    expect(maxed.x).toBe(0);
    expect(maxed.y).toBe(0);
    expect(maxed.width).toBe(1200);
    expect(maxed.height).toBe(800);
    expect(bus.emitted).toContainEqual({
      channel: "blog.open.requested",
      payload: {
        source: "deeplink",
        path: "/home/posts/moving-apps-out-of-the-shell.md",
        slug: "moving-apps-out-of-the-shell",
      },
    });

    wrapper.unmount();
  });

  it("resizes a deeplink window from its top-left when the app requests a content size", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      rect({ top: 0, left: 0, width: 1000, height: 700 }),
    );

    windowHostMocks.contentSize = { width: 720, height: 540 };
    const { kernel, bus } = makeKernel([
      manifest("youtube-player", "YouTube Player", {
        defaultWindow: { width: 960, height: 540, centered: true },
      }),
    ]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      attachTo: document.body,
    });

    bus.emit("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "fY6h5FBTZM8" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "youtube-player");
    expect(record).toBeDefined();
    expect(record!.width).toBe(720);
    expect(record!.height).toBe(540 + TITLEBAR_HEIGHT);
    expect(record!.x).toBe(Math.floor((1000 - 960) / 2));
    expect(record!.y).toBe(Math.floor((700 - 540) / 2));

    wrapper.unmount();
  });

  it("maximizes above a visible desktop dock", async () => {
    registerDockFixture({ occupiesStage: true });
    const { kernel, commands, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      attachTo: document.body,
    });

    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(
      rect({ top: 28, left: 0, width: 1000, height: 872 }),
    );

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "alpha");
    expect(record).toBeDefined();

    await commands
      .get("desktop:window.toggleMaximize")!
      .run(commandCtx(kernel as Kernel, { windowId: record!.id }));

    const maxed = manager.windows.find((entry) => entry.id === record!.id)!;
    expect(maxed.maximized).toBe(true);
    expect(maxed.x).toBe(0);
    expect(maxed.y).toBe(0);
    expect(maxed.width).toBe(1000);
    expect(maxed.height).toBe(792);

    wrapper.unmount();
  });

  it("keeps maximized bounds when an auto-hidden dock conceals after maximize", async () => {
    registerDockFixture({ occupiesStage: true });
    const { kernel, commands, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      attachTo: document.body,
    });

    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(
      rect({ top: 28, left: 0, width: 1000, height: 872 }),
    );

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "alpha");
    expect(record).toBeDefined();

    await commands
      .get("desktop:window.toggleMaximize")!
      .run(commandCtx(kernel as Kernel, { windowId: record!.id }));

    const maxed = manager.windows.find((entry) => entry.id === record!.id)!;
    expect(maxed.height).toBe(792);

    registerDockFixture({ occupiesStage: false });
    await wrapper.vm.$nextTick();

    const afterDockHide = manager.windows.find((entry) => entry.id === record!.id)!;
    expect(afterDockHide.height).toBe(792);

    wrapper.unmount();
  });

  it("maximizes to the full desktop stage when the auto-hidden dock is concealed", async () => {
    registerDockFixture({ occupiesStage: false });
    const { kernel, commands, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      attachTo: document.body,
    });

    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(
      rect({ top: 28, left: 0, width: 1000, height: 872 }),
    );

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "alpha");
    expect(record).toBeDefined();

    await commands
      .get("desktop:window.toggleMaximize")!
      .run(commandCtx(kernel as Kernel, { windowId: record!.id }));

    const maxed = manager.windows.find((entry) => entry.id === record!.id)!;
    expect(maxed.height).toBe(872);

    wrapper.unmount();
  });

  it("replays Finder reveal args after restoring a minimized Finder window", async () => {
    const { kernel, launchSpy, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "finder",
      source: "spotlight",
      args: { path: "/portfolio", reveal: "/portfolio/about.md" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const finderWindow = manager.windows.find((record) => record.manifestId === "finder");
    expect(finderWindow).toBeDefined();
    manager.minimize(finderWindow!.id);
    debugWarnSpy.mockClear();

    bus.emit("app.launch.requested", {
      manifestId: "finder",
      source: "spotlight",
      args: { path: "/portfolio", reveal: "/portfolio/about.md" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(bus.emitted).toContainEqual({
      channel: "finder.reveal.requested",
      payload: { path: "/portfolio", reveal: "/portfolio/about.md", source: "spotlight" },
    });
    expect(
      debugWarnSpy.mock.calls.some(
        (call) => typeof call[1] === "string" && call[1].includes("dropping launch args"),
      ),
    ).toBe(false);

    wrapper.unmount();
  });

  it("replays Settings section args when Settings is already open", async () => {
    const { kernel, launchSpy, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "settings",
      source: "menu",
      args: { section: "background" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    bus.emit("app.launch.requested", {
      manifestId: "settings",
      source: "menu",
      args: { section: "dock" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(bus.emitted).toContainEqual({
      channel: "settings.section.requested",
      payload: { section: "dock" },
    });
    expect(
      debugWarnSpy.mock.calls.some(
        (call) => typeof call[1] === "string" && call[1].includes("dropping launch args"),
      ),
    ).toBe(false);

    wrapper.unmount();
  });

  it("replays YouTube Player deeplink args when the player is already open", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("youtube-player", "YouTube Player")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "IQsLEaj89bg" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const playerWindow = manager.windows.find((record) => record.manifestId === "youtube-player");
    expect(playerWindow).toBeDefined();
    debugWarnSpy.mockClear();

    bus.emit("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "M7lc1UVf-VE" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(manager.windows.find((record) => record.id === playerWindow!.id)?.args).toEqual({
      videoId: "M7lc1UVf-VE",
    });
    expect(manager.windows.find((record) => record.id === playerWindow!.id)?.argsRevision).toBe(1);
    expect(bus.emitted).toContainEqual({
      channel: "youtube-player.open.requested",
      payload: {
        handleId: playerWindow!.handleId,
        source: "deeplink",
        videoId: "M7lc1UVf-VE",
      },
    });
    expect(
      debugWarnSpy.mock.calls.some(
        (call) => typeof call[1] === "string" && call[1].includes("dropping launch args"),
      ),
    ).toBe(false);

    wrapper.unmount();
  });

  it("does not bump YouTube Player args revision for repeated same deeplink args", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("youtube-player", "YouTube Player")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "fY6h5FBTZM8" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const playerWindow = manager.windows.find((record) => record.manifestId === "youtube-player");
    expect(playerWindow).toBeDefined();
    expect(playerWindow!.argsRevision).toBe(0);

    bus.emit("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "fY6h5FBTZM8" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(manager.windows.find((record) => record.id === playerWindow!.id)?.argsRevision).toBe(0);
    expect(bus.emitted).toContainEqual({
      channel: "youtube-player.open.requested",
      payload: {
        handleId: playerWindow!.handleId,
        source: "deeplink",
        videoId: "fY6h5FBTZM8",
      },
    });

    wrapper.unmount();
  });

  it("does not bump YouTube Player args revision when the same video resumes through URL args", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("youtube-player", "YouTube Player")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "fY6h5FBTZM8" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const playerWindow = manager.windows.find((record) => record.manifestId === "youtube-player");
    expect(playerWindow).toBeDefined();
    expect(playerWindow!.argsRevision).toBe(0);

    bus.emit("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { url: "https://www.youtube.com/watch?v=fY6h5FBTZM8" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(manager.windows.find((record) => record.id === playerWindow!.id)?.args).toEqual({
      videoId: "fY6h5FBTZM8",
    });
    expect(manager.windows.find((record) => record.id === playerWindow!.id)?.argsRevision).toBe(0);
    expect(bus.emitted).toContainEqual({
      channel: "youtube-player.open.requested",
      payload: {
        handleId: playerWindow!.handleId,
        source: "deeplink",
        url: "https://www.youtube.com/watch?v=fY6h5FBTZM8",
      },
    });

    wrapper.unmount();
  });

  it("replays YouTube Player URL deeplink args when the player is already open", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("youtube-player", "YouTube Player")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "M7lc1UVf-VE" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const playerWindow = manager.windows.find((record) => record.manifestId === "youtube-player");
    expect(playerWindow).toBeDefined();
    debugWarnSpy.mockClear();

    bus.emit("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { url: "https://www.youtube.com/watch?v=u8vJjTH9Igg" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(manager.windows.find((record) => record.id === playerWindow!.id)?.args).toEqual({
      url: "https://www.youtube.com/watch?v=u8vJjTH9Igg",
    });
    expect(manager.windows.find((record) => record.id === playerWindow!.id)?.argsRevision).toBe(1);
    expect(bus.emitted).toContainEqual({
      channel: "youtube-player.open.requested",
      payload: {
        handleId: playerWindow!.handleId,
        source: "deeplink",
        url: "https://www.youtube.com/watch?v=u8vJjTH9Igg",
      },
    });
    expect(
      debugWarnSpy.mock.calls.some(
        (call) => typeof call[1] === "string" && call[1].includes("dropping launch args"),
      ),
    ).toBe(false);

    wrapper.unmount();
  });

  it("replays app settings pane args when a settings-enabled app is already open", async () => {
    const { kernel, launchSpy, bus } = makeKernel([
      manifest("calendar", "Calendar", { settings: {} }),
    ]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "calendar",
      source: "menu",
      args: { pane: "settings" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "calendar");
    expect(record).toBeDefined();

    bus.emit("app.launch.requested", {
      manifestId: "calendar",
      source: "menu",
      args: { pane: "settings" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(bus.emitted).toContainEqual({
      channel: "app.settings.requested",
      payload: { manifestId: "calendar", handleId: record!.handleId },
    });
    expect(
      debugWarnSpy.mock.calls.some(
        (call) => typeof call[1] === "string" && call[1].includes("dropping launch args"),
      ),
    ).toBe(false);

    wrapper.unmount();
  });

  it("focuses an Editor window that is already editing the requested path", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("editor", "Editor")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.spawn.new", {
      manifestId: "editor",
      source: "api",
      args: { path: "/home/a.md" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    bus.emit("app.spawn.new", {
      manifestId: "editor",
      source: "api",
      args: { path: "/home/b.md" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const [a, b] = manager.windows.filter((entry) => entry.manifestId === "editor");
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    bus.emit("app.document.changed", {
      manifestId: "editor",
      handleId: a!.handleId,
      path: "/home/a.md",
    });
    bus.emit("app.document.changed", {
      manifestId: "editor",
      handleId: b!.handleId,
      path: "/home/b.md",
    });
    manager.minimize(b!.id);

    bus.emit("editor.open.requested", {
      source: "api",
      path: "/home/a.md",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(2);
    expect(manager.windows.find((entry) => entry.id === a!.id)?.focused).toBe(true);
    expect(manager.windows.find((entry) => entry.id === b!.id)?.minimized).toBe(true);

    wrapper.unmount();
  });

  it("reuses a confirmed-empty Editor window when no matching path exists", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("editor", "Editor")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.spawn.new", {
      manifestId: "editor",
      source: "api",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const empty = manager.windows.find((entry) => entry.manifestId === "editor");
    expect(empty).toBeDefined();
    bus.emit("app.document.changed", {
      manifestId: "editor",
      handleId: empty!.handleId,
      path: null,
    });

    bus.emit("editor.open.requested", {
      source: "api",
      path: "/home/new.md",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(manager.windows.find((entry) => entry.id === empty!.id)?.focused).toBe(true);
    expect(bus.emitted).toContainEqual({
      channel: "editor.window.open.requested",
      payload: { handleId: empty!.handleId, path: "/home/new.md" },
    });

    wrapper.unmount();
  });

  it("opens a new Editor window when no matching or empty Editor exists", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("editor", "Editor")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.spawn.new", {
      manifestId: "editor",
      source: "api",
      args: { path: "/home/a.md" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const existing = manager.windows.find((entry) => entry.manifestId === "editor");
    expect(existing).toBeDefined();
    bus.emit("app.document.changed", {
      manifestId: "editor",
      handleId: existing!.handleId,
      path: "/home/a.md",
    });

    bus.emit("editor.open.requested", {
      source: "api",
      path: "/home/b.md",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(2);
    expect(launchSpy).toHaveBeenLastCalledWith("editor", { path: "/home/b.md" });
    expect(manager.windows.filter((entry) => entry.manifestId === "editor")).toHaveLength(2);

    wrapper.unmount();
  });

  it("does not reuse an Editor window as empty until it reports a null document path", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("editor", "Editor")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.spawn.new", {
      manifestId: "editor",
      source: "api",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    expect(manager.windows.filter((entry) => entry.manifestId === "editor")).toHaveLength(1);

    bus.emit("editor.open.requested", {
      source: "api",
      path: "/home/new.md",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(2);
    expect(manager.windows.filter((entry) => entry.manifestId === "editor")).toHaveLength(2);
    expect(
      bus.emitted.some(
        (entry) =>
          entry.channel === "editor.window.open.requested" && entry.payload.path === "/home/new.md",
      ),
    ).toBe(false);

    wrapper.unmount();
  });

  it("focuses a Blog window that is already showing the requested post", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("blog", "Blog")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.spawn.new", {
      manifestId: "blog",
      source: "api",
      args: { path: "/home/posts/a.md", slug: "a" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    bus.emit("app.spawn.new", {
      manifestId: "blog",
      source: "api",
      args: { path: "/home/posts/b.md", slug: "b" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const [a, b] = manager.windows.filter((entry) => entry.manifestId === "blog");
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    bus.emit("app.document.changed", {
      manifestId: "blog",
      handleId: a!.handleId,
      path: "/home/posts/a.md",
    });
    bus.emit("app.document.changed", {
      manifestId: "blog",
      handleId: b!.handleId,
      path: "/home/posts/b.md",
    });
    manager.minimize(b!.id);

    bus.emit("blog.post.open.requested", {
      source: "api",
      path: "/home/posts/a.md",
      slug: "a",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(2);
    expect(manager.windows.find((entry) => entry.id === a!.id)?.focused).toBe(true);
    expect(manager.windows.find((entry) => entry.id === b!.id)?.minimized).toBe(true);
    expect(bus.emitted.some((entry) => entry.channel === "blog.open.requested")).toBe(false);

    wrapper.unmount();
  });

  it("opens a new Blog window when no Blog window is showing the requested post", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("blog", "Blog")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.spawn.new", {
      manifestId: "blog",
      source: "api",
      args: { path: "/home/posts/a.md", slug: "a" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const existing = manager.windows.find((entry) => entry.manifestId === "blog");
    expect(existing).toBeDefined();
    bus.emit("app.document.changed", {
      manifestId: "blog",
      handleId: existing!.handleId,
      path: "/home/posts/a.md",
    });

    bus.emit("blog.post.open.requested", {
      source: "api",
      path: "/home/posts/b.md",
      slug: "b",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(2);
    expect(launchSpy).toHaveBeenLastCalledWith("blog", {
      path: "/home/posts/b.md",
      slug: "b",
    });
    expect(manager.windows.filter((entry) => entry.manifestId === "blog")).toHaveLength(2);
    expect(bus.emitted.some((entry) => entry.channel === "blog.open.requested")).toBe(false);

    wrapper.unmount();
  });

  it("focuses a PDF Viewer window that is already showing the requested file", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("pdf-viewer", "PDF Viewer")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.spawn.new", {
      manifestId: "pdf-viewer",
      source: "api",
      args: { path: "/docs/a.pdf" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    bus.emit("app.spawn.new", {
      manifestId: "pdf-viewer",
      source: "api",
      args: { path: "/docs/b.pdf" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const [a, b] = manager.windows.filter((entry) => entry.manifestId === "pdf-viewer");
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    bus.emit("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: a!.handleId,
      path: "/docs/a.pdf",
    });
    bus.emit("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: b!.handleId,
      path: "/docs/b.pdf",
    });
    manager.minimize(b!.id);

    bus.emit("pdf-viewer.open.requested", {
      source: "api",
      path: "/docs/a.pdf",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(2);
    expect(manager.windows.find((entry) => entry.id === a!.id)?.focused).toBe(true);
    expect(manager.windows.find((entry) => entry.id === b!.id)?.minimized).toBe(true);

    wrapper.unmount();
  });

  it("opens a new PDF Viewer window when no window is showing the requested file", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("pdf-viewer", "PDF Viewer")]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.spawn.new", {
      manifestId: "pdf-viewer",
      source: "api",
      args: { path: "/docs/a.pdf" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const existing = manager.windows.find((entry) => entry.manifestId === "pdf-viewer");
    expect(existing).toBeDefined();
    bus.emit("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: existing!.handleId,
      path: "/docs/a.pdf",
    });

    bus.emit("pdf-viewer.open.requested", {
      source: "api",
      path: "/docs/b.pdf",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(2);
    expect(launchSpy).toHaveBeenLastCalledWith("pdf-viewer", {
      path: "/docs/b.pdf",
    });
    expect(manager.windows.filter((entry) => entry.manifestId === "pdf-viewer")).toHaveLength(2);

    wrapper.unmount();
  });

  it("replays Finder deeplink path args after focusing an existing Finder window", async () => {
    const { kernel, launchSpy, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "finder",
      source: "deeplink",
      args: { path: "/portfolio/posts/field-notes.md" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    bus.emit("app.launch.requested", {
      manifestId: "finder",
      source: "deeplink",
      args: { path: "/portfolio/posts/field-notes.md" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(bus.emitted).toContainEqual({
      channel: "finder.reveal.requested",
      payload: { path: "/portfolio/posts/field-notes.md", source: "deeplink" },
    });

    wrapper.unmount();
  });

  it("registers command-backed window actions", async () => {
    const { kernel, commands, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "alpha");
    expect(record).toBeDefined();

    await commands
      .get("desktop:window.minimize")!
      .run(commandCtx(kernel as Kernel, { windowId: record!.id }));
    expect(manager.windows.find((entry) => entry.id === record!.id)?.minimized).toBe(true);

    manager.restore(record!.id);
    await commands
      .get("desktop:window.toggleMaximize")!
      .run(commandCtx(kernel as Kernel, { windowId: record!.id }));
    expect(manager.windows.find((entry) => entry.id === record!.id)?.maximized).toBe(true);

    await commands
      .get("desktop:window.close")!
      .run(commandCtx(kernel as Kernel, { windowId: record!.id }));
    expect(manager.windows.some((entry) => entry.id === record!.id)).toBe(false);

    wrapper.unmount();
  });

  it("registers a command-backed app settings window action", async () => {
    const { kernel, commands, bus } = makeKernel([
      manifest("calendar", "Calendar", { settings: {} }),
    ]);
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "calendar",
      source: "dock",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "calendar");
    expect(record).toBeDefined();

    await commands
      .get("desktop:window.openSettings")!
      .run(commandCtx(kernel as Kernel, { windowId: record!.id }));

    expect(bus.emitted).toContainEqual({
      channel: "app.settings.requested",
      payload: { manifestId: "calendar", handleId: record!.handleId },
    });

    wrapper.unmount();
  });

  it("removes a window when its process is killed outside the window manager", async () => {
    const { kernel, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost);

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "api",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const manager = useWindowManager();
    const record = manager.windows.find((entry) => entry.manifestId === "alpha");
    expect(record).toBeDefined();

    bus.emit("app.killed", {
      manifestId: "alpha",
      handleId: record!.handleId,
      reason: "kernel",
    });
    await wrapper.vm.$nextTick();

    expect(manager.windows.some((entry) => entry.handleId === record!.handleId)).toBe(false);
    expect(kernel.processes.kill).not.toHaveBeenCalledWith(record!.handleId);

    wrapper.unmount();
  });
});
