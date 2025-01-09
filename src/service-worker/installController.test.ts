import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PWA_INSTALL_DISMISSED_KEY,
  pwaInstallController,
  type BeforeInstallPromptEventLike,
  type PwaInstallStorageLike,
  type PwaInstallWindowLike,
} from "~/service-worker/installController";

function createStorage(initial: Record<string, string> = {}): PwaInstallStorageLike & {
  readonly data: Record<string, string>;
} {
  const data = { ...initial };

  return {
    data,
    getItem(key) {
      return data[key] ?? null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

function createThrowingStorage(): PwaInstallStorageLike {
  return {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
}

function createWindowStub(options: { standalone?: boolean } = {}) {
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
    matchMedia: vi.fn(() => ({ matches: options.standalone === true })),
  };

  return {
    listeners,
    windowLike,
    fire(type: "appinstalled" | "beforeinstallprompt", event: Event = new Event(type)): void {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
}

function createPromptEvent(
  outcome: "accepted" | "dismissed" = "accepted",
): BeforeInstallPromptEventLike & {
  readonly prompt: ReturnType<typeof vi.fn<() => Promise<void>>>;
} {
  const event = new Event("beforeinstallprompt", {
    cancelable: true,
  }) as BeforeInstallPromptEventLike & {
    prompt: ReturnType<typeof vi.fn<() => Promise<void>>>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };

  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome });

  return event;
}

describe("pwaInstallController", () => {
  afterEach(() => {
    pwaInstallController.resetForTests();
  });

  it("starts hidden in non-iOS browsers before a native prompt event", () => {
    const win = createWindowStub();
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel", maxTouchPoints: 0 },
      storage: createStorage(),
    });

    expect(pwaInstallController.state.value).toEqual({ kind: "hidden" });
    expect(pwaInstallController.isVisible.value).toBe(false);
  });

  it("shows manual iOS guidance when not standalone and not dismissed", () => {
    const win = createWindowStub();
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Mobile Safari", platform: "iPhone", maxTouchPoints: 5 },
      storage: createStorage(),
    });

    expect(pwaInstallController.state.value).toEqual({ kind: "ios-tip" });
    expect(pwaInstallController.isVisible.value).toBe(true);
  });

  it("stays hidden when already running standalone", () => {
    const win = createWindowStub({ standalone: true });
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Mobile Safari", platform: "iPhone", maxTouchPoints: 5 },
      storage: createStorage(),
    });

    expect(pwaInstallController.state.value).toEqual({ kind: "hidden" });
  });

  it("uses navigator.standalone as an iOS standalone signal", () => {
    const win = createWindowStub();
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { standalone: true, userAgent: "Mobile Safari", platform: "iPhone" },
      storage: createStorage(),
    });

    expect(pwaInstallController.state.value).toEqual({ kind: "hidden" });
  });

  it("captures the native beforeinstallprompt event and prevents the default prompt", () => {
    const win = createWindowStub();
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel" },
      storage: createStorage(),
    });
    const event = createPromptEvent();

    win.fire("beforeinstallprompt", event);

    expect(event.defaultPrevented).toBe(true);
    expect(pwaInstallController.state.value).toEqual({
      kind: "native-prompt",
      prompting: false,
    });
  });

  it("prompts once, clears the one-shot event, and records accepted outcomes", async () => {
    const win = createWindowStub();
    const storage = createStorage();
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel" },
      storage,
    });
    const event = createPromptEvent("accepted");
    win.fire("beforeinstallprompt", event);

    const first = pwaInstallController.promptInstall();
    const second = pwaInstallController.promptInstall();

    expect(pwaInstallController.state.value).toEqual({
      kind: "native-prompt",
      prompting: true,
    });

    await expect(first).resolves.toBe("accepted");
    await expect(second).resolves.toBe("accepted");

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(storage.getItem(PWA_INSTALL_DISMISSED_KEY)).toBeNull();
    expect(pwaInstallController.state.value).toEqual({ kind: "hidden" });
    await expect(pwaInstallController.promptInstall()).resolves.toBe("unavailable");
  });

  it("persists dismissal when the native prompt is dismissed", async () => {
    const win = createWindowStub();
    const storage = createStorage();
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel" },
      storage,
    });
    win.fire("beforeinstallprompt", createPromptEvent("dismissed"));

    await expect(pwaInstallController.promptInstall()).resolves.toBe("dismissed");

    expect(storage.getItem(PWA_INSTALL_DISMISSED_KEY)).toBe("1");
    expect(pwaInstallController.state.value).toEqual({ kind: "hidden" });
  });

  it("clears the one-shot event when prompt rejects", async () => {
    const win = createWindowStub();
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel" },
      storage: createStorage(),
    });
    const event = createPromptEvent("accepted");
    event.prompt.mockRejectedValueOnce(new Error("prompt unavailable"));
    win.fire("beforeinstallprompt", event);

    await expect(pwaInstallController.promptInstall()).resolves.toBe("unavailable");
    await expect(pwaInstallController.promptInstall()).resolves.toBe("unavailable");

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(pwaInstallController.state.value).toEqual({ kind: "hidden" });
  });

  it("dismiss persists and suppresses later native prompt events", () => {
    const win = createWindowStub();
    const storage = createStorage();
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel" },
      storage,
    });
    win.fire("beforeinstallprompt", createPromptEvent());

    pwaInstallController.dismiss();
    win.fire("beforeinstallprompt", createPromptEvent());

    expect(storage.getItem(PWA_INSTALL_DISMISSED_KEY)).toBe("1");
    expect(pwaInstallController.state.value).toEqual({ kind: "hidden" });
  });

  it("appinstalled clears dismissal and hides any prompt", () => {
    const win = createWindowStub();
    const storage = createStorage({ [PWA_INSTALL_DISMISSED_KEY]: "1" });
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel" },
      storage,
    });

    win.fire("appinstalled");

    expect(storage.getItem(PWA_INSTALL_DISMISSED_KEY)).toBeNull();
    expect(pwaInstallController.state.value).toEqual({ kind: "hidden" });
  });

  it("treats blocked storage as non-fatal", () => {
    const win = createWindowStub();
    pwaInstallController.register({
      window: win.windowLike,
      navigator: { userAgent: "Mobile Safari", platform: "iPhone" },
      storage: createThrowingStorage(),
    });

    expect(() => pwaInstallController.dismiss()).not.toThrow();
    expect(pwaInstallController.state.value).toEqual({ kind: "hidden" });
  });

  it("re-registers idempotently and disposes stale listeners", () => {
    const first = createWindowStub();
    const second = createWindowStub();

    pwaInstallController.register({
      window: first.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel" },
      storage: createStorage(),
    });
    pwaInstallController.register({
      window: second.windowLike,
      navigator: { userAgent: "Chrome", platform: "MacIntel" },
      storage: createStorage(),
    });

    expect(first.listeners.get("beforeinstallprompt")?.size).toBe(0);
    expect(second.listeners.get("beforeinstallprompt")?.size).toBe(1);
  });
});
