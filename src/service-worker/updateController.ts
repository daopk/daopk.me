import { computed, readonly, ref, type ComputedRef, type Ref } from "vue";

export type ServiceWorkerUpdateState =
  | { kind: "idle" }
  | { kind: "offline-ready" }
  | { kind: "update-available"; refreshing: boolean }
  | { kind: "refresh-error"; message: string };

export type ServiceWorkerUpdateCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "check-error"; message: string };

export type ServiceWorkerUpdateChecker = () => Promise<void>;

export interface ServiceWorkerUpdateController {
  readonly state: Readonly<Ref<ServiceWorkerUpdateState>>;
  readonly checkState: Readonly<Ref<ServiceWorkerUpdateCheckState>>;
  readonly hasSettingsAttention: Readonly<ComputedRef<boolean>>;
  notifyOfflineReady(): void;
  notifyUpdateAvailable(update: () => Promise<void>): void;
  setUpdateChecker(checker: ServiceWorkerUpdateChecker | undefined): void;
  checkForUpdate(): Promise<void>;
  dismiss(): void;
  refresh(): Promise<void>;
  resetForTests(): void;
}

const OFFLINE_READY_VISIBLE_MS = 3_000;
const NO_UPDATE_CHECKER_MESSAGE = "Manual update checks are not available in this build.";

const stateRef = ref<ServiceWorkerUpdateState>({ kind: "idle" });
const checkStateRef = ref<ServiceWorkerUpdateCheckState>({ kind: "idle" });
const hasSettingsAttention = computed(
  () => stateRef.value.kind === "update-available" || stateRef.value.kind === "refresh-error",
);

let updateCallback: (() => Promise<void>) | undefined;
let updateChecker: ServiceWorkerUpdateChecker | undefined;
let offlineReadyTimer: ReturnType<typeof setTimeout> | undefined;
let refreshPromise: Promise<void> | undefined;
let checkPromise: Promise<void> | undefined;
let updateGeneration = 0;

function clearOfflineReadyTimer(): void {
  if (offlineReadyTimer === undefined) {
    return;
  }

  clearTimeout(offlineReadyTimer);
  offlineReadyTimer = undefined;
}

function setIdle(): void {
  clearOfflineReadyTimer();
  stateRef.value = { kind: "idle" };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Try again when you're back online.";
}

export const serviceWorkerUpdateController: ServiceWorkerUpdateController = {
  state: readonly(stateRef),
  checkState: readonly(checkStateRef),
  hasSettingsAttention,

  notifyOfflineReady(): void {
    if (stateRef.value.kind === "update-available" || stateRef.value.kind === "refresh-error") {
      return;
    }

    clearOfflineReadyTimer();
    stateRef.value = { kind: "offline-ready" };
    offlineReadyTimer = setTimeout(() => {
      offlineReadyTimer = undefined;
      if (stateRef.value.kind === "offline-ready") {
        stateRef.value = { kind: "idle" };
      }
    }, OFFLINE_READY_VISIBLE_MS);
  },

  notifyUpdateAvailable(update): void {
    clearOfflineReadyTimer();
    updateGeneration += 1;
    updateCallback = update;
    refreshPromise = undefined;
    checkStateRef.value = { kind: "idle" };
    stateRef.value = { kind: "update-available", refreshing: false };
  },

  setUpdateChecker(checker): void {
    updateChecker = checker;
  },

  checkForUpdate(): Promise<void> {
    if (checkStateRef.value.kind === "checking") {
      return checkPromise ?? Promise.resolve();
    }

    if (stateRef.value.kind === "update-available" || stateRef.value.kind === "refresh-error") {
      checkStateRef.value = { kind: "idle" };
      return Promise.resolve();
    }

    if (updateChecker === undefined) {
      checkStateRef.value = { kind: "check-error", message: NO_UPDATE_CHECKER_MESSAGE };
      return Promise.resolve();
    }

    clearOfflineReadyTimer();
    checkStateRef.value = { kind: "checking" };
    const checkGeneration = updateGeneration;

    let nextCheckPromise: Promise<void>;
    nextCheckPromise = updateChecker()
      .then(() => {
        if (checkGeneration !== updateGeneration) {
          return;
        }

        if (stateRef.value.kind === "update-available" || stateRef.value.kind === "refresh-error") {
          return;
        }

        checkStateRef.value = { kind: "up-to-date" };
      })
      .catch((error: unknown) => {
        if (checkGeneration !== updateGeneration) {
          return;
        }

        checkStateRef.value = { kind: "check-error", message: errorMessage(error) };
      })
      .finally(() => {
        if (checkPromise === nextCheckPromise) {
          checkPromise = undefined;
        }
      });

    checkPromise = nextCheckPromise;

    return nextCheckPromise;
  },

  dismiss(): void {
    updateGeneration += 1;
    updateCallback = undefined;
    refreshPromise = undefined;
    checkStateRef.value = { kind: "idle" };
    setIdle();
  },

  refresh(): Promise<void> {
    if (stateRef.value.kind === "update-available" && stateRef.value.refreshing) {
      return refreshPromise ?? Promise.resolve();
    }

    if (updateCallback === undefined) {
      return Promise.resolve();
    }

    clearOfflineReadyTimer();
    stateRef.value = { kind: "update-available", refreshing: true };
    const refreshGeneration = updateGeneration;

    refreshPromise = updateCallback()
      .then(() => {
        // Keep the row busy so Settings/dock do not hide the pending update
        // while Workbox waits for the controlling event.
      })
      .catch((error: unknown) => {
        if (refreshGeneration !== updateGeneration) {
          return;
        }

        clearOfflineReadyTimer();
        stateRef.value = { kind: "refresh-error", message: errorMessage(error) };
      })
      .finally(() => {
        if (refreshGeneration === updateGeneration) {
          refreshPromise = undefined;
        }
      });

    return refreshPromise;
  },

  resetForTests(): void {
    clearOfflineReadyTimer();
    updateGeneration += 1;
    updateCallback = undefined;
    updateChecker = undefined;
    refreshPromise = undefined;
    checkPromise = undefined;
    stateRef.value = { kind: "idle" };
    checkStateRef.value = { kind: "idle" };
  },
};
