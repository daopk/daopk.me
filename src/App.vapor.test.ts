import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BootManagerInjectionKey } from "~/core";
import {
  clearActiveProfileSession,
  getActiveProfileSession,
  setActiveProfileSession,
} from "~/core/profile/ProfileSession";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";
import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import type { ActiveProfileSession } from "~/types/profile";

import App from "./App.vue";

const mocks = vi.hoisted(() => ({
  boot: vi.fn(),
  bootstrapGuest: vi.fn(),
  disposeLifecycle: vi.fn(),
  initialUpdateDiscovery: Promise.resolve(),
  resetBoot: vi.fn(),
}));

vi.mock("~/core/profile/ProfileLifecycle", () => ({
  createProfileLifecycle: () => ({
    bootstrapGuest: mocks.bootstrapGuest,
    linkActiveGuest: vi.fn(),
    dispose: mocks.disposeLifecycle,
  }),
}));

vi.mock("~/service-worker/register", () => ({
  registerAppServiceWorker: () => ({
    initialUpdateDiscovery: mocks.initialUpdateDiscovery,
  }),
}));

const guestSession: ActiveProfileSession = {
  profileId: "guest",
  displayName: "Guest",
  owner: { kind: "guest" },
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fakeKernel(): Kernel {
  return {
    boot: {
      status: "idle",
      progressFraction: 0,
      phaseLabel: "",
      error: null,
      scheduleIdleAfterShellReady: vi.fn(() => () => undefined),
    },
  } as unknown as Kernel;
}

describe("App profile boot coordination", () => {
  beforeEach(() => {
    clearActiveProfileSession();
    serviceWorkerUpdateController.resetForTests();
    vi.clearAllMocks();
    mocks.boot.mockResolvedValue(undefined);
    mocks.initialUpdateDiscovery = Promise.resolve();
  });

  afterEach(() => {
    clearActiveProfileSession();
    serviceWorkerUpdateController.resetForTests();
  });

  it("skips a provisional activation blocked by an update, then boots an accepted activation", async () => {
    const firstBootstrap = deferred<ActiveProfileSession>();
    const acceptedBootstrap = deferred<ActiveProfileSession>();
    let completePreflight!: () => void;
    mocks.initialUpdateDiscovery = new Promise<void>((resolve) => {
      completePreflight = resolve;
    });
    mocks.bootstrapGuest
      .mockImplementationOnce(() => firstBootstrap.promise)
      .mockImplementationOnce(() => acceptedBootstrap.promise);

    const wrapper = mount(App, {
      provide: [
        [KernelInjectionKey, fakeKernel()],
        [
          BootManagerInjectionKey,
          {
            boot: mocks.boot,
            reset: mocks.resetBoot,
          },
        ],
      ],
    });

    completePreflight();
    await flushPromises();
    expect(mocks.bootstrapGuest).toHaveBeenCalledTimes(1);

    serviceWorkerUpdateController.notifyUpdateAvailable(
      vi.fn(() => new Promise<void>(() => undefined)),
    );
    setActiveProfileSession(guestSession);
    firstBootstrap.resolve(guestSession);
    await flushPromises();

    expect(mocks.boot).not.toHaveBeenCalled();
    expect(getActiveProfileSession()).toBeNull();

    serviceWorkerUpdateController.resetForTests();
    await flushPromises();
    expect(mocks.bootstrapGuest).toHaveBeenCalledTimes(2);

    setActiveProfileSession(guestSession);
    acceptedBootstrap.resolve(guestSession);
    await flushPromises();

    expect(getActiveProfileSession()).toEqual(guestSession);
    expect(mocks.boot).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
