import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from "vue";
import { useFocusTrap } from "ropav/focus-trap";

export interface UseWidgetGalleryFocusTrapOptions {
  readonly open: Readonly<Ref<boolean>>;
  readonly panelRef: Readonly<Ref<HTMLElement | null>>;
  readonly initialFocusRef: Readonly<Ref<HTMLElement | null>>;
  readonly onClose: () => void;
}

function menuTriggerFor(element: HTMLElement): HTMLElement | null {
  const menu = element.closest<HTMLElement>('[role="menu"]');
  const labelledBy = menu?.getAttribute("aria-labelledby")?.trim();
  if (labelledBy === undefined || labelledBy.length === 0) {
    return null;
  }

  const triggerId = labelledBy.split(/\s+/u)[0];
  const trigger = triggerId === undefined ? null : document.getElementById(triggerId);
  return trigger instanceof HTMLElement ? trigger : null;
}

function currentReturnFocusTarget(): HTMLElement | null {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return null;
  }

  return menuTriggerFor(activeElement) ?? activeElement;
}

export function useWidgetGalleryFocusTrap(options: UseWidgetGalleryFocusTrapOptions): void {
  let returnFocusTarget: HTMLElement | null = null;

  const { activate, deactivate } = useFocusTrap(options.panelRef, {
    allowOutsideClick: true,
    escapeDeactivates: false,
    fallbackFocus: () => options.panelRef.value!,
    initialFocus: () => options.initialFocusRef.value ?? options.panelRef.value ?? false,
    returnFocusOnDeactivate: true,
    setReturnFocus: () => {
      if (returnFocusTarget?.isConnected === true) {
        return returnFocusTarget;
      }

      return document.querySelector<HTMLElement>(".desktop-stage") ?? false;
    },
    tabbableOptions: { displayCheck: "full" },
  });

  function onGlobalKeydown(event: KeyboardEvent): void {
    if (!options.open.value || event.defaultPrevented || event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    options.onClose();
  }

  watch(
    options.open,
    (open) => {
      if (!open) {
        deactivate({ returnFocus: true });
        return;
      }

      returnFocusTarget = currentReturnFocusTarget();
      void nextTick(() => {
        if (options.open.value) {
          activate();
        }
      });
    },
    { flush: "sync" },
  );

  onMounted(() => {
    window.addEventListener("keydown", onGlobalKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onGlobalKeydown);
  });
}
