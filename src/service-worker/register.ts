import { registerSW, type RegisterSWOptions } from "virtual:pwa-register";

import { debugLog, debugWarn } from "~/core/debug";
import {
  serviceWorkerUpdateController,
  type ServiceWorkerUpdateController,
} from "~/service-worker/updateController";

export interface AppServiceWorkerEnv {
  readonly PROD: boolean;
}

export type ServiceWorkerNavigatorLike = object | undefined;

export type AppServiceWorkerRegistrar = (
  options?: RegisterSWOptions,
) => (reloadPage?: boolean) => Promise<void>;
export type AppServiceWorkerReloader = () => void;
type AppServiceWorkerUpdateAction = (reloadPage?: boolean) => Promise<void>;

export interface AppServiceWorkerRegistrationOptions {
  readonly env?: AppServiceWorkerEnv;
  readonly navigator?: ServiceWorkerNavigatorLike;
  readonly register?: AppServiceWorkerRegistrar;
  readonly reload?: AppServiceWorkerReloader;
  readonly updateController?: Pick<
    ServiceWorkerUpdateController,
    | "clearUpdateInstalling"
    | "notifyOfflineReady"
    | "notifyUpdateAvailable"
    | "notifyUpdateInstalling"
    | "setUpdateChecker"
  >;
}

export function canRegisterAppServiceWorker(
  env: AppServiceWorkerEnv = import.meta.env,
  navigatorLike: ServiceWorkerNavigatorLike = globalThis.navigator,
): boolean {
  return env.PROD === true && navigatorLike !== undefined && "serviceWorker" in navigatorLike;
}

export function registerAppServiceWorker(
  options: AppServiceWorkerRegistrationOptions = {},
): boolean {
  const env = options.env ?? import.meta.env;
  const navigatorLike = options.navigator ?? globalThis.navigator;

  if (!canRegisterAppServiceWorker(env, navigatorLike)) {
    return false;
  }

  const registrar = options.register ?? registerSW;
  const reload = options.reload ?? (() => globalThis.location.reload());
  const updateController = options.updateController ?? serviceWorkerUpdateController;

  try {
    let registrationRef: ServiceWorkerRegistration | undefined;
    let updateServiceWorker: AppServiceWorkerUpdateAction | undefined;
    const watchedInstallingWorkers = new WeakSet<ServiceWorker>();

    const applyPendingUpdate = (): Promise<void> =>
      updateServiceWorker?.(true) ?? Promise.resolve();

    const notifyUpdateAvailable = (): void => {
      updateController.notifyUpdateAvailable(applyPendingUpdate);
    };

    const watchInstallingWorker = (
      registration: ServiceWorkerRegistration,
      worker: ServiceWorker | null,
    ): void => {
      if (registration.active === null || worker === null || watchedInstallingWorkers.has(worker)) {
        return;
      }

      watchedInstallingWorkers.add(worker);
      updateController.notifyUpdateInstalling();

      const syncInstallingState = (): void => {
        if (registration.waiting !== null) {
          notifyUpdateAvailable();
          return;
        }

        if (worker.state === "redundant" || worker.state === "activated") {
          updateController.clearUpdateInstalling();
        }
      };

      worker.addEventListener("statechange", syncInstallingState);
      syncInstallingState();
    };

    const watchRegistrationUpdates = (
      registration: ServiceWorkerRegistration | undefined,
    ): void => {
      if (registration === undefined) {
        return;
      }

      if (registration.active !== null && registration.waiting !== null) {
        notifyUpdateAvailable();
      }

      watchInstallingWorker(registration, registration.installing);

      registration.addEventListener("updatefound", () => {
        watchInstallingWorker(registration, registration.installing);
      });
    };

    updateServiceWorker = registrar({
      immediate: true,
      onNeedRefresh: () => {
        debugLog("[service-worker]", "update available");
        notifyUpdateAvailable();
      },
      onOfflineReady: () => {
        debugLog("[service-worker]", "offline ready");
        updateController.notifyOfflineReady();
      },
      onRegisteredSW: (_scriptUrl, registration) => {
        registrationRef = registration;
        watchRegistrationUpdates(registration);
        updateController.setUpdateChecker(async () => {
          if (registrationRef === undefined) {
            throw new Error("No service worker registration is available yet.");
          }

          if (registrationRef.waiting !== null) {
            notifyUpdateAvailable();
            return;
          }

          await registrationRef.update();

          if (registrationRef.waiting !== null) {
            notifyUpdateAvailable();
          }
        });
      },
      onNeedReload: () => {
        debugLog("[service-worker]", "reload needed");
        reload();
      },
      onRegisterError: (error) => {
        updateController.setUpdateChecker(undefined);
        debugWarn("[service-worker]", "registration failed", error);
      },
    });

    return true;
  } catch (error: unknown) {
    debugWarn("[service-worker]", "registration setup failed", error);

    return false;
  }
}
