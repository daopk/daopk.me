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
  "notifyOfflineReady" | "notifyUpdateAvailable" | "setUpdateChecker"
> {
  return {
    notifyOfflineReady: vi.fn(),
    notifyUpdateAvailable: vi.fn(),
    setUpdateChecker: vi.fn(),
  };
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
      "notifyOfflineReady" | "notifyUpdateAvailable" | "setUpdateChecker"
    > = {
      notifyOfflineReady: vi.fn(),
      notifyUpdateAvailable: vi.fn((action) => {
        capturedUpdateAction = action;
      }),
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
    const registration = {
      waiting: null,
      update: vi.fn(async () => registration),
    } as unknown as ServiceWorkerRegistration;
    const updateController: Pick<
      ServiceWorkerUpdateController,
      "notifyOfflineReady" | "notifyUpdateAvailable" | "setUpdateChecker"
    > = {
      notifyOfflineReady: vi.fn(),
      notifyUpdateAvailable: vi.fn(),
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
    let waitingWorker: ServiceWorker | null = null;
    const registration = {
      get waiting() {
        return waitingWorker;
      },
      update: vi.fn(async () => {
        waitingWorker = {} as ServiceWorker;
        return registration;
      }),
    } as unknown as ServiceWorkerRegistration;
    const updateController: Pick<
      ServiceWorkerUpdateController,
      "notifyOfflineReady" | "notifyUpdateAvailable" | "setUpdateChecker"
    > = {
      notifyOfflineReady: vi.fn(),
      notifyUpdateAvailable: vi.fn(),
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
