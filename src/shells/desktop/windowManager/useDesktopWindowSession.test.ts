import { defineVaporComponent, effectScope, nextTick, reactive, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppHandle, AppManifest } from "~/types/app";
import type { CommandContext, CommandManifest } from "~/types/command";
import type { Kernel } from "~/types/kernel";

import {
  DEFAULT_H,
  DEFAULT_W,
  TITLEBAR_HEIGHT,
  __resetWindowManagerForTests,
} from "./useWindowManager";
import {
  useDesktopWindowSession,
  type DesktopWindowSession,
  type DesktopWindowStageAdapter,
} from "./useDesktopWindowSession";

const debugWarnSpy = vi.hoisted(() => vi.fn());

vi.mock("~/core/debug", () => ({
  debugWarn: (...args: unknown[]): void => debugWarnSpy(...args),
  debugLog: vi.fn(),
}));

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
      for (const listener of listeners.get(channel) ?? []) {
        listener(payload);
      }
    },
    on(channel, listener) {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(listener);
      listeners.set(channel, channelListeners);
      return (): void => {
        channelListeners.delete(listener);
      };
    },
  };
}

function makeKernel(
  manifests: readonly AppManifest[] = [
    manifest(),
    manifest("finder", "Finder"),
    manifest("settings", "Settings"),
  ],
): {
  kernel: Kernel;
  launchSpy: ReturnType<typeof vi.fn>;
  commands: Map<string, CommandManifest>;
  bus: ReturnType<typeof makeBus>;
} {
  const bus = makeBus();
  const commands = new Map<string, CommandManifest>();
  let handleSequence = 0;
  const launchSpy = vi.fn(async (id: string): Promise<AppHandle> => {
    handleSequence += 1;
    return {
      id: `handle-${id}-${handleSequence.toString()}`,
      manifestId: id,
      on: () => () => undefined,
      postMessage: () => undefined,
    };
  });

  const kernel = {
    apps: {
      list: () => [...manifests],
      register: vi.fn(),
      launch: launchSpy,
      unregister: vi.fn(),
    },
    events: {
      emit: bus.emit,
      on: bus.on,
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
    commands: {
      register: vi.fn((command: CommandManifest) => {
        commands.set(command.id, command);
        return (): void => {
          commands.delete(command.id);
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
    },
  } as unknown as Kernel;

  return { kernel, launchSpy, commands, bus };
}

function makeStage(
  options: {
    width?: number;
    height?: number;
    maximizeHeight?: number;
    centered?: { x: number; y: number };
  } = {},
): DesktopWindowStageAdapter & {
  stageBounds: { width: number; height: number };
  centeredInitialPosition: ReturnType<
    typeof vi.fn<DesktopWindowStageAdapter["centeredInitialPosition"]>
  >;
} {
  const width = options.width ?? 1000;
  const height = options.height ?? 700;
  const stageBounds = reactive({ width, height });
  const centeredInitialPosition = vi.fn<DesktopWindowStageAdapter["centeredInitialPosition"]>(
    (source) => (source === "deeplink" ? (options.centered ?? { x: 40, y: 50 }) : undefined),
  );

  return {
    stageBounds,
    centeredInitialPosition,
    maximizeStageSize: () => ({
      width: stageBounds.width,
      height: options.maximizeHeight ?? stageBounds.height,
    }),
    measuredStageSize: () => ({ width: stageBounds.width, height: stageBounds.height }),
    stageForSnap: (edge) =>
      edge === "max"
        ? { width: stageBounds.width, height: options.maximizeHeight ?? stageBounds.height }
        : stageBounds,
  };
}

function createSession(
  kernel: Kernel,
  stage = makeStage(),
): {
  session: DesktopWindowSession;
  stage: DesktopWindowStageAdapter;
  notifyLaunchFailed: ReturnType<typeof vi.fn>;
  notifyUnavailable: ReturnType<typeof vi.fn>;
  dispose: () => void;
} {
  const scope = effectScope();
  const notifyLaunchFailed = vi.fn();
  const notifyUnavailable = vi.fn();
  const session = scope.run(() =>
    useDesktopWindowSession({
      kernel,
      stage,
      notifyLaunchFailed,
      notifyUnavailable,
    }),
  );

  if (session === undefined) {
    throw new Error("Desktop window session failed to initialize");
  }

  return {
    session,
    stage,
    notifyLaunchFailed,
    notifyUnavailable,
    dispose: () => scope.stop(),
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

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

describe("desktop window session", () => {
  const disposers: Array<() => void> = [];

  beforeEach(() => {
    debugWarnSpy.mockReset();
    __resetWindowManagerForTests();
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0)) {
      dispose();
    }
    __resetWindowManagerForTests();
    vi.restoreAllMocks();
  });

  function track(fixture: ReturnType<typeof createSession>): ReturnType<typeof createSession> {
    disposers.push(fixture.dispose);
    return fixture;
  }

  it("owns restore → focus → launch ordering behind send()", async () => {
    const { kernel, launchSpy } = makeKernel();
    const { session } = track(createSession(kernel));

    session.send({
      type: "launch-app",
      manifestId: "alpha",
      source: "dock",
      args: { initial: true },
    });
    await settle();

    const opened = session.state.value.windows[0];
    expect(opened).toBeDefined();
    expect(launchSpy).toHaveBeenCalledTimes(1);

    session.send({ type: "minimize-window", windowId: opened!.id });
    session.send({
      type: "launch-app",
      manifestId: "alpha",
      source: "dock",
      args: { restored: true },
    });
    await settle();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(session.state.value.windows).toHaveLength(1);
    expect(session.state.value.windows[0]?.minimized).toBe(false);
    expect(session.state.value.windows[0]?.focused).toBe(true);
    expect(
      debugWarnSpy.mock.calls.some(
        (call) => typeof call[1] === "string" && call[1].includes("dropping launch args"),
      ),
    ).toBe(true);

    debugWarnSpy.mockClear();
    session.send({ type: "launch-app", manifestId: "alpha", source: "dock" });
    await settle();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(
      debugWarnSpy.mock.calls.some(
        (call) => typeof call[1] === "string" && call[1].includes("dropping launch args"),
      ),
    ).toBe(false);
  });

  it("creates and maximizes Blog deeplinks using only stage measurements from the adapter", async () => {
    const { kernel } = makeKernel([
      manifest("blog", "Blog", {
        defaultWindow: { width: 720, height: 520 },
      }),
    ]);
    const stage = makeStage({
      width: 1200,
      height: 800,
      maximizeHeight: 742,
      centered: { x: 240, y: 140 },
    });
    const { session } = track(createSession(kernel, stage));

    session.send({
      type: "launch-app",
      manifestId: "blog",
      source: "deeplink",
      args: { path: "/home/posts/a.md", slug: "a" },
    });
    await settle();

    expect(stage.centeredInitialPosition).toHaveBeenCalledWith("deeplink", {
      width: 720,
      height: 520,
    });
    expect(session.state.value.windows[0]).toMatchObject({
      manifestId: "blog",
      maximized: true,
      snap: "max",
      x: 0,
      y: 0,
      width: 1200,
      height: 742,
      preMaximize: { x: 240, y: 140, width: 720, height: 520 },
    });
  });

  it("derives browser chrome state from the focused window", async () => {
    const { kernel } = makeKernel([manifest("blog", "Blog"), manifest("alpha", "Alpha")]);
    const { session } = track(createSession(kernel));

    expect(session.state.value.browserPath).toBe("/");
    expect(session.state.value.browserTitle).toBe("WebOS");

    session.send({ type: "launch-app", manifestId: "blog", source: "dock" });
    await settle();
    const blog = session.state.value.windows.find((window) => window.manifestId === "blog")!;

    session.send({
      type: "set-browser-path",
      handleId: blog.handleId,
      manifestId: "blog",
      path: "/blog/a",
    });
    session.send({ type: "set-title", windowId: blog.id, title: "Article A" });

    expect(session.state.value.browserPath).toBe("/blog/a");
    expect(session.state.value.browserTitle).toBe("Article A - WebOS");

    session.send({ type: "launch-app", manifestId: "alpha", source: "dock" });
    await settle();
    expect(session.state.value.browserPath).toBe("/apps/alpha");

    session.send({ type: "focus-window", windowId: blog.id });
    expect(session.state.value.browserPath).toBe("/blog/a");

    session.send({ type: "minimize-window", windowId: blog.id });
    const alpha = session.state.value.windows.find((window) => window.manifestId === "alpha")!;
    session.send({ type: "minimize-window", windowId: alpha.id });
    expect(session.state.value.browserPath).toBe("/");
    expect(session.state.value.browserTitle).toBe("WebOS");
  });

  it("replays supported resume intents without launching another process", async () => {
    const { kernel, launchSpy, bus } = makeKernel();
    const { session } = track(createSession(kernel));

    session.send({
      type: "launch-app",
      manifestId: "finder",
      source: "spotlight",
      args: { path: "/portfolio", reveal: "/portfolio/about.md" },
    });
    await settle();
    const finder = session.state.value.windows.find((window) => window.manifestId === "finder")!;
    session.send({ type: "minimize-window", windowId: finder.id });

    session.send({
      type: "launch-app",
      manifestId: "finder",
      source: "spotlight",
      args: { path: "/portfolio", reveal: "/portfolio/about.md" },
    });
    await settle();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(bus.emitted).toContainEqual({
      channel: "finder.reveal.requested",
      payload: { path: "/portfolio", reveal: "/portfolio/about.md", source: "spotlight" },
    });
  });

  it("updates YouTube args only when the resumed video changes", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("youtube-player", "YouTube Player")]);
    const { session } = track(createSession(kernel));

    session.send({
      type: "launch-app",
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "fY6h5FBTZM8" },
    });
    await settle();
    const player = session.state.value.windows[0]!;

    session.send({
      type: "launch-app",
      manifestId: "youtube-player",
      source: "deeplink",
      args: { url: "https://www.youtube.com/watch?v=fY6h5FBTZM8" },
    });
    await settle();

    expect(session.state.value.windows[0]?.argsRevision).toBe(0);

    session.send({
      type: "launch-app",
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "M7lc1UVf-VE" },
    });
    await settle();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(session.state.value.windows[0]?.argsRevision).toBe(1);
    expect(session.state.value.windows[0]?.args).toEqual({ videoId: "M7lc1UVf-VE" });
    expect(bus.emitted).toContainEqual({
      channel: "youtube-player.open.requested",
      payload: {
        handleId: player.handleId,
        source: "deeplink",
        videoId: "M7lc1UVf-VE",
      },
    });
  });

  it("keeps shared open-request policy behind the desktop adapter", async () => {
    const { kernel, launchSpy, bus } = makeKernel([manifest("editor", "Editor")]);
    const { session } = track(createSession(kernel));

    session.send({ type: "spawn-window", manifestId: "editor" });
    await settle();
    const empty = session.state.value.windows[0]!;
    session.send({
      type: "set-document-path",
      handleId: empty.handleId,
      manifestId: "editor",
      path: null,
    });

    session.send({
      type: "open-request",
      request: { manifestId: "editor", path: "/home/new.md" },
    });
    await settle();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(bus.emitted).toContainEqual({
      channel: "editor.window.open.requested",
      payload: { handleId: empty.handleId, path: "/home/new.md" },
    });

    session.send({
      type: "set-document-path",
      handleId: empty.handleId,
      manifestId: "editor",
      path: "/home/new.md",
    });
    session.send({ type: "minimize-window", windowId: empty.id });
    session.send({
      type: "open-request",
      request: { manifestId: "editor", path: "/home/new.md" },
    });
    await settle();

    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(session.state.value.windows[0]?.focused).toBe(true);
    expect(session.state.value.windows[0]?.minimized).toBe(false);

    session.send({
      type: "open-request",
      request: { manifestId: "editor", path: "/home/other.md" },
    });
    await settle();

    expect(launchSpy).toHaveBeenCalledTimes(2);
    expect(launchSpy).toHaveBeenLastCalledWith("editor", { path: "/home/other.md" });
    expect(session.state.value.windows).toHaveLength(2);
  });

  it("owns content sizing, stage clamping, and snap preview policy", async () => {
    const { kernel } = makeKernel([
      manifest("alpha", "Alpha", {
        defaultWindow: { width: DEFAULT_W, height: DEFAULT_H },
      }),
    ]);
    const stage = makeStage({ width: 640, height: 480 });
    const { session } = track(createSession(kernel, stage));

    session.send({ type: "launch-app", manifestId: "alpha", source: "deeplink" });
    await settle();
    const record = session.state.value.windows[0]!;

    session.send({
      type: "report-content-size",
      windowId: record.id,
      size: { width: 720, height: 540 },
    });

    expect(session.state.value.windows[0]).toMatchObject({
      width: 640,
      height: 480,
      x: 0,
      y: 0,
    });

    session.send({ type: "preview-snap", windowId: record.id, edge: "max" });
    expect(session.state.value.snapPreview).toEqual({
      edge: "max",
      stage: { width: 640, height: 480 },
    });

    session.send({ type: "preview-snap", windowId: "other", edge: null });
    expect(session.state.value.snapPreview).not.toBeNull();
    session.send({ type: "preview-snap", windowId: record.id, edge: null });
    expect(session.state.value.snapPreview).toBeNull();

    session.send({ type: "snap-window", windowId: record.id, edge: "left" });
    expect(session.state.value.windows[0]).toMatchObject({
      snap: "left",
      width: 320,
      height: 480,
    });

    session.send({
      type: "report-content-size",
      windowId: record.id,
      size: { width: 200, height: 100 },
    });
    expect(session.state.value.windows[0]?.width).toBe(320);
    expect(TITLEBAR_HEIGHT).toBe(28);
  });

  it("rebinds snapped windows when stage measurements change", async () => {
    const { kernel } = makeKernel();
    const stage = makeStage({ width: 1000, height: 700 });
    const { session } = track(createSession(kernel, stage));

    session.send({ type: "launch-app", manifestId: "alpha", source: "dock" });
    await settle();
    const record = session.state.value.windows[0]!;
    session.send({ type: "snap-window", windowId: record.id, edge: "right" });

    stage.stageBounds.width = 800;
    stage.stageBounds.height = 600;
    await nextTick();

    expect(session.state.value.windows[0]).toMatchObject({
      x: 400,
      y: 0,
      width: 400,
      height: 600,
      snap: "right",
    });
  });

  it("routes command actions through the same session state", async () => {
    const { kernel, commands, bus } = makeKernel([
      manifest("calendar", "Calendar", { settings: {} }),
    ]);
    const { session } = track(createSession(kernel));

    session.send({ type: "launch-app", manifestId: "calendar", source: "dock" });
    await settle();
    const record = session.state.value.windows[0]!;

    await commands.get("desktop:window.minimize")!.run(commandCtx(kernel, { windowId: record.id }));
    expect(session.state.value.windows[0]?.minimized).toBe(true);

    session.send({ type: "focus-window", windowId: record.id });
    await commands
      .get("desktop:window.toggleMaximize")!
      .run(commandCtx(kernel, { windowId: record.id }));
    expect(session.state.value.windows[0]?.maximized).toBe(true);

    await commands
      .get("desktop:window.openSettings")!
      .run(commandCtx(kernel, { windowId: record.id }));
    expect(bus.emitted).toContainEqual({
      channel: "app.settings.requested",
      payload: { manifestId: "calendar", handleId: record.handleId },
    });

    await commands.get("desktop:window.close")!.run(commandCtx(kernel, { windowId: record.id }));
    expect(session.state.value.windows).toHaveLength(0);
    expect(kernel.processes.kill).toHaveBeenCalledWith(record.handleId);
  });

  it("removes externally killed processes without killing them twice", async () => {
    const { kernel, bus } = makeKernel();
    const { session } = track(createSession(kernel));

    session.send({ type: "launch-app", manifestId: "alpha", source: "api" });
    await settle();
    const record = session.state.value.windows[0]!;

    bus.emit("app.killed", {
      manifestId: "alpha",
      handleId: record.handleId,
      reason: "kernel",
    });

    expect(session.state.value.windows).toHaveLength(0);
    expect(kernel.processes.kill).not.toHaveBeenCalled();
  });

  it("reports unknown apps through the injected notification adapter", async () => {
    const { kernel, launchSpy } = makeKernel([]);
    const { session, notifyUnavailable } = track(createSession(kernel));

    session.send({ type: "launch-app", manifestId: "missing", source: "dock" });
    await settle();

    expect(launchSpy).not.toHaveBeenCalled();
    expect(notifyUnavailable).toHaveBeenCalledWith("missing");
  });

  it("disposes event subscriptions and commands with its owning scope", () => {
    const { kernel, commands, bus } = makeKernel();
    const fixture = createSession(kernel);

    expect(commands.size).toBe(4);
    fixture.dispose();
    expect(commands.size).toBe(0);

    bus.emit("app.launch.requested", {
      manifestId: "alpha",
      source: "dock",
    });
    expect(fixture.session.state.value.windows).toHaveLength(0);
  });
});
