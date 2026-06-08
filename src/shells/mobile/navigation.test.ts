import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppHandle } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import { __resetNavigationForTest, navigation } from "./navigation";

function makeHandle(handleId: string, manifestId: string): AppHandle {
  return {
    id: handleId,
    manifestId,
    on: () => () => undefined,
    postMessage: () => undefined,
  };
}

let launchCounter = 0;

function makeKernelMock(): {
  kernel: Pick<Kernel, "apps" | "processes">;
  launches: string[];
  kills: Array<[string, string | undefined]>;
  killSpy: ReturnType<typeof vi.fn>;
  suspendSpy: ReturnType<typeof vi.fn>;
  resumeSpy: ReturnType<typeof vi.fn>;
} {
  const launches: string[] = [];
  const kills: Array<[string, string | undefined]> = [];
  const killSpy = vi.fn((handleId: string, reason?: string): void => {
    kills.push([handleId, reason]);
  });
  const suspendSpy = vi.fn();
  const resumeSpy = vi.fn();

  return {
    launches,
    kills,
    killSpy,
    suspendSpy,
    resumeSpy,
    kernel: {
      apps: {
        list: () => [],
        register: vi.fn(),
        async launch(manifestId: string): Promise<AppHandle> {
          launchCounter += 1;
          launches.push(manifestId);
          return makeHandle(`h-${launchCounter}`, manifestId);
        },
        unregister: vi.fn(),
      },
      processes: {
        spawn: vi.fn(),
        kill: killSpy,
        suspend: suspendSpy,
        resume: resumeSpy,
        list: () =>
          [][Symbol.iterator]() as IterableIterator<
            [string, { state: string; manifestId: string }]
          >,
      },
    },
  };
}

describe("navigation orchestrator (v2 — internal stack, no browser history)", () => {
  beforeEach(() => {
    launchCounter = 0;
    __resetNavigationForTest();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    __resetNavigationForTest();
    vi.restoreAllMocks();
  });

  describe("launch args (F1)", () => {
    it("launch(id, args) stores a frozen frame.args snapshot", async () => {
      const { kernel } = makeKernelMock();
      navigation.init(kernel as unknown as Kernel);

      const frame = await navigation.launch("about", { route: "/profile" });

      expect(frame.args).toEqual({ route: "/profile" });
      expect(Object.isFrozen(frame.args)).toBe(true);
    });

    it("spawnNew(id, args) stores a frozen frame.args snapshot", async () => {
      const { kernel } = makeKernelMock();
      navigation.init(kernel as unknown as Kernel);

      const frame = await navigation.spawnNew("terminal", { cwd: "/foo" });

      expect(frame.args).toEqual({ cwd: "/foo" });
      expect(Object.isFrozen(frame.args)).toBe(true);
    });

    it("setDocumentPath tracks a live document path by manifest and handle id", async () => {
      const { kernel } = makeKernelMock();
      navigation.init(kernel as unknown as Kernel);

      const frame = await navigation.spawnNew("editor");

      expect(navigation.setDocumentPath(frame.handleId, "editor", "/home/a.md")).toBe(true);
      expect(navigation.stack[0]!.documentPath).toBe("/home/a.md");
      expect(navigation.setDocumentPath(frame.handleId, "notes", "/home/b.md")).toBe(false);
      expect(navigation.stack[0]!.documentPath).toBe("/home/a.md");
      expect(navigation.setDocumentPath(frame.handleId, "editor", null)).toBe(true);
      expect(navigation.stack[0]!.documentPath).toBeNull();
    });

    it("setBrowserPath tracks a live browser path by manifest and handle id", async () => {
      const { kernel } = makeKernelMock();
      navigation.init(kernel as unknown as Kernel);

      const frame = await navigation.spawnNew("blog");

      expect(navigation.setBrowserPath(frame.handleId, "blog", "/blog/a")).toBe(true);
      expect(navigation.stack[0]!.browserPath).toBe("/blog/a");
      expect(navigation.setBrowserPath(frame.handleId, "notes", "/notes/a")).toBe(false);
      expect(navigation.stack[0]!.browserPath).toBe("/blog/a");
      expect(navigation.setBrowserPath(frame.handleId, "blog", null)).toBe(true);
      expect(navigation.stack[0]!.browserPath).toBeNull();
    });

    it("launch without args leaves frame.args === undefined (no sentinel)", async () => {
      const { kernel } = makeKernelMock();
      navigation.init(kernel as unknown as Kernel);

      const frame = await navigation.launch("about");

      expect(frame.args).toBeUndefined();
    });

    it("D4 — resume-by-manifestId drops new args; resident frame.args stays intact", async () => {
      const { kernel } = makeKernelMock();
      navigation.init(kernel as unknown as Kernel);

      const debugWarnSpy = vi
        .spyOn(await import("~/core/debug"), "debugWarn")
        .mockImplementation(() => undefined);

      const first = await navigation.launch("about", { route: "/first" });
      const second = await navigation.launch("about", { route: "/second" });

      expect(first.frameId).toBe(second.frameId);
      expect(second.args).toEqual({ route: "/first" });

      const dropCalls = debugWarnSpy.mock.calls.filter(
        (call) => typeof call[1] === "string" && call[1].includes("resume — dropping launch args"),
      );
      expect(dropCalls).toHaveLength(1);
    });

    it("D4a — existingByHandle shortcut drops new args; resident frame.args stays intact", async () => {
      const stableHandle = makeHandle("h-shared", "alpha");
      const aliasingKernel: Pick<Kernel, "apps" | "processes"> = {
        apps: {
          list: () => [],
          register: vi.fn(),
          async launch(): Promise<AppHandle> {
            return stableHandle;
          },
          unregister: vi.fn(),
        },
        processes: {
          spawn: vi.fn(),
          kill: vi.fn(),
          suspend: vi.fn(),
          resume: vi.fn(),
          list: () =>
            [][Symbol.iterator]() as IterableIterator<
              [string, { state: string; manifestId: string }]
            >,
        },
      };

      navigation.init(aliasingKernel as unknown as Kernel);

      const debugWarnSpy = vi
        .spyOn(await import("~/core/debug"), "debugWarn")
        .mockImplementation(() => undefined);

      const first = await navigation.launch("alpha", { v: 1 });
      const second = await navigation.spawnNew("beta", { v: 2 });

      expect(second.frameId).toBe(first.frameId);
      expect(second.args).toEqual({ v: 1 });

      const dropCalls = debugWarnSpy.mock.calls.filter(
        (call) =>
          typeof call[1] === "string" && call[1].includes("existingByHandle — dropping spawn args"),
      );
      expect(dropCalls).toHaveLength(1);
    });
  });

  it("init() does not replace browser history state or strip URL params", () => {
    const { kernel } = makeKernelMock();
    window.history.replaceState({ external: true }, "", "/?app=external");

    const replaceSpy = vi.spyOn(window.history, "replaceState");
    navigation.init(kernel as unknown as Kernel);

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.history.state).toEqual({ external: true });
    expect(window.location.search).toBe("?app=external");
  });

  it("popstate events do not drive mobile foreground state", async () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("about");
    await navigation.launch("_template");
    const before = navigation.foreground.value;

    window.dispatchEvent(
      new PopStateEvent("popstate", {
        state: { daopk: "app", frameId: a.frameId, handleId: a.handleId },
      }),
    );

    expect(navigation.foreground.value).toBe(before);
    expect(navigation.stack.length).toBe(2);
  });

  it("launch() spawns a frame and sets foreground without pushing browser history", async () => {
    const { kernel, launches } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const pushSpy = vi.spyOn(window.history, "pushState");
    await navigation.launch("about");

    expect(launches).toEqual(["about"]);
    expect(navigation.stack.length).toBe(1);
    expect(navigation.stack[0].manifestId).toBe("about");
    expect(navigation.foreground.value).toBe(navigation.stack[0].frameId);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("removeByHandleId() removes externally killed frames without killing again", async () => {
    const { kernel, killSpy } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const first = await navigation.launch("about");
    const second = await navigation.spawnNew("terminal");

    expect(navigation.foreground.value).toBe(second.frameId);

    const removed = navigation.removeByHandleId(second.handleId);

    expect(removed).toBe(true);
    expect(navigation.stack.map((frame) => frame.handleId)).toEqual([first.handleId]);
    expect(navigation.foreground.value).toBe(first.frameId);
    expect(killSpy).not.toHaveBeenCalled();
  });

  it("launch() before init() throws", async () => {
    await expect(navigation.launch("about")).rejects.toThrow(/before init/);
  });

  it("launching the same manifest twice resumes the existing frame and does NOT spawn a duplicate", async () => {
    const { kernel, launches } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const first = await navigation.launch("about");
    navigation.goHome();
    expect(navigation.foreground.value).toBeNull();

    const second = await navigation.launch("about");

    expect(second.frameId).toBe(first.frameId);
    expect(navigation.stack.length).toBe(1);
    expect(launches).toEqual(["about"]);
    expect(navigation.foreground.value).toBe(first.frameId);
  });

  it("launching a different manifest while one is alive spawns a new frame and foregrounds it", async () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("about");
    const b = await navigation.launch("_template");

    expect(navigation.stack.length).toBe(2);
    expect(navigation.stack.map((f) => f.manifestId)).toEqual(["about", "_template"]);
    expect(navigation.foreground.value).toBe(b.frameId);
    expect(a.frameId).not.toBe(b.frameId);
  });

  it("concurrent launches are serialized — stack order matches call order", async () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const first = navigation.launch("about");
    const second = navigation.launch("_template");

    await first;
    await second;

    expect(navigation.stack.length).toBe(2);
    expect(navigation.stack[0].manifestId).toBe("about");
    expect(navigation.stack[1].manifestId).toBe("_template");
  });

  it("concurrent launches — second waits for first even if its kernel.apps.launch is slow", async () => {
    let resolveFirst: (handle: AppHandle) => void = () => undefined;
    const slowLaunch = new Promise<AppHandle>((resolve) => {
      resolveFirst = resolve;
    });
    const orderedEvents: string[] = [];

    const kernel: Pick<Kernel, "apps" | "processes"> = {
      apps: {
        list: () => [],
        register: vi.fn(),
        async launch(manifestId: string): Promise<AppHandle> {
          if (manifestId === "slow") {
            orderedEvents.push("launch:slow:start");
            const h = await slowLaunch;
            orderedEvents.push("launch:slow:done");
            return h;
          }
          orderedEvents.push("launch:fast");
          return makeHandle("h-fast", manifestId);
        },
        unregister: vi.fn(),
      },
      processes: {
        spawn: vi.fn(),
        kill: vi.fn(),
        suspend: vi.fn(),
        resume: vi.fn(),
        list: () =>
          [][Symbol.iterator]() as IterableIterator<
            [string, { state: string; manifestId: string }]
          >,
      },
    };

    navigation.init(kernel as unknown as Kernel);

    const slowLaunchP = navigation.launch("slow");
    const fastLaunchP = navigation.launch("fast");

    await Promise.resolve();
    await Promise.resolve();
    expect(orderedEvents).toEqual(["launch:slow:start"]);

    resolveFirst(makeHandle("h-slow", "slow"));

    await slowLaunchP;
    await fastLaunchP;

    expect(orderedEvents).toEqual(["launch:slow:start", "launch:slow:done", "launch:fast"]);
    expect(navigation.stack.map((f) => f.manifestId)).toEqual(["slow", "fast"]);
  });

  it("does not consult browser history even if pushState would throw", async () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    await expect(navigation.launch("about")).resolves.toMatchObject({ manifestId: "about" });

    expect(pushSpy).not.toHaveBeenCalled();
    expect(navigation.stack.length).toBe(1);
    expect(navigation.foreground.value).toBe(navigation.stack[0].frameId);
    expect(kills).toEqual([]);
  });

  it("goHome() directly flips foreground to null WITHOUT killing the frame or calling history.back", async () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const frame = await navigation.launch("about");
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => undefined);

    navigation.goHome();

    expect(backSpy).not.toHaveBeenCalled();
    expect(navigation.stack.length).toBe(1);
    expect(navigation.stack[0].frameId).toBe(frame.frameId);
    expect(navigation.foreground.value).toBeNull();
    expect(kills.length).toBe(0);
  });

  it("goHome() from home is a no-op", () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    navigation.goHome();

    expect(backSpy).not.toHaveBeenCalled();
    expect(navigation.foreground.value).toBeNull();
  });

  it("focusFrame(frameId) brings a background frame to the foreground without pushing browser history", async () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("about");
    const b = await navigation.launch("_template");
    expect(navigation.foreground.value).toBe(b.frameId);

    navigation.goHome();
    expect(navigation.foreground.value).toBeNull();

    const pushSpy = vi.spyOn(window.history, "pushState");
    navigation.focusFrame(a.frameId);

    expect(navigation.foreground.value).toBe(a.frameId);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(kills.length).toBe(0);
  });

  it("focusFrame(currentFrameId) is a no-op", async () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("about");
    const pushSpy = vi.spyOn(window.history, "pushState");

    navigation.focusFrame(a.frameId);

    expect(pushSpy).not.toHaveBeenCalled();
    expect(navigation.foreground.value).toBe(a.frameId);
  });

  it("focusFrame(unknownFrameId) is a no-op", async () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("about");
    const before = navigation.foreground.value;
    const pushSpy = vi.spyOn(window.history, "pushState");

    navigation.focusFrame("does-not-exist");

    expect(pushSpy).not.toHaveBeenCalled();
    expect(navigation.foreground.value).toBe(before);
    expect(a.frameId).toBe(before);
  });

  it("focusFrame() before init() throws", () => {
    expect(() => navigation.focusFrame("any")).toThrow(/before init/);
  });

  it("focusFrame race with in-flight launch: launch foreground may overwrite focusFrame target — benign", async () => {
    let resolveLaunch: (handle: AppHandle) => void = () => undefined;
    const slowLaunch = new Promise<AppHandle>((resolve) => {
      resolveLaunch = resolve;
    });
    const kernel: Pick<Kernel, "apps" | "processes"> = {
      apps: {
        list: () => [],
        register: vi.fn(),
        async launch(manifestId: string): Promise<AppHandle> {
          if (manifestId === "slow") return slowLaunch;
          return makeHandle("h-fast", manifestId);
        },
        unregister: vi.fn(),
      },
      processes: {
        spawn: vi.fn(),
        kill: vi.fn(),
        suspend: vi.fn(),
        resume: vi.fn(),
        list: () =>
          [][Symbol.iterator]() as IterableIterator<
            [string, { state: string; manifestId: string }]
          >,
      },
    };

    navigation.init(kernel as unknown as Kernel);

    const fast = await navigation.launch("fast");
    const slowP = navigation.launch("slow");

    navigation.focusFrame(fast.frameId);
    expect(navigation.foreground.value).toBe(fast.frameId);

    resolveLaunch(makeHandle("h-slow", "slow"));
    await slowP;

    expect(navigation.foreground.value).not.toBe(fast.frameId);
    expect(navigation.stack.length).toBe(2);
  });

  it("syncs kernel process state when foreground changes", async () => {
    const { kernel, suspendSpy, resumeSpy } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("about");
    await nextTick();
    expect(resumeSpy).toHaveBeenLastCalledWith(a.handleId);

    const b = await navigation.launch("_template");
    await nextTick();
    expect(suspendSpy).toHaveBeenLastCalledWith(a.handleId);
    expect(resumeSpy).toHaveBeenLastCalledWith(b.handleId);

    navigation.goHome();
    await nextTick();
    expect(suspendSpy).toHaveBeenLastCalledWith(b.handleId);

    navigation.focusFrame(a.frameId);
    await nextTick();
    expect(resumeSpy).toHaveBeenLastCalledWith(a.handleId);
  });

  it("dispose() kills outstanding frames with reason 'shell'", async () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    await navigation.launch("about");
    const handleId = navigation.stack[0].handleId;

    __resetNavigationForTest();

    expect(kills.some(([id, reason]) => id === handleId && reason === "shell")).toBe(true);
  });

  it("dismiss(foregroundFrame) splices, refcount-kills, foreground falls back without replacing history", async () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("about");
    const b = await navigation.launch("_template");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    navigation.dismiss(b.frameId);

    expect(navigation.stack.length).toBe(1);
    expect(navigation.stack[0].frameId).toBe(a.frameId);
    expect(navigation.foreground.value).toBe(a.frameId);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(kills).toEqual([[b.handleId, "user"]]);
  });

  it("dismiss(lastForegroundFrame) empties the stack and foreground=null without replacing history", async () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("about");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    navigation.dismiss(a.frameId);

    expect(navigation.stack.length).toBe(0);
    expect(navigation.foreground.value).toBeNull();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(kills).toEqual([[a.handleId, "user"]]);
  });

  it("dismiss(backgroundFrame) splices it out and keeps foreground put", async () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("about");
    const b = await navigation.launch("_template");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    navigation.dismiss(a.frameId);

    expect(navigation.stack.length).toBe(1);
    expect(navigation.stack[0].frameId).toBe(b.frameId);
    expect(navigation.foreground.value).toBe(b.frameId);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(kills).toEqual([[a.handleId, "user"]]);
  });

  it("dismiss(unknownFrameId) is a no-op — no stack mutation and no kill", async () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    await navigation.launch("about");
    const stackBefore = [...navigation.stack];
    const fgBefore = navigation.foreground.value;

    navigation.dismiss("does-not-exist");

    expect(navigation.stack.length).toBe(1);
    expect(navigation.stack[0].frameId).toBe(stackBefore[0].frameId);
    expect(navigation.foreground.value).toBe(fgBefore);
    expect(kills.length).toBe(0);
  });

  it("dismiss() before init() throws", () => {
    expect(() => navigation.dismiss("anything")).toThrow(/before init/);
  });

  it("dismissAll() clears the stack, kills every handle, and leaves browser history alone", async () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    await navigation.launch("about");
    await navigation.launch("_template");
    await navigation.launch("third");
    const handles = navigation.stack.map((f) => f.handleId);
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    navigation.dismissAll();

    expect(navigation.stack.length).toBe(0);
    expect(navigation.foreground.value).toBeNull();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(kills).toEqual(handles.map((handleId) => [handleId, "user"]));
  });

  it("dismissAll() from an empty stack is a no-op", () => {
    const { kernel, kills } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    navigation.dismissAll();

    expect(navigation.stack.length).toBe(0);
    expect(navigation.foreground.value).toBeNull();
    expect(kills.length).toBe(0);
  });

  it("dismissAll() before init() throws", () => {
    expect(() => navigation.dismissAll()).toThrow(/before init/);
  });

  it("singleton manifest defensive: kernel returning a pre-existing handleId reuses the corresponding frame", async () => {
    let nthCall = 0;
    const kernel: Pick<Kernel, "apps" | "processes"> = {
      apps: {
        list: () => [],
        register: vi.fn(),
        async launch(manifestId: string): Promise<AppHandle> {
          nthCall += 1;
          return makeHandle("h-shared", manifestId);
        },
        unregister: vi.fn(),
      },
      processes: {
        spawn: vi.fn(),
        kill: vi.fn(),
        suspend: vi.fn(),
        resume: vi.fn(),
        list: () =>
          [][Symbol.iterator]() as IterableIterator<
            [string, { state: string; manifestId: string }]
          >,
      },
    };

    navigation.init(kernel as unknown as Kernel);

    const a = await navigation.launch("alpha");
    const b = await navigation.launch("beta");

    expect(b.frameId).toBe(a.frameId);
    expect(navigation.stack.length).toBe(1);
    expect(navigation.foreground.value).toBe(a.frameId);
    expect(nthCall).toBe(2);
  });

  // race: dismiss while launch is in-flight

  it("dismiss runs synchronously against the current stack while a launch is in flight; the launch lands afterward", async () => {
    let resolveLaunch: (handle: AppHandle) => void = () => undefined;
    const slowLaunch = new Promise<AppHandle>((resolve) => {
      resolveLaunch = resolve;
    });

    const kills: Array<[string, string | undefined]> = [];
    let fastSeq = 0;
    const kernel: Pick<Kernel, "apps" | "processes"> = {
      apps: {
        list: () => [],
        register: vi.fn(),
        async launch(manifestId: string): Promise<AppHandle> {
          if (manifestId === "slow") return slowLaunch;
          fastSeq += 1;
          return makeHandle(`h-fast-${fastSeq}`, manifestId);
        },
        unregister: vi.fn(),
      },
      processes: {
        spawn: vi.fn(),
        kill: (handleId: string, reason?: string): void => {
          kills.push([handleId, reason]);
        },
        suspend: vi.fn(),
        resume: vi.fn(),
        list: () =>
          [][Symbol.iterator]() as IterableIterator<
            [string, { state: string; manifestId: string }]
          >,
      },
    };

    navigation.init(kernel as unknown as Kernel);

    const fast = await navigation.launch("fast");
    const slowP = navigation.launch("slow");

    navigation.dismiss(fast.frameId);
    expect(navigation.stack.length).toBe(0);
    expect(navigation.foreground.value).toBeNull();
    expect(kills).toEqual([[fast.handleId, "user"]]);

    resolveLaunch(makeHandle("h-slow", "slow"));
    await slowP;

    expect(navigation.stack.length).toBe(1);
    expect(navigation.stack[0].handleId).toBe("h-slow");
    expect(navigation.foreground.value).toBe(navigation.stack[0].frameId);
  });

  it("each spawn launch generates a unique frameId (used by AppSwitcher as Vue :key)", async () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    await navigation.launch("about");
    await navigation.launch("_template");
    await navigation.launch("third");

    const frameIds = navigation.stack.map((f) => f.frameId);
    expect(new Set(frameIds).size).toBe(3);
    expect(frameIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("spawnNew() before init() throws", async () => {
    await expect(navigation.spawnNew("terminal")).rejects.toThrow(/before init/);
  });

  it("spawnNew() always spawns a new frame even when one with the same manifestId already exists", async () => {
    const { kernel, launches } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const first = await navigation.launch("terminal");
    navigation.goHome();
    expect(navigation.foreground.value).toBeNull();

    const second = await navigation.spawnNew("terminal");

    expect(second.frameId).not.toBe(first.frameId);
    expect(navigation.stack.length).toBe(2);
    expect(navigation.stack.every((f) => f.manifestId === "terminal")).toBe(true);
    expect(launches).toEqual(["terminal", "terminal"]);
    expect(navigation.foreground.value).toBe(second.frameId);
  });

  it("spawnNew() sets foreground without pushing browser history", async () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const pushSpy = vi.spyOn(window.history, "pushState");
    const frame = await navigation.spawnNew("terminal");

    expect(navigation.foreground.value).toBe(frame.frameId);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("spawnNew() is serialized with launch() via pushChain — stack order is deterministic", async () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const a = navigation.launch("about");
    const b = navigation.spawnNew("terminal");
    const c = navigation.spawnNew("terminal");

    await Promise.all([a, b, c]);

    expect(navigation.stack.length).toBe(3);
    expect(navigation.stack.map((f) => f.manifestId)).toEqual(["about", "terminal", "terminal"]);
  });

  it("AppSwitcher can show and switch between two spawnNew frames of the same manifest", async () => {
    const { kernel } = makeKernelMock();
    navigation.init(kernel as unknown as Kernel);

    const t1 = await navigation.spawnNew("terminal");
    const t2 = await navigation.spawnNew("terminal");

    expect(navigation.stack.length).toBe(2);
    expect(t1.frameId).not.toBe(t2.frameId);
    expect(navigation.foreground.value).toBe(t2.frameId);

    navigation.focusFrame(t1.frameId);
    expect(navigation.foreground.value).toBe(t1.frameId);
  });
});
