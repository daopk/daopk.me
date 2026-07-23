import { flushPromises, mountVaporComposable } from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick } from "vue";

import type { AppHandle, AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import { __resetNavigationForTest } from "./navigation";
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

function makeKernel(manifests: AppManifest[]): {
  readonly kernel: Kernel;
  readonly launch: ReturnType<typeof vi.fn>;
} {
  type EventListener = (payload: unknown) => void;
  const listeners = new Map<string, Set<EventListener>>();
  let launchCount = 0;

  const launch = vi.fn(async (manifestId: string): Promise<AppHandle> => {
    launchCount += 1;
    return {
      id: `h-${launchCount}`,
      manifestId,
      on: () => () => undefined,
      postMessage: () => undefined,
    };
  });

  const kernel = {
    apps: {
      list: () => manifests,
      register: vi.fn(),
      launch,
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

  return { kernel, launch };
}

function mountSession(
  kernel: Kernel,
  overrides: Partial<Omit<MobileSessionAdapters, "kernel">> = {},
) {
  const adapters: MobileSessionAdapters = {
    kernel,
    titleFor: (manifestId) =>
      kernel.apps.list().find((entry) => entry.id === manifestId)?.name ?? manifestId,
    notifyUnsupported: vi.fn(),
    restoreHomeFocus: vi.fn(),
    ...overrides,
  };
  const mounted = mountVaporComposable(() => useMobileSession(adapters));
  return { ...mounted, adapters };
}

describe("mobile session", () => {
  beforeEach(() => {
    __resetNavigationForTest();
  });

  afterEach(() => {
    __resetNavigationForTest();
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
    expect(notifyUnsupported).toHaveBeenCalledWith(unsupported);
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
});
