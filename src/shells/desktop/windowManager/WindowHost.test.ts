import { mount } from "@vue/test-utils";
import { defineComponent, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppHandle, AppManifest } from "~/types/app";
import type { CommandContext, CommandManifest } from "~/types/command";
import type { Kernel } from "~/types/kernel";

import WindowHost from "./WindowHost.vue";
import {
  DEFAULT_H,
  DEFAULT_W,
  __resetWindowManagerForTests,
  useWindowManager,
} from "./useWindowManager";

const StubIcon = defineComponent({ template: "<svg />" });

function manifest(id = "alpha", name = "Alpha"): AppManifest {
  return {
    id,
    name,
    icon: StubIcon as Component,
    category: "system",
    component: () => Promise.resolve({ default: defineComponent({ template: "<div />" }) }),
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

function makeKernel(): {
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
        list: () => [manifest(), manifest("finder", "Finder"), manifest("settings", "Settings")],
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

describe("WindowHost — F1 D3a (shell policy drop)", () => {
  beforeEach(() => {
    debugWarnSpy.mockReset();
    __resetWindowManagerForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetWindowManagerForTests();
  });

  it("emits one debugWarn + skips kernel.apps.launch when restore/focus wins AND args were supplied", async () => {
    const { kernel, launchSpy, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      global: {
        stubs: {
          Window: { template: "<div data-window-stub />" },
          SnapPreview: { template: "<div data-snap-preview-stub />" },
        },
      },
    });

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

    const wrapper = mount(WindowHost, {
      global: {
        stubs: {
          Window: { template: "<div data-window-stub />" },
          SnapPreview: { template: "<div data-snap-preview-stub />" },
        },
      },
    });

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

    const wrapper = mount(WindowHost, {
      global: {
        stubs: {
          Window: { template: "<div data-window-stub />" },
          SnapPreview: { template: "<div data-snap-preview-stub />" },
        },
      },
    });

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

  it("replays Finder reveal args after restoring a minimized Finder window", async () => {
    const { kernel, launchSpy, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      global: {
        stubs: {
          Window: { template: "<div data-window-stub />" },
          SnapPreview: { template: "<div data-snap-preview-stub />" },
        },
      },
    });

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

    const wrapper = mount(WindowHost, {
      global: {
        stubs: {
          Window: { template: "<div data-window-stub />" },
          SnapPreview: { template: "<div data-snap-preview-stub />" },
        },
      },
    });

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

  it("registers command-backed window actions", async () => {
    const { kernel, commands, bus } = makeKernel();
    kernelMock = kernel;

    const wrapper = mount(WindowHost, {
      global: {
        stubs: {
          Window: { template: "<div data-window-stub />" },
          SnapPreview: { template: "<div data-snap-preview-stub />" },
        },
      },
    });

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
});
