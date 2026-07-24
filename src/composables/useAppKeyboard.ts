import { inject, onBeforeUnmount, onMounted, type InjectionKey } from "vue";

import { AppContextInjectionKey } from "~/types/app";

export interface UseAppKeyboardOptions {
  readonly enabled?: () => boolean;
  readonly includeEditableTargets?: boolean;
}

export type AppKeyboardHandler = (event: KeyboardEvent) => boolean;

export interface AppKeyboardScope {
  readonly ownsEvent: (event: KeyboardEvent) => boolean;
}

/**
 * Host-only ownership seam. This is intentionally not exported by
 * `@daopk/sdk`; published apps keep the stable `useAppKeyboard` call shape.
 */
export const AppKeyboardScopeInjectionKey: InjectionKey<AppKeyboardScope> =
  Symbol("AppKeyboardScope");

/**
 * Route capture-phase keyboard events to the active app instance.
 *
 * Returning `true` from the handler consumes the event. Returning `false`
 * leaves it untouched for the focused element and the shell.
 */
export function useAppKeyboard(
  handler: AppKeyboardHandler,
  options: UseAppKeyboardOptions = {},
): void {
  const context = inject(AppContextInjectionKey, null);

  if (context === null) {
    throw new Error("useAppKeyboard(): AppContextInjectionKey missing — keyboard is app-scoped.");
  }
  const appContext = context;
  const keyboardScope = inject(AppKeyboardScopeInjectionKey, null);

  function onKeydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      !appContext.isActive() ||
      options.enabled?.() === false ||
      keyboardScope?.ownsEvent(event) === false ||
      (!options.includeEditableTargets && eventHasEditableTarget(event))
    ) {
      return;
    }

    if (!handler(event)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  onMounted(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", onKeydown, { capture: true });
    }
  });

  onBeforeUnmount(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onKeydown, { capture: true });
    }
  });
}

function eventHasEditableTarget(event: KeyboardEvent): boolean {
  return event.composedPath().some((target) => isEditableTarget(target));
}

function isEditableTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
