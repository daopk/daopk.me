import { useFocusTrap as useRopavFocusTrap, type FocusTrapOptions } from "ropav/focus-trap";
import { watch, type Ref } from "vue";

export type FocusTrapTarget = Readonly<Ref<HTMLElement | null>>;
export type FocusTrapEnabled = boolean | Readonly<Ref<boolean>>;
export type UseFocusTrapOptions = FocusTrapOptions;

export interface FocusTrapControls {
  activate(): void;
  deactivate(): void;
}

/**
 * Preserve the stable @daopk/ui facade while delegating focus containment to
 * Ropav. The adapter keeps the existing defaults and reactive enabled input
 * usable from both VDOM and Vapor SFCs.
 */
export function useFocusTrap(
  target: FocusTrapTarget,
  options: UseFocusTrapOptions = {},
  enabled: FocusTrapEnabled = true,
): FocusTrapControls {
  const ropavTrap = useRopavFocusTrap(target, {
    allowOutsideClick: true,
    fallbackFocus: () => target.value ?? document.body,
    returnFocusOnDeactivate: true,
    ...options,
  });

  watch(
    () => (typeof enabled === "boolean" ? enabled : enabled.value),
    (isEnabled) => {
      if (isEnabled) ropavTrap.activate();
      else ropavTrap.deactivate();
    },
    { flush: "post", immediate: true },
  );

  return {
    activate: () => ropavTrap.activate(),
    deactivate: () => ropavTrap.deactivate(),
  };
}
