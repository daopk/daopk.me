import { inject, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from "vue";

import { AppChromeInjectionKey, type AppChromeBackAction } from "~/types/app";

export interface UseAppChromeOptions {
  /** Reactive title pushed to the shell chrome; kept in sync automatically. */
  title?: MaybeRefOrGetter<string | null>;
  /** Reactive back action pushed to the shell chrome. */
  backAction?: MaybeRefOrGetter<AppChromeBackAction | null>;
}

export interface UseAppChrome {
  /** `false` on shells that do not surface app chrome (e.g. the desktop window). */
  readonly available: boolean;
  setTitle(title: string | null): void;
  setBackAction(action: AppChromeBackAction | null): void;
}

/**
 * Wrap `AppChromeInjectionKey` so apps set the shell title / back action the
 * same way regardless of shell. The mobile shell provides the controller (it
 * drives the AppView header); the desktop window does not, so calls no-op
 * there instead of forcing every app to null-check the injection.
 *
 * Pass reactive `title` / `backAction` to keep the chrome in sync, or call the
 * returned setters imperatively. Whatever this scope sets is cleared on
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

  if (controller) {
    if (options.title !== undefined) {
      watch(() => toValue(options.title) ?? null, setTitle, { immediate: true });
    }
    if (options.backAction !== undefined) {
      watch(() => toValue(options.backAction) ?? null, setBackAction, { immediate: true });
    }

    onScopeDispose(() => {
      setTitle(null);
      setBackAction(null);
    });
  }

  return {
    available: controller !== null,
    setTitle,
    setBackAction,
  };
}
