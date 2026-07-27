import { flushPromises, mountVaporComposable } from "~/test/mountVapor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick } from "vue";

import type { AppHandle, AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import { useMobileManifestProjection } from "./useMobileManifestProjection";
import { useMobileSession, type MobileSessionAdapters } from "./useMobileSession";

const StubIcon = defineVaporComponent(() =>
  document.createElementNS("http://www.w3.org/2000/svg", "svg"),
);
const StubApp = defineVaporComponent(() => document.createElement("div"));

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: "alpha",
    name: "Alpha",
    icon: StubIcon,
    category: "system",
    component: async () => ({ default: StubApp }),
    ...overrides,
  };
}

function handle(id: string, manifestId: string): AppHandle {
  return {
    id,
    manifestId,
    on: () => () => undefined,
    postMessage: () => undefined,
  };
}

function makeKernel(
  manifests: AppManifest[],
  launchImplementation?: (manifestId: string) => Promise<AppHandle>,
): {
  readonly kernel: Kernel;
  readonly launch: ReturnType<typeof vi.fn>;
  readonly kill: ReturnType<typeof vi.fn>;
  readonly suspend: ReturnType<typeof vi.fn>;
  readonly resume: ReturnType<typeof vi.fn>;
} {
  type EventListener = (payload: unknown) => void;
  const listeners = new Map<string, Set<EventListener>>();
  let launchCount = 0;

  const launch = vi.fn(
    launchImplementation ??
      (async (manifestId: string): Promise<AppHandle> => {
        launchCount += 1;
        return {
          id: `h-${launchCount}`,
          manifestId,
          on: () => () => undefined,
          postMessage: () => undefined,
        };
      }),
  );
  const kill = vi.fn();
  const suspend = vi.fn();
  const resume = vi.fn();

  const kernel = {
    apps: {
      list: () => manifests,
      register: vi.fn(),
      launch,
      unregister: vi.fn(),
    },
    processes: {
      spawn: vi.fn(),
      kill,
      suspend,
      resume,
      list: () =>
        [][Symbol.iterator]() as IterableIterator<[string, { state: string; manifestId: string }]>,
    },
    events: {
      on: vi.fn((channel: string, listener: EventListener) => {
        const bucket = listeners.get(channel) ?? new Set<EventListener>();
        bucket.add(listener);
        listeners.set(channel, bucket);
        return (): void => {
          bucket.delete(listener);
        };
      }),
      emit: vi.fn((channel: string, payload: unknown) => {
        for (const listener of listeners.get(channel) ?? []) {
          listener(payload);
        }
      }),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
  } as unknown as Kernel;

  return { kernel, launch, kill, suspend, resume };
}

function mountSession(
  kernel: Kernel,
  overrides: Partial<Omit<MobileSessionAdapters, "kernel" | "manifests">> = {},
) {
  let adapters!: MobileSessionAdapters;
  const mounted = mountVaporComposable(() => {
    adapters = {
      kernel,
      manifests: useMobileManifestProjection(kernel),
      notifyUnsupported: vi.fn(),
      restoreHomeFocus: vi.fn(),
      ...overrides,
    };
    return useMobileSession(adapters);
  });
  return { ...mounted, adapters };
}

describe("mobile session", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("owns launch state and publishes a render snapshot", async () => {
    const { kernel } = makeKernel([manifest()]);
    const mounted = mountSession(kernel);

    expect(mounted.result.state.value).toMatchObject({
      frames: [],
      foregroundFrameId: null,
      homeVisible: true,
      recentsAvailable: false,
      recentsVisible: false,
      browserPath: "/",
      browserTitle: "WebOS",
    });

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    expect(mounted.result.state.value.launchingManifestIds.has("alpha")).toBe(true);

    await flushPromises();
    await nextTick();

    expect(mounted.result.state.value).toMatchObject({
      foregroundFrameId: expect.any(String),
      homeVisible: false,
      recentsAvailable: false,
      browserPath: "/apps/alpha",
      browserTitle: "Alpha - WebOS",
    });
    expect(mounted.result.state.value.frames).toHaveLength(1);
    expect(mounted.result.state.value.launchingManifestIds.has("alpha")).toBe(false);

    mounted.unmount();
  });

  it("resumes an alive app without exposing launch ordering to the caller", async () => {
    const { kernel, launch } = makeKernel([manifest()]);
    const mounted = mountSession(kernel);

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    await flushPromises();
    const frameId = mounted.result.state.value.foregroundFrameId;

    mounted.result.send({ type: "go-home" });
    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    await flushPromises();

    expect(launch).toHaveBeenCalledTimes(1);
    expect(mounted.result.state.value.foregroundFrameId).toBe(frameId);
    expect(mounted.result.state.value.launchingManifestIds.has("alpha")).toBe(false);

    mounted.unmount();
  });

  it("owns recent-app selection and dismissal policy", async () => {
    const { kernel } = makeKernel([manifest(), manifest({ id: "beta", name: "Beta" })]);
    const mounted = mountSession(kernel);

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    mounted.result.send({ type: "launch-app", manifestId: "beta" });
    await flushPromises();

    const alphaFrame = mounted.result.state.value.frames[0];
    mounted.result.send({ type: "open-recents" });
    expect(mounted.result.state.value.recentsVisible).toBe(true);

    mounted.result.send({ type: "select-recent", frameId: alphaFrame.frameId });
    expect(mounted.result.state.value.foregroundFrameId).toBe(alphaFrame.frameId);
    expect(mounted.result.state.value.recentsVisible).toBe(false);

    mounted.result.send({ type: "open-recents" });
    mounted.result.send({ type: "dismiss-all" });
    expect(mounted.result.state.value.frames).toHaveLength(0);
    expect(mounted.result.state.value.recentsVisible).toBe(false);
    expect(mounted.result.state.value.homeVisible).toBe(true);

    mounted.unmount();
  });

  it("rejects unsupported apps through the shell adapter", () => {
    const unsupported = manifest({
      id: "desktop-tool",
      name: "Desktop Tool",
      supportedShells: ["desktop"],
    });
    const { kernel, launch } = makeKernel([unsupported]);
    const notifyUnsupported = vi.fn();
    const mounted = mountSession(kernel, { notifyUnsupported });

    mounted.result.send({ type: "launch-app", manifestId: unsupported.id });

    expect(launch).not.toHaveBeenCalled();
    expect(notifyUnsupported).toHaveBeenCalledWith(
      expect.objectContaining({
        id: unsupported.id,
        name: unsupported.name,
        supported: false,
        unsupportedMessage:
          "Desktop Tool is not supported on mobile. Open it from the desktop shell.",
      }),
    );
    expect(mounted.result.state.value.frames).toHaveLength(0);

    mounted.unmount();
  });

  it("decides when home focus must be restored and delegates only the DOM effect", async () => {
    const { kernel } = makeKernel([manifest()]);
    const restoreHomeFocus = vi.fn();
    const mounted = mountSession(kernel, { restoreHomeFocus });

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    await flushPromises();
    mounted.result.send({ type: "go-home" });
    await nextTick();
    await nextTick();

    expect(restoreHomeFocus).toHaveBeenCalledWith("alpha");

    mounted.unmount();
  });

  it("keeps launch arguments as an immutable frame snapshot", async () => {
    const { kernel } = makeKernel([manifest()]);
    const mounted = mountSession(kernel);
    const args = { route: "/profile" };

    mounted.result.send({ type: "launch-app", manifestId: "alpha", args });
    await flushPromises();

    const frame = mounted.result.state.value.frames[0]!;
    expect(frame.args).toEqual({ route: "/profile" });
    expect(Object.isFrozen(frame.args)).toBe(true);

    args.route = "/mutated";
    expect(frame.args).toEqual({ route: "/profile" });

    mounted.unmount();
  });

  it("serializes concurrent launches in request order", async () => {
    let resolveSlow: (value: AppHandle) => void = () => undefined;
    const slowHandle = new Promise<AppHandle>((resolve) => {
      resolveSlow = resolve;
    });
    const order: string[] = [];
    const { kernel } = makeKernel(
      [manifest({ id: "slow" }), manifest({ id: "fast" })],
      async (manifestId) => {
        if (manifestId === "slow") {
          order.push("slow:start");
          const launched = await slowHandle;
          order.push("slow:done");
          return launched;
        }
        order.push("fast");
        return handle("h-fast", manifestId);
      },
    );
    const mounted = mountSession(kernel);

    mounted.result.send({ type: "launch-app", manifestId: "slow" });
    mounted.result.send({ type: "launch-app", manifestId: "fast" });
    await Promise.resolve();
    await Promise.resolve();

    expect(order).toEqual(["slow:start"]);

    resolveSlow(handle("h-slow", "slow"));
    await flushPromises();

    expect(order).toEqual(["slow:start", "slow:done", "fast"]);
    expect(mounted.result.state.value.frames.map((frame) => frame.manifestId)).toEqual([
      "slow",
      "fast",
    ]);

    mounted.unmount();
  });

  it("spawns distinct same-app frames through the shell event bridge", async () => {
    const { kernel, launch } = makeKernel([manifest()]);
    const mounted = mountSession(kernel);

    kernel.events.emit("app.spawn.new", {
      manifestId: "alpha",
      source: "api",
      args: { view: "first" },
    });
    kernel.events.emit("app.spawn.new", {
      manifestId: "alpha",
      source: "api",
      args: { view: "second" },
    });
    await flushPromises();

    const frames = mounted.result.state.value.frames;
    expect(launch).toHaveBeenCalledTimes(2);
    expect(frames).toHaveLength(2);
    expect(new Set(frames.map((frame) => frame.frameId)).size).toBe(2);
    expect(frames.map((frame) => frame.args?.view)).toEqual(["first", "second"]);
    expect(mounted.result.state.value.foregroundFrameId).toBe(frames[1]!.frameId);

    mounted.unmount();
  });

  it("syncs process state when the foreground frame changes", async () => {
    const { kernel, suspend, resume } = makeKernel([
      manifest(),
      manifest({ id: "beta", name: "Beta" }),
    ]);
    const mounted = mountSession(kernel);

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    await flushPromises();
    await nextTick();
    const alpha = mounted.result.state.value.frames[0]!;
    expect(resume).toHaveBeenLastCalledWith(alpha.handleId);

    mounted.result.send({ type: "launch-app", manifestId: "beta" });
    await flushPromises();
    await nextTick();
    const beta = mounted.result.state.value.frames[1]!;
    expect(suspend).toHaveBeenLastCalledWith(alpha.handleId);
    expect(resume).toHaveBeenLastCalledWith(beta.handleId);

    mounted.result.send({ type: "go-home" });
    await nextTick();
    expect(suspend).toHaveBeenLastCalledWith(beta.handleId);

    mounted.result.send({ type: "select-recent", frameId: alpha.frameId });
    await nextTick();
    expect(resume).toHaveBeenLastCalledWith(alpha.handleId);

    mounted.unmount();
  });

  it("dismisses frames with user process teardown and foreground fallback", async () => {
    const { kernel, kill } = makeKernel([manifest(), manifest({ id: "beta", name: "Beta" })]);
    const mounted = mountSession(kernel);

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    mounted.result.send({ type: "launch-app", manifestId: "beta" });
    await flushPromises();
    const [alpha, beta] = mounted.result.state.value.frames;

    mounted.result.send({ type: "dismiss", frameId: beta!.frameId });

    expect(mounted.result.state.value.frames.map((frame) => frame.manifestId)).toEqual(["alpha"]);
    expect(mounted.result.state.value.foregroundFrameId).toBe(alpha!.frameId);
    expect(kill).toHaveBeenCalledWith(beta!.handleId, "user");

    mounted.result.send({ type: "dismiss", frameId: "unknown" });
    expect(kill).toHaveBeenCalledTimes(1);

    mounted.unmount();
  });

  it("updates frame metadata and browser state through session inputs", async () => {
    const { kernel } = makeKernel([manifest()]);
    const mounted = mountSession(kernel);

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    await flushPromises();
    const frame = mounted.result.state.value.frames[0]!;

    kernel.events.emit("app.document.changed", {
      manifestId: "alpha",
      handleId: frame.handleId,
      path: "/home/a.md",
    });
    kernel.events.emit("app.url.changed", {
      manifestId: "alpha",
      handleId: frame.handleId,
      path: "/details",
    });
    mounted.result.send({
      type: "set-title",
      manifestId: "alpha",
      handleId: frame.handleId,
      title: "Details",
    });
    await nextTick();

    expect(frame.documentPath).toBe("/home/a.md");
    expect(frame.browserPath).toBe("/details");
    expect(mounted.result.state.value.browserPath).toBe("/details");
    expect(mounted.result.state.value.browserTitle).toBe("Details - WebOS");

    mounted.unmount();
  });

  it("removes externally killed frames without killing their process again", async () => {
    const { kernel, kill } = makeKernel([manifest(), manifest({ id: "beta", name: "Beta" })]);
    const mounted = mountSession(kernel);

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    mounted.result.send({ type: "launch-app", manifestId: "beta" });
    await flushPromises();
    const [alpha, beta] = mounted.result.state.value.frames;

    kernel.events.emit("app.killed", {
      manifestId: "beta",
      handleId: beta!.handleId,
      reason: "kernel",
    });

    expect(mounted.result.state.value.frames.map((frame) => frame.manifestId)).toEqual(["alpha"]);
    expect(mounted.result.state.value.foregroundFrameId).toBe(alpha!.frameId);
    expect(kill).not.toHaveBeenCalled();

    mounted.unmount();
  });

  it("tears down all resident processes when the session scope ends", async () => {
    const { kernel, kill } = makeKernel([manifest(), manifest({ id: "beta", name: "Beta" })]);
    const mounted = mountSession(kernel);

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    mounted.result.send({ type: "launch-app", manifestId: "beta" });
    await flushPromises();
    const handleIds = mounted.result.state.value.frames.map((frame) => frame.handleId);

    mounted.unmount();

    expect(kill.mock.calls).toEqual(
      expect.arrayContaining(handleIds.map((handleId) => [handleId, "shell"])),
    );
  });

  it("tears down a late launch and skips queued launches after disposal", async () => {
    let resolveLaunch: (value: AppHandle) => void = () => undefined;
    const pendingLaunch = new Promise<AppHandle>((resolve) => {
      resolveLaunch = resolve;
    });
    const { kernel, kill, launch } = makeKernel(
      [manifest(), manifest({ id: "beta", name: "Beta" })],
      async () => pendingLaunch,
    );
    const mounted = mountSession(kernel);

    mounted.result.send({ type: "launch-app", manifestId: "alpha" });
    mounted.result.send({ type: "launch-app", manifestId: "beta" });
    await Promise.resolve();
    await Promise.resolve();
    mounted.unmount();

    resolveLaunch(handle("h-late", "alpha"));
    await flushPromises();

    expect(kill).toHaveBeenCalledWith("h-late", "shell");
    expect(launch).toHaveBeenCalledTimes(1);
    expect(mounted.result.state.value.frames).toHaveLength(0);
  });

  it("preserves a late singleton handle claimed by a replacement session", async () => {
    let resolveLaunch: (value: AppHandle) => void = () => undefined;
    const pendingLaunch = new Promise<AppHandle>((resolve) => {
      resolveLaunch = resolve;
    });
    const { kernel, kill, launch } = makeKernel(
      [manifest({ singleton: true })],
      async () => pendingLaunch,
    );
    const stale = mountSession(kernel);

    stale.result.send({ type: "launch-app", manifestId: "alpha" });
    await Promise.resolve();
    await Promise.resolve();
    expect(launch).toHaveBeenCalledTimes(1);

    stale.unmount();
    resolveLaunch(handle("h-shared", "alpha"));

    const replacement = mountSession(kernel);
    replacement.result.send({ type: "launch-app", manifestId: "alpha" });
    await flushPromises();

    expect(launch).toHaveBeenCalledTimes(2);
    const frame = replacement.result.state.value.frames[0];
    expect(stale.result.state.value.frames).toHaveLength(0);
    expect(frame).toMatchObject({
      handleId: "h-shared",
      manifestId: "alpha",
    });
    expect(replacement.result.state.value.foregroundFrameId).toBe(frame!.frameId);
    expect(replacement.result.state.value.launchingManifestIds.has("alpha")).toBe(false);
    expect(kill).not.toHaveBeenCalled();

    replacement.unmount();

    expect(kill.mock.calls).toEqual([["h-shared", "shell"]]);
  });

  it("reaps a late singleton handle when the replacement claim fails", async () => {
    let resolveFirstLaunch: (value: AppHandle) => void = () => undefined;
    const firstLaunch = new Promise<AppHandle>((resolve) => {
      resolveFirstLaunch = resolve;
    });
    let launchCount = 0;
    const { kernel, kill, launch } = makeKernel([manifest({ singleton: true })], async () => {
      launchCount += 1;
      if (launchCount === 1) {
        return firstLaunch;
      }
      throw new Error("replacement failed");
    });
    const stale = mountSession(kernel);

    stale.result.send({ type: "launch-app", manifestId: "alpha" });
    await Promise.resolve();
    await Promise.resolve();
    stale.unmount();
    resolveFirstLaunch(handle("h-orphan", "alpha"));

    const replacement = mountSession(kernel);
    replacement.result.send({ type: "launch-app", manifestId: "alpha" });
    await flushPromises();

    expect(launch).toHaveBeenCalledTimes(2);
    expect(replacement.result.state.value.frames).toHaveLength(0);
    expect(replacement.result.state.value.launchingManifestIds.has("alpha")).toBe(false);
    expect(kill.mock.calls).toEqual([["h-orphan", "shell"]]);

    replacement.unmount();
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("tears down a shared handle only after its last same-kernel session releases it", async () => {
    const sharedHandle = handle("h-shared", "alpha");
    const { kernel, kill } = makeKernel([manifest({ singleton: true })], async () => sharedHandle);
    const first = mountSession(kernel);
    const second = mountSession(kernel);

    first.result.send({ type: "launch-app", manifestId: "alpha" });
    second.result.send({ type: "launch-app", manifestId: "alpha" });
    await flushPromises();

    expect(first.result.state.value.frames[0]?.handleId).toBe(sharedHandle.id);
    expect(second.result.state.value.frames[0]?.handleId).toBe(sharedHandle.id);

    first.unmount();
    expect(kill).not.toHaveBeenCalled();

    second.unmount();
    expect(kill.mock.calls).toEqual([[sharedHandle.id, "shell"]]);
  });

  it("keeps separate mobile session mounts isolated", async () => {
    const firstKernel = makeKernel([manifest()]);
    const secondKernel = makeKernel([manifest()]);
    const first = mountSession(firstKernel.kernel);
    const second = mountSession(secondKernel.kernel);

    first.result.send({ type: "launch-app", manifestId: "alpha" });
    await flushPromises();

    expect(first.result.state.value.frames).toHaveLength(1);
    expect(second.result.state.value.frames).toHaveLength(0);

    first.unmount();
    second.unmount();
  });
});
