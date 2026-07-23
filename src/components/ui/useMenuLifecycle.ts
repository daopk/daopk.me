import { nextTick, onBeforeUnmount, ref, type Ref } from "vue";

import { useMenuTypeahead } from "./useMenuTypeahead";

interface MenuLifecycleAdapter {
  isModal: () => boolean;
  onOpenChange: (next: boolean) => void;
}

interface MenuLifecycle {
  portalRoot: Ref<HTMLElement | null>;
  onContentKeydown: (event: KeyboardEvent) => void;
  onOpenChange: (next: boolean) => void;
  onOutsideInteraction: () => void;
  setTrigger: (element: HTMLElement | null) => void;
  suppressFocusRestore: () => void;
}

export function useMenuLifecycle(adapter: MenuLifecycleAdapter): MenuLifecycle {
  const portalRoot = ref<HTMLElement | null>(null);
  const trigger = ref<HTMLElement | null>(null);
  const typeahead = useMenuTypeahead();
  let cycle = 0;
  let isOpen = false;
  let isUnmounted = false;
  let restoreFocusOnClose = true;

  function setTrigger(element: HTMLElement | null): void {
    trigger.value = element;
  }

  function suppressFocusRestore(): void {
    restoreFocusOnClose = false;
  }

  function onContentKeydown(event: KeyboardEvent): void {
    if (event.key === "Tab") suppressFocusRestore();
    typeahead.onKeydown(event);
  }

  function onOutsideInteraction(): void {
    restoreFocusOnClose = adapter.isModal();
  }

  async function focusMenuContent(openCycle: number): Promise<void> {
    // Chromium can mount portalled content after the primitive's initial focus
    // attempt. Wait for the portal to paint before routing keys to the menu.
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    if (isUnmounted || !isOpen || cycle !== openCycle) return;

    portalRoot.value?.querySelector<HTMLElement>('[role="menu"]')?.focus({
      preventScroll: true,
    });
  }

  async function restoreTriggerFocus(closeCycle: number): Promise<void> {
    // Ropav clears its focus guards over two Vue flushes.
    await nextTick();
    await nextTick();

    if (isUnmounted || isOpen || cycle !== closeCycle) return;

    trigger.value?.focus({ preventScroll: true });
  }

  function onOpenChange(next: boolean): void {
    isOpen = next;
    const currentCycle = ++cycle;
    adapter.onOpenChange(next);

    if (next) {
      restoreFocusOnClose = true;
      void focusMenuContent(currentCycle);
    } else if (restoreFocusOnClose) {
      void restoreTriggerFocus(currentCycle);
    }
  }

  onBeforeUnmount(() => {
    isUnmounted = true;
    cycle += 1;
    const root = portalRoot.value;
    queueMicrotask(() => root?.remove());
  });

  return {
    portalRoot,
    onContentKeydown,
    onOpenChange,
    onOutsideInteraction,
    setTrigger,
    suppressFocusRestore,
  };
}
