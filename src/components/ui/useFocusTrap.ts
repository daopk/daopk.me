import { createFocusTrap, type FocusTrap, type Options } from "focus-trap";
import { onScopeDispose, watch, type Ref } from "vue";

export type FocusTrapTarget = Readonly<Ref<HTMLElement | null>>;
export type FocusTrapEnabled = boolean | Readonly<Ref<boolean>>;
export type UseFocusTrapOptions = Options;

export interface FocusTrapControls {
  activate(): void;
  deactivate(): void;
}

/**
 * Bind focus-trap's DOM API directly to a template ref. Keeping this helper
 * component-free makes it usable from both VDOM and Vapor SFCs.
 */
export function useFocusTrap(
  target: FocusTrapTarget,
  options: UseFocusTrapOptions = {},
  enabled: FocusTrapEnabled = true,
): FocusTrapControls {
  let trap: FocusTrap | null = null;
  let trappedElement: HTMLElement | null = null;

  function deactivate(): void {
    trap?.deactivate();
    trap = null;
    trappedElement = null;
  }

  function activate(): void {
    const element = target.value;
    if (element === null) {
      return;
    }

    if (trap !== null && trappedElement !== element) {
      deactivate();
    }

    if (trap === null) {
      trap = createFocusTrap(element, {
        allowOutsideClick: true,
        fallbackFocus: () => element,
        returnFocusOnDeactivate: true,
        ...options,
      });
      trappedElement = element;
    }

    trap.activate();
  }

  const stopTargetWatch = watch(
    [target, () => (typeof enabled === "boolean" ? enabled : enabled.value)] as const,
    ([element, isEnabled]) => {
      if (element === null || !isEnabled) {
        deactivate();
        return;
      }

      activate();
    },
    { flush: "post" },
  );

  onScopeDispose(() => {
    stopTargetWatch();
    deactivate();
  });

  return { activate, deactivate };
}
