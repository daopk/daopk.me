import { provide } from "vue";

import { AppKeyboardScopeInjectionKey, type AppKeyboardScope } from "~/composables/useAppKeyboard";
import { AppContextInjectionKey, type AppContext } from "~/types/app";

export interface HostedAppEnvironmentOptions {
  readonly manifestId: string;
  readonly handleId: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly isActive: () => boolean;
  readonly keyboard: AppKeyboardScope;
}

/**
 * Establish the host-owned facts every mounted app receives.
 *
 * Mount adapters choose identity, active state, and keyboard ownership. This
 * module owns the immutable snapshots and Vue injection contract shared by
 * every hosted surface.
 */
export function provideHostedAppEnvironment(options: HostedAppEnvironmentOptions): void {
  const context: AppContext = Object.freeze({
    manifestId: options.manifestId,
    handleId: options.handleId,
    args: Object.freeze({ ...options.args }),
    isActive: options.isActive,
  });
  const keyboardScope: AppKeyboardScope = Object.freeze({
    ownsEvent: options.keyboard.ownsEvent,
  });

  provide(AppContextInjectionKey, context);
  provide(AppKeyboardScopeInjectionKey, keyboardScope);
}

/**
 * Interactive apps own document-level events plus events targeting their
 * connected root. Events aimed at another shell surface remain shell-owned.
 */
export function createConnectedRootKeyboardAdapter(
  getRoot: () => Element | null,
): AppKeyboardScope {
  return Object.freeze({
    ownsEvent(event: KeyboardEvent): boolean {
      const root = getRoot();
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
    },
  });
}

/** Non-interactive hosted surfaces never claim keyboard events. */
export const denyAllKeyboardAdapter: AppKeyboardScope = Object.freeze({
  ownsEvent: () => false,
});
