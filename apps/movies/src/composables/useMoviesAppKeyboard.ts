import { inject, onBeforeUnmount, onMounted } from "vue";

import { AppContextInjectionKey } from "@daopk/sdk";

interface LegacyCompatibleAppContext {
  readonly isActive?: () => boolean;
}

export interface UseMoviesAppKeyboardOptions {
  readonly enabled?: () => boolean;
  readonly includeEditableTargets?: boolean;
}

export type MoviesAppKeyboardHandler = (event: KeyboardEvent) => boolean;

/**
 * Route capture-phase keyboard events owned by the connected Movies root.
 *
 * This module intentionally depends only on the long-lived
 * `AppContextInjectionKey` SDK export: Movies and the host publish
 * independently, so statically importing a newly added host helper would make
 * the app fail to load on older shells.
 *
 * Older hosts do not provide `AppContext.isActive`; those hosts keep the
 * legacy behavior where the mounted Movies app is treated as active.
 */
export function useMoviesAppKeyboard(
  getRoot: () => Element | null,
  handler: MoviesAppKeyboardHandler,
  options: UseMoviesAppKeyboardOptions = {},
): void {
  const context = inject(AppContextInjectionKey, null) as LegacyCompatibleAppContext | null;

  if (context === null) {
    throw new Error(
      "useMoviesAppKeyboard(): AppContextInjectionKey missing — keyboard is app-scoped.",
    );
  }
  const appContext = context;

  function onKeydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      !appIsActive(appContext) ||
      options.enabled?.() === false ||
      !eventBelongsToMoviesRoot(event, getRoot()) ||
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

function appIsActive(context: LegacyCompatibleAppContext): boolean {
  return typeof context.isActive !== "function" || context.isActive();
}

function eventBelongsToMoviesRoot(event: KeyboardEvent, root: Element | null): boolean {
  if (typeof document === "undefined" || root === null || !root.isConnected) {
    return false;
  }

  const target = event.target;
  return (
    !(target instanceof Node) ||
    target === document ||
    target === document.body ||
    root.contains(target)
  );
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
