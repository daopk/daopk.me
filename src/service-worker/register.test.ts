import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canRegisterAppServiceWorker,
  registerAppServiceWorker,
  type AppServiceWorkerRegistrar,
} from "~/service-worker/register";
import type { ServiceWorkerUpdateController } from "~/service-worker/updateController";

import type { RegisterSWOptions } from "virtual:pwa-register";

vi.mock("virtual:pwa-register", () => ({
  registerSW: vi.fn(),
}));

vi.mock("~/core/debug", () => ({
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
}));

const prodEnv = { PROD: true };
const devEnv = { PROD: false };
const serviceWorkerNavigator = { serviceWorker: {} };

function makeUpdateController(): Pick<
  ServiceWorkerUpdateController,
  | "clearUpdateInstalling"
  | "notifyOfflineReady"
  | "notifyUpdateAvailable"
  | "notifyUpdateInstalling"
  | "setUpdateChecker"
> {
  return {
    clearUpdateInstalling: vi.fn(),
    notifyOfflineReady: vi.fn(),
    notifyUpdateAvailable: vi.fn(),
    notifyUpdateInstalling: vi.fn(),
    setUpdateChecker: vi.fn(),
  };
}

type MockServiceWorker = ServiceWorker & {
  state: ServiceWorkerState;
  dispatchStateChange(): void;
};

type MockServiceWorkerRegistration = ServiceWorkerRegistration & {
  active: ServiceWorker | null;
  installing: ServiceWorker | null;
  waiting: ServiceWorker | null;
  dispatchUpdateFound(): void;
};

function dispatchMockEvent(
  target: EventTarget,
  listeners: Set<EventListenerOrEventListenerObject>,
  type: string,
): void {
  const event = new Event(type);

  for (const listener of listeners) {
    if (typeof listener === "function") {
      listener.call(target, event);
      continue;
    }

    listener.handleEvent(event);
  }
}

function makeServiceWorker(state: ServiceWorkerState = "installing"): MockServiceWorker {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const worker = {
    state,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "statechange") {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "statechange") {
        listeners.delete(listener);
      }
    }),
    dispatchStateChange: () => dispatchMockEvent(worker, listeners, "statechange"),
  } as unknown as MockServiceWorker;

  return worker;
}

function makeServiceWorkerRegistration(
  options: {
    active?: ServiceWorker | null;
    installing?: ServiceWorker | null;
    waiting?: ServiceWorker | null;
    update?: () => Promise<unknown>;
  } = {},
): MockServiceWorkerRegistration {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const active = "active" in options ? (options.active ?? null) : ({} as ServiceWorker);
  const installing = "installing" in options ? (options.installing ?? null) : null;
  const waiting = "waiting" in options ? (options.waiting ?? null) : null;
  const registration = {
    active,
    installing,
    waiting,
    update: vi.fn(async () => {
      await options.update?.();
      return registration;
    }),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "updatefound") {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "updatefound") {
        listeners.delete(listener);
      }
    }),
    dispatchUpdateFound: () => dispatchMockEvent(registration, listeners, "updatefound"),
  } as unknown as MockServiceWorkerRegistration;

  return registration;
}

describe("service worker registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is allowed only in production when service workers exist", () => {
    expect(canRegisterAppServiceWorker(prodEnv, serviceWorkerNavigator)).toBe(true);
    expect(canRegisterAppServiceWorker(devEnv, serviceWorkerNavigator)).toBe(false);
    expect(canRegisterAppServiceWorker(prodEnv, {})).toBe(false);
    expect(canRegisterAppServiceWorker(prodEnv, undefined)).toBe(false);
  });

  it("no-ops outside production", () => {
    const register = vi.fn() as unknown as AppServiceWorkerRegistrar;

    expect(
      registerAppServiceWorker({
        env: devEnv,
        navigator: serviceWorkerNavigator,
        register,
      }),
    ).toBe(false);

    expect(register).not.toHaveBeenCalled();
  });

  it("no-ops when service workers are unavailable", () => {
    const register = vi.fn() as unknown as AppServiceWorkerRegistrar;

    expect(
      registerAppServiceWorker({
        env: prodEnv,
        navigator: {},
        register,
      }),
    ).toBe(false);

    expect(register).not.toHaveBeenCalled();
  });

  it("registers immediately with prompt-safe callbacks", () => {
    let capturedOptions: RegisterSWOptions | undefined;
    const update = vi.fn(async () => undefined);
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return update;
    });
    const updateController = makeUpdateController();

    expect(
      registerAppServiceWorker({
        env: prodEnv,
        navigator: serviceWorkerNavigator,
        register,
        updateController,
      }),
    ).toBe(true);

    expect(register).toHaveBeenCalledTimes(1);
    expect(capturedOptions).toEqual(
      expect.objectContaining({
        immediate: true,
        onNeedReload: expect.any(Function),
        onNeedRefresh: expect.any(Function),
        onOfflineReady: expect.any(Function),
        onRegisteredSW: expect.any(Function),
        onRegisterError: expect.any(Function),
      }),
    );

    expect(() => capturedOptions?.onNeedRefresh?.()).not.toThrow();
    expect(() => capturedOptions?.onOfflineReady?.()).not.toThrow();
    expect(() => capturedOptions?.onRegisterError?.(new Error("offline"))).not.toThrow();
  });

  it("marks update available without refreshing until the controller action runs", async () => {
    let capturedOptions: RegisterSWOptions | undefined;
    let capturedUpdateAction: (() => Promise<void>) | undefined;
    const update = vi.fn(async () => undefined);
    const updateController: Pick<
      ServiceWorkerUpdateController,
      | "clearUpdateInstalling"
      | "notifyOfflineReady"
      | "notifyUpdateAvailable"
      | "notifyUpdateInstalling"
      | "setUpdateChecker"
    > = {
      clearUpdateInstalling: vi.fn(),
      notifyOfflineReady: vi.fn(),
      notifyUpdateAvailable: vi.fn((action) => {
        capturedUpdateAction = action;
      }),
      notifyUpdateInstalling: vi.fn(),
      setUpdateChecker: vi.fn(),
    };
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return update;
    });

    registerAppServiceWorker({
      env: prodEnv,
      navigator: serviceWorkerNavigator,
      register,
      updateController,
    });

    capturedOptions?.onNeedRefresh?.();

    expect(updateController.notifyUpdateAvailable).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();

    await capturedUpdateAction?.();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(true);
  });

  it("wires manual update checks to the service worker registration", async () => {
    let capturedOptions: RegisterSWOptions | undefined;
    let capturedCheck: (() => Promise<void>) | undefined;
    const registration = makeServiceWorkerRegistration({ waiting: null });
    const updateController: Pick<
      ServiceWorkerUpdateController,
      | "clearUpdateInstalling"
      | "notifyOfflineReady"
      | "notifyUpdateAvailable"
      | "notifyUpdateInstalling"
      | "setUpdateChecker"
    > = {
      clearUpdateInstalling: vi.fn(),
      notifyOfflineReady: vi.fn(),
      notifyUpdateAvailable: vi.fn(),
      notifyUpdateInstalling: vi.fn(),
      setUpdateChecker: vi.fn((check) => {
        capturedCheck = check;
      }),
    };
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return vi.fn(async () => undefined);
    });

    registerAppServiceWorker({
      env: prodEnv,
      navigator: serviceWorkerNavigator,
      register,
      updateController,
    });

    capturedOptions?.onRegisteredSW?.("/sw.js", registration);
    await capturedCheck?.();

    expect(updateController.setUpdateChecker).toHaveBeenCalledTimes(1);
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(updateController.notifyUpdateAvailable).not.toHaveBeenCalled();
  });

  it("manual update checks surface a waiting worker", async () => {
    let capturedOptions: RegisterSWOptions | undefined;
    let capturedCheck: (() => Promise<void>) | undefined;
    let registration: MockServiceWorkerRegistration;
    registration = makeServiceWorkerRegistration({
      update: async () => {
        registration.waiting = {} as ServiceWorker;
      },
    });
    const updateController: Pick<
      ServiceWorkerUpdateController,
      | "clearUpdateInstalling"
      | "notifyOfflineReady"
      | "notifyUpdateAvailable"
      | "notifyUpdateInstalling"
      | "setUpdateChecker"
    > = {
      clearUpdateInstalling: vi.fn(),
      notifyOfflineReady: vi.fn(),
      notifyUpdateAvailable: vi.fn(),
      notifyUpdateInstalling: vi.fn(),
      setUpdateChecker: vi.fn((check) => {
        capturedCheck = check;
      }),
    };
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return vi.fn(async () => undefined);
    });

    registerAppServiceWorker({
      env: prodEnv,
      navigator: serviceWorkerNavigator,
      register,
      updateController,
    });

    capturedOptions?.onRegisteredSW?.("/sw.js", registration);
    await capturedCheck?.();

    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(updateController.notifyUpdateAvailable).toHaveBeenCalledTimes(1);
  });

  it("marks an active registration as installing when updatefound exposes a worker", () => {
    let capturedOptions: RegisterSWOptions | undefined;
    const worker = makeServiceWorker("installing");
    const registration = makeServiceWorkerRegistration({ installing: null, waiting: null });
    const updateController = makeUpdateController();
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return vi.fn(async () => undefined);
    });

    registerAppServiceWorker({
      env: prodEnv,
      navigator: serviceWorkerNavigator,
      register,
      updateController,
    });

    capturedOptions?.onRegisteredSW?.("/sw.js", registration);
    registration.installing = worker;
    registration.dispatchUpdateFound();

    expect(updateController.notifyUpdateInstalling).toHaveBeenCalledTimes(1);
    expect(updateController.notifyUpdateAvailable).not.toHaveBeenCalled();

    registration.waiting = worker;
    worker.state = "installed";
    worker.dispatchStateChange();

    expect(updateController.notifyUpdateAvailable).toHaveBeenCalledTimes(1);
  });

  it("does not surface updatefound during the first service worker install", () => {
    let capturedOptions: RegisterSWOptions | undefined;
    const worker = makeServiceWorker("installing");
    const registration = makeServiceWorkerRegistration({
      active: null,
      installing: worker,
      waiting: null,
    });
    const updateController = makeUpdateController();
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return vi.fn(async () => undefined);
    });

    registerAppServiceWorker({
      env: prodEnv,
      navigator: serviceWorkerNavigator,
      register,
      updateController,
    });

    capturedOptions?.onRegisteredSW?.("/sw.js", registration);
    registration.dispatchUpdateFound();
    worker.dispatchStateChange();

    expect(updateController.notifyUpdateInstalling).not.toHaveBeenCalled();
    expect(updateController.notifyUpdateAvailable).not.toHaveBeenCalled();
  });

  it("surfaces workers that are already installing or waiting when registration completes", () => {
    let capturedOptions: RegisterSWOptions | undefined;
    const installingWorker = makeServiceWorker("installing");
    const registration = makeServiceWorkerRegistration({ installing: installingWorker });
    const updateController = makeUpdateController();
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return vi.fn(async () => undefined);
    });

    registerAppServiceWorker({
      env: prodEnv,
      navigator: serviceWorkerNavigator,
      register,
      updateController,
    });

    capturedOptions?.onRegisteredSW?.("/sw.js", registration);

    expect(updateController.notifyUpdateInstalling).toHaveBeenCalledTimes(1);

    registration.waiting = installingWorker;
    capturedOptions?.onRegisteredSW?.("/sw.js", registration);

    expect(updateController.notifyUpdateAvailable).toHaveBeenCalledTimes(1);
  });

  it("clears the installing state when the discovered worker becomes redundant", () => {
    let capturedOptions: RegisterSWOptions | undefined;
    const worker = makeServiceWorker("installing");
    const registration = makeServiceWorkerRegistration({ installing: worker, waiting: null });
    const updateController = makeUpdateController();
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return vi.fn(async () => undefined);
    });

    registerAppServiceWorker({
      env: prodEnv,
      navigator: serviceWorkerNavigator,
      register,
      updateController,
    });

    capturedOptions?.onRegisteredSW?.("/sw.js", registration);
    worker.state = "redundant";
    worker.dispatchStateChange();

    expect(updateController.notifyUpdateInstalling).toHaveBeenCalledTimes(1);
    expect(updateController.clearUpdateInstalling).toHaveBeenCalledTimes(1);
  });

  it("marks offline ready through the injected update controller", () => {
    let capturedOptions: RegisterSWOptions | undefined;
    const updateController = makeUpdateController();
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return vi.fn(async () => undefined);
    });

    registerAppServiceWorker({
      env: prodEnv,
      navigator: serviceWorkerNavigator,
      register,
      updateController,
    });

    capturedOptions?.onOfflineReady?.();

    expect(updateController.notifyOfflineReady).toHaveBeenCalledTimes(1);
  });

  it("reloads when the updated service worker takes control", () => {
    let capturedOptions: RegisterSWOptions | undefined;
    const reload = vi.fn();
    const register: AppServiceWorkerRegistrar = vi.fn((options) => {
      capturedOptions = options;

      return vi.fn(async () => undefined);
    });

    registerAppServiceWorker({
      env: prodEnv,
      navigator: serviceWorkerNavigator,
      register,
      reload,
    });

    capturedOptions?.onNeedReload?.();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("swallows synchronous setup failures", async () => {
    const { debugWarn } = await import("~/core/debug");
    const error = new Error("virtual module exploded");
    const register: AppServiceWorkerRegistrar = vi.fn(() => {
      throw error;
    });

    expect(
      registerAppServiceWorker({
        env: prodEnv,
        navigator: serviceWorkerNavigator,
        register,
      }),
    ).toBe(false);

    expect(debugWarn).toHaveBeenCalledWith("[service-worker]", "registration setup failed", error);
  });
});
