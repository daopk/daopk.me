import { inject, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from "vue";

import {
  AppChromeInjectionKey,
  type AppChromeBackAction,
  type AppChromeTitlebarVisibility,
} from "~/types/app";

export interface UseAppChromeOptions {
  /** Reactive title pushed to the shell chrome; kept in sync automatically. */
  title?: MaybeRefOrGetter<string | null>;
  /** Reactive back action pushed to the shell chrome. */
  backAction?: MaybeRefOrGetter<AppChromeBackAction | null>;
  /** Reactive mobile titlebar visibility override; `null` falls back to the manifest default. */
  titlebar?: MaybeRefOrGetter<AppChromeTitlebarVisibility | null>;
}

export interface UseAppChrome {
  /** `false` on shells that do not surface app chrome (e.g. the desktop window). */
  readonly available: boolean;
  setTitle(title: string | null): void;
  setBackAction(action: AppChromeBackAction | null): void;
  setTitlebar(visibility: AppChromeTitlebarVisibility | null): void;
  hide(): void;
  close(): void;
}

/**
 * Wrap `AppChromeInjectionKey` so apps set the shell title / back action the
 * same way regardless of shell. The mobile shell provides the controller (it
 * drives the AppView header); the desktop window does not, so calls no-op
 * there instead of forcing every app to null-check the injection.
 *
 * Pass reactive `title` / `backAction` / `titlebar` to keep the chrome in sync,
 * or call the returned setters imperatively. Whatever this scope sets is cleared on
 * unmount so the next frame starts clean.
 */
export function useAppChrome(options: UseAppChromeOptions = {}): UseAppChrome {
  const controller = inject(AppChromeInjectionKey, null);

  const setTitle = (title: string | null): void => {
    controller?.setTitle(title);
  };
  const setBackAction = (action: AppChromeBackAction | null): void => {
    controller?.setBackAction(action);
  };
  const setTitlebar = (visibility: AppChromeTitlebarVisibility | null): void => {
    controller?.setTitlebar?.(visibility);
  };
  const hide = (): void => {
    controller?.hide?.();
  };
  const close = (): void => {
    controller?.close?.();
  };

  if (controller) {
    if (options.title !== undefined) {
      watch(() => toValue(options.title) ?? null, setTitle, { immediate: true });
    }
    if (options.backAction !== undefined) {
      watch(() => toValue(options.backAction) ?? null, setBackAction, { immediate: true });
    }
    if (options.titlebar !== undefined) {
      watch(() => toValue(options.titlebar) ?? null, setTitlebar, { immediate: true });
    }

    onScopeDispose(() => {
      setTitle(null);
      setBackAction(null);
      setTitlebar(null);
    });
  }

  return {
    available: controller !== null,
    setTitle,
    setBackAction,
    setTitlebar,
    hide,
    close,
  };
}
