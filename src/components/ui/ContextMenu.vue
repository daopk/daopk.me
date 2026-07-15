<script lang="ts">
export { default as ContextMenuItem } from "./MenuItem.vue";
export { default as ContextMenuSeparator } from "./MenuSeparator.vue";
</script>

<script setup vapor lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId } from "vue";
import {
  useDropdownMenu,
  type DropdownMenuItem as RopavDropdownMenuItem,
  type DropdownMenuProps as RopavDropdownMenuProps,
  type DropdownMenuVirtualAnchor,
} from "ropav/dropdown-menu";

import { focusMenuEdge, provideMenuContext, useMenuSurface, useMenuTriggerAria } from "./menuCore";
import { resolvePortalTarget } from "./portalTarget";
import { useSlotTrigger } from "./useSlotTrigger";

interface ContextMenuProps {
  modal?: boolean;
  portalTo?: string | HTMLElement;
}

const props = withDefaults(defineProps<ContextMenuProps>(), {
  modal: true,
  portalTo: undefined,
});

const emit = defineEmits<{ "update:open": [next: boolean] }>();
const contentId = `ds-context-menu-${useId()}`;
const triggerHost = ref<HTMLElement | null>(null);
const virtualReference = shallowRef<DropdownMenuVirtualAnchor | null>(null);
const resolvedPortalTo = computed(() => resolvePortalTarget(props.portalTo));
const trigger = useSlotTrigger(triggerHost, {
  click: onClick,
  contextmenu: onContextmenu,
  pointercancel: clearLongPress,
  pointerdown: onPointerdown,
  pointermove: onPointermove,
  pointerup: finishPointer,
  keydown: onTriggerKeydown,
});
const emptyItems: RopavDropdownMenuItem[] = [];

let longPressTimer: number | undefined;
let longPressPointer: { id: number; x: number; y: number } | undefined;
let longPressOpened = false;
let longPressWindow: Window | null = null;
let suppressClickUntil = 0;

const ropavProps: Readonly<RopavDropdownMenuProps> = {
  get id() {
    return contentId;
  },
  items: emptyItems,
  get modal() {
    return props.modal;
  },
  offset: 2,
  placement: "bottom-start",
  get portalTo() {
    return resolvedPortalTo.value;
  },
  strategy: "fixed",
  get target() {
    return virtualReference.value;
  },
};

const {
  close,
  contentStyle,
  isVisible,
  menuRef: content,
  onMenuKeydown,
  open,
  rootRef,
} = useDropdownMenu(ropavProps, { openChange: onOpenChange });
const setContentRef = (value: unknown) => (content.value = toHTMLElement(value));
const setRootRef = (value: unknown) => (rootRef.value = toHTMLElement(value));

provideMenuContext({ contentId });
useMenuTriggerAria(trigger, () => isVisible.value, contentId);

const surface = useMenuSurface({
  close: (restoreFocus) => close({ focusTrigger: restoreFocus }),
  content,
  modal: () => props.modal,
  open: () => isVisible.value,
  trigger,
});

function triggerDisabled(): boolean {
  const element = trigger.value;
  return (
    element === null ||
    (element instanceof HTMLButtonElement && element.disabled) ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function toHTMLElement(value: unknown): HTMLElement | null {
  return value instanceof HTMLElement ? value : null;
}

function clearLongPress(): void {
  if (longPressTimer !== undefined) window.clearTimeout(longPressTimer);
  longPressWindow?.removeEventListener("scroll", clearLongPress, true);
  longPressTimer = undefined;
  longPressPointer = undefined;
  longPressOpened = false;
  longPressWindow = null;
}

function onPointerdown(event: Event): void {
  const pointerEvent = event as PointerEvent;
  if (
    triggerDisabled() ||
    (pointerEvent.pointerType !== "touch" && pointerEvent.pointerType !== "pen") ||
    pointerEvent.isPrimary === false
  ) {
    return;
  }

  clearLongPress();
  longPressPointer = {
    id: pointerEvent.pointerId,
    x: pointerEvent.clientX,
    y: pointerEvent.clientY,
  };
  longPressOpened = false;
  longPressWindow = trigger.value?.ownerDocument.defaultView ?? null;
  longPressWindow?.addEventListener("scroll", clearLongPress, true);
  longPressTimer = window.setTimeout(() => {
    const pointer = longPressPointer;
    if (!pointer) return;
    longPressOpened = true;
    suppressClickUntil = Date.now() + 1000;
    openAt(pointer.x, pointer.y);
    longPressTimer = undefined;
    longPressWindow?.removeEventListener("scroll", clearLongPress, true);
    longPressWindow = null;
  }, 600);
}

function onPointermove(event: Event): void {
  const pointerEvent = event as PointerEvent;
  const pointer = longPressPointer;
  if (longPressOpened || !pointer || pointer.id !== pointerEvent.pointerId) return;
  if (Math.hypot(pointerEvent.clientX - pointer.x, pointerEvent.clientY - pointer.y) > 10) {
    clearLongPress();
  }
}

function finishPointer(event: Event): void {
  const pointerEvent = event as PointerEvent;
  if (pointerEvent.pointerId !== longPressPointer?.id) return;
  if (longPressOpened) pointerEvent.preventDefault();
  clearLongPress();
}

function onClick(event: Event): void {
  if (Date.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function onContextmenu(event: Event): void {
  const mouseEvent = event as MouseEvent;
  if (triggerDisabled()) return;
  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();
  if (Date.now() >= suppressClickUntil) {
    openAt(mouseEvent.clientX, mouseEvent.clientY);
  }
}

function onTriggerKeydown(event: Event): void {
  const keyboardEvent = event as KeyboardEvent;
  if (
    triggerDisabled() ||
    (keyboardEvent.key !== "ContextMenu" &&
      !(keyboardEvent.shiftKey && keyboardEvent.key === "F10"))
  ) {
    return;
  }
  keyboardEvent.preventDefault();
  const rect = trigger.value?.getBoundingClientRect();
  openAt(rect?.left ?? 0, rect?.bottom ?? 0);
}

function onOpenChange(next: boolean): void {
  emit("update:open", next);
  if (next) void focusItems();
}

function openAt(x: number, y: number): void {
  virtualReference.value = {
    contextElement: trigger.value ?? undefined,
    getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
  };
  open();
  void focusItems();
}

async function focusItems(): Promise<void> {
  await nextTick();
  await nextTick();
  if (isVisible.value) focusMenuEdge(content.value, "first");
}

function onContentKeydown(event: KeyboardEvent): void {
  surface.onKeydown(event);
  if (event.key === "Escape" && !event.defaultPrevented) onMenuKeydown(event);
}

onBeforeUnmount(() => {
  clearLongPress();
  content.value?.remove();
});
</script>

<template>
  <span :ref="setRootRef" class="ds-menu-root">
    <span ref="triggerHost" class="ds-menu-trigger"><slot name="trigger" /></span>
    <Teleport v-if="isVisible" :to="resolvedPortalTo">
      <div
        :id="contentId"
        :ref="setContentRef"
        role="menu"
        tabindex="-1"
        :style="contentStyle"
        class="ds-context-menu"
        @ds-menu-select="surface.onSelect"
        @focusin="surface.onFocusin"
        @keydown="onContentKeydown"
        @pointermove="surface.onPointermove"
      >
        <slot name="items" />
      </div>
    </Teleport>
  </span>
</template>

<style lang="scss">
.ds-menu-root,
.ds-menu-trigger {
  display: contents;
}

.ds-context-menu {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  font-size: var(--font-size-sm);
  min-inline-size: 180px;
  outline: none;
  padding: var(--space-xs);
  z-index: var(--context-menu-z);
  animation: ds-context-menu-in var(--duration-fast) var(--ease) both;

  &:focus-visible {
    outline: none;
  }

  [role="menuitem"] {
    align-items: center;
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    gap: var(--space-sm);
    inline-size: 100%;
    line-height: var(--leading-snug);
    outline: none;
    padding: var(--space-sm) var(--space-sm);
    user-select: none;

    @media (pointer: coarse) {
      min-block-size: 44px;
    }

    &[data-highlighted],
    &:hover {
      background: var(--color-bg-subtle);
    }

    &[data-disabled] {
      color: var(--color-fg-muted);
      cursor: not-allowed;
      pointer-events: none;
    }
  }

  [role="separator"] {
    background: var(--color-border);
    block-size: 1px;
    margin-block: var(--space-xs);
  }
}

@keyframes ds-context-menu-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-context-menu {
    animation-duration: 0ms;
  }
}
</style>
