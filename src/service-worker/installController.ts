import { computed, readonly, ref, type ComputedRef, type Ref } from "vue";

export type PwaInstallState =
  | { kind: "hidden" }
  | { kind: "native-prompt"; prompting: boolean }
  | { kind: "ios-tip" };

export type PwaInstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

export interface BeforeInstallPromptChoice {
  readonly outcome: "accepted" | "dismissed";
  readonly platform?: string;
}

export interface BeforeInstallPromptEventLike extends Event {
  readonly platforms?: readonly string[];
  readonly userChoice?: Promise<BeforeInstallPromptChoice>;
  prompt(): Promise<void>;
}

export interface PwaInstallStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PwaInstallNavigatorLike {
  readonly maxTouchPoints?: number;
  readonly onLine?: boolean;
  readonly platform?: string;
  readonly standalone?: boolean;
  readonly userAgent?: string;
}

export interface PwaInstallWindowLike {
  readonly localStorage?: PwaInstallStorageLike;
  readonly navigator?: PwaInstallNavigatorLike;
  addEventListener(type: "appinstalled", listener: EventListener): void;
  addEventListener(type: "beforeinstallprompt", listener: EventListener): void;
  removeEventListener(type: "appinstalled", listener: EventListener): void;
  removeEventListener(type: "beforeinstallprompt", listener: EventListener): void;
  matchMedia?(query: string): Pick<MediaQueryList, "matches">;
}

export interface RegisterPwaInstallPromptOptions {
  readonly window?: PwaInstallWindowLike;
  readonly navigator?: PwaInstallNavigatorLike;
  readonly storage?: PwaInstallStorageLike;
}

interface ActivePwaInstallContext {
  readonly window: PwaInstallWindowLike;
  readonly navigator: PwaInstallNavigatorLike;
  readonly storage?: PwaInstallStorageLike;
}

export interface PwaInstallController {
  readonly state: Readonly<Ref<PwaInstallState>>;
  readonly isVisible: Readonly<ComputedRef<boolean>>;
  register(options?: RegisterPwaInstallPromptOptions): () => void;
  promptInstall(): Promise<PwaInstallPromptOutcome>;
  dismiss(): void;
  resetForTests(): void;
}

export const PWA_INSTALL_DISMISSED_KEY = "pwa-install:dismissed";

const stateRef = ref<PwaInstallState>({ kind: "hidden" });
const isVisible = computed(() => stateRef.value.kind !== "hidden");

let deferredPrompt: BeforeInstallPromptEventLike | undefined;
let promptPromise: Promise<PwaInstallPromptOutcome> | undefined;
let activeContext: ActivePwaInstallContext | undefined;
let activeDisposer: (() => void) | undefined;

function noop(): void {}

function defaultWindow(): PwaInstallWindowLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}

function defaultNavigator(windowLike: PwaInstallWindowLike | undefined): PwaInstallNavigatorLike {
  return windowLike?.navigator ?? globalThis.navigator ?? {};
}

function defaultStorage(
  windowLike: PwaInstallWindowLike | undefined,
): PwaInstallStorageLike | undefined {
  return windowLike?.localStorage ?? globalThis.localStorage;
}

function makeContext(
  options: RegisterPwaInstallPromptOptions = {},
): ActivePwaInstallContext | undefined {
  const windowLike = options.window ?? defaultWindow();
  if (!windowLike) {
    return undefined;
  }

  return {
    window: windowLike,
    navigator: options.navigator ?? defaultNavigator(windowLike),
    storage: options.storage ?? defaultStorage(windowLike),
  };
}

function readDismissed(storage: PwaInstallStorageLike | undefined): boolean {
  try {
    return storage?.getItem(PWA_INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(storage: PwaInstallStorageLike | undefined): void {
  try {
    storage?.setItem(PWA_INSTALL_DISMISSED_KEY, "1");
  } catch {
    // Storage can be blocked in private modes. Treat dismissal as session-only.
  }
}

function clearDismissed(storage: PwaInstallStorageLike | undefined): void {
  try {
    storage?.removeItem(PWA_INSTALL_DISMISSED_KEY);
  } catch {}
}

function isStandalone(ctx: ActivePwaInstallContext): boolean {
  if (ctx.navigator.standalone === true) {
    return true;
  }

  try {
    return ctx.window.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}

function isIosNavigator(navigatorLike: PwaInstallNavigatorLike): boolean {
  const platform = navigatorLike.platform ?? "";
  const ua = navigatorLike.userAgent ?? "";

  return (
    /iPad|iPhone|iPod/i.test(platform) ||
    /iPad|iPhone|iPod/i.test(ua) ||
    (platform === "MacIntel" && (navigatorLike.maxTouchPoints ?? 0) > 1)
  );
}

function syncPassiveState(): void {
  const ctx = activeContext;
  if (!ctx || isStandalone(ctx) || readDismissed(ctx.storage)) {
    stateRef.value = { kind: "hidden" };
    return;
  }

  if (deferredPrompt) {
    stateRef.value = { kind: "native-prompt", prompting: false };
    return;
  }

  if (isIosNavigator(ctx.navigator)) {
    stateRef.value = { kind: "ios-tip" };
    return;
  }

  stateRef.value = { kind: "hidden" };
}

export const pwaInstallController: PwaInstallController = {
  state: readonly(stateRef),
  isVisible,

  register(options = {}): () => void {
    activeDisposer?.();
    activeDisposer = undefined;
    deferredPrompt = undefined;
    promptPromise = undefined;

    const ctx = makeContext(options);
    activeContext = ctx;
    if (!ctx) {
      stateRef.value = { kind: "hidden" };
      return noop;
    }

    const onBeforeInstallPrompt: EventListener = (event) => {
      const promptEvent = event as BeforeInstallPromptEventLike;
      promptEvent.preventDefault();

      if (isStandalone(ctx) || readDismissed(ctx.storage)) {
        deferredPrompt = undefined;
        stateRef.value = { kind: "hidden" };
        return;
      }

      deferredPrompt = promptEvent;
      stateRef.value = { kind: "native-prompt", prompting: false };
    };

    const onAppInstalled: EventListener = () => {
      deferredPrompt = undefined;
      promptPromise = undefined;
      clearDismissed(ctx.storage);
      stateRef.value = { kind: "hidden" };
    };

    ctx.window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    ctx.window.addEventListener("appinstalled", onAppInstalled);

    const dispose = (): void => {
      ctx.window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      ctx.window.removeEventListener("appinstalled", onAppInstalled);
      if (activeDisposer === dispose) {
        activeDisposer = undefined;
        activeContext = undefined;
      }
    };

    activeDisposer = dispose;
    syncPassiveState();

    return dispose;
  },

  promptInstall(): Promise<PwaInstallPromptOutcome> {
    if (promptPromise) {
      return promptPromise;
    }

    const promptEvent = deferredPrompt;
    const ctx = activeContext;
    if (!promptEvent || !ctx) {
      stateRef.value = { kind: "hidden" };
      return Promise.resolve("unavailable");
    }

    deferredPrompt = undefined;
    stateRef.value = { kind: "native-prompt", prompting: true };

    promptPromise = (async (): Promise<PwaInstallPromptOutcome> => {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice?.catch(() => undefined);
        if (choice?.outcome === "dismissed") {
          writeDismissed(ctx.storage);
          return "dismissed";
        }

        clearDismissed(ctx.storage);
        return choice?.outcome === "accepted" ? "accepted" : "unavailable";
      } catch {
        return "unavailable";
      } finally {
        promptPromise = undefined;
        stateRef.value = { kind: "hidden" };
      }
    })();

    return promptPromise;
  },

  dismiss(): void {
    writeDismissed(activeContext?.storage);
    deferredPrompt = undefined;
    promptPromise = undefined;
    stateRef.value = { kind: "hidden" };
  },

  resetForTests(): void {
    activeDisposer?.();
    activeDisposer = undefined;
    activeContext = undefined;
    deferredPrompt = undefined;
    promptPromise = undefined;
    stateRef.value = { kind: "hidden" };
  },
};

export function registerPwaInstallPrompt(
  options: RegisterPwaInstallPromptOptions = {},
): () => void {
  return pwaInstallController.register(options);
}
