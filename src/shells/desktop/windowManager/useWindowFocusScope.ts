import { computed, nextTick, onBeforeUnmount, onMounted, watch, type ShallowRef } from "vue";
import { useFocusTrap } from "ropav/focus-trap";

interface WindowFocusScopeRecord {
  readonly id: string;
  readonly focused: boolean;
  readonly minimized: boolean;
  readonly z: number;
}

export interface UseWindowFocusScopeOptions {
  readonly windowRef: Readonly<ShallowRef<HTMLElement | null>>;
  readonly overlayRef: Readonly<ShallowRef<HTMLElement | null>>;
  readonly getRecord: () => WindowFocusScopeRecord;
  readonly onFocusRequest: (id: string) => void;
}

export interface WindowFocusScope {
  activate: () => void;
}

export function useWindowFocusScope(options: UseWindowFocusScopeOptions): WindowFocusScope {
  const focusTrapContainers = computed<HTMLElement[]>(() => {
    const containers: HTMLElement[] = [];

    if (options.windowRef.value !== null) {
      containers.push(options.windowRef.value);
    }

    if (options.overlayRef.value !== null) {
      containers.push(options.overlayRef.value);
    }

    return containers;
  });

  function isWithinFocusScope(target: EventTarget | null): boolean {
    return (
      target instanceof Node &&
      focusTrapContainers.value.some((element) => element.contains(target))
    );
  }

  function restoreWindowFocusAfterNestedTrap(): void {
    const record = options.getRecord();

    if (!record.focused || record.minimized) {
      return;
    }

    // Owned overlays are parent-trap containers, so focus-trap considers a closing
    // dialog button valid during unpause. Wait for Vue's close update, then repair
    // focus only when it was left in that overlay or fell back to the document body.
    void nextTick(() => {
      const currentRecord = options.getRecord();

      if (!currentRecord.focused || currentRecord.minimized) {
        return;
      }

      const activeElement = document.activeElement;

      if (activeElement !== null && options.windowRef.value?.contains(activeElement) === true) {
        return;
      }

      const focusRemainsInClosingOverlay =
        activeElement !== null && options.overlayRef.value?.contains(activeElement) === true;

      if (
        !focusRemainsInClosingOverlay &&
        activeElement !== null &&
        activeElement !== document.body
      ) {
        return;
      }

      options.windowRef.value?.focus({ preventScroll: true });
    });
  }

  const {
    activate: activateFocusTrap,
    deactivate: deactivateFocusTrap,
    isActive: isFocusTrapActive,
    isPaused: isFocusTrapPaused,
  } = useFocusTrap(focusTrapContainers, {
    allowOutsideClick: true,
    escapeDeactivates: false,
    fallbackFocus: () => options.windowRef.value!,
    initialFocus: () =>
      isWithinFocusScope(document.activeElement) ? false : (options.windowRef.value ?? false),
    onPostUnpause: restoreWindowFocusAfterNestedTrap,
    returnFocusOnDeactivate: false,
    // Window contents can keep inactive tab panels mounted with `display: none`.
    // Visibility-aware discovery keeps the trap's boundaries aligned with the
    // browser's native Tab order instead of treating controls in hidden panels
    // as reachable destinations.
    tabbableOptions: { displayCheck: "full" },
  });

  function activate(): void {
    const record = options.getRecord();

    if (record.minimized) {
      return;
    }

    if (!record.focused) {
      options.onFocusRequest(record.id);
    }

    activateFocusTrap();
  }

  function deactivate(): void {
    deactivateFocusTrap({ returnFocus: false });
  }

  function onGlobalFocusIn(event: FocusEvent): void {
    if (isWithinFocusScope(event.target)) {
      activate();
      return;
    }

    if (isFocusTrapActive.value && !isFocusTrapPaused.value) {
      deactivate();
    }
  }

  onMounted(() => {
    // Window capture runs before focus-trap's document listener, allowing an
    // intentional focus move to shell chrome to deactivate this scope first.
    window.addEventListener("focusin", onGlobalFocusIn, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("focusin", onGlobalFocusIn, true);
  });

  watch(
    () => {
      const record = options.getRecord();
      return [record.focused, record.minimized, record.z] as const;
    },
    ([focused, minimized]) => {
      if (focused && !minimized) {
        activateFocusTrap();
        return;
      }

      deactivate();
    },
    { flush: "post", immediate: true },
  );

  return { activate };
}
