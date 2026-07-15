<script lang="ts">
export { default as ContextMenuItem } from "./MenuItem.vue";
export { default as ContextMenuSeparator } from "./MenuSeparator.vue";
</script>

<script setup vapor lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId } from "vue";
import type { VirtualElement } from "@floating-ui/dom";

import { focusMenuEdge, provideMenuContext, restoreMenuTrigger, useMenuSurface } from "./menuCore";
import { resolvePortalTarget } from "./portalTarget";
import { useFloatingPosition } from "./useFloatingPosition";
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
const isOpen = ref(false);
const triggerHost = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const noArrow = shallowRef<HTMLElement | null>(null);
const virtualReference = shallowRef<VirtualElement | null>(null);
const resolvedPortalTo = computed(() => resolvePortalTarget(props.portalTo));
const trigger = useSlotTrigger(triggerHost, {
  contextmenu: onContextmenu,
  pointercancel: clearLongPress,
  pointerdown: onPointerdown,
  pointermove: onPointermove,
  pointerup: clearLongPress,
});

let longPressTimer: number | undefined;
let longPressPointer: { id: number; x: number; y: number } | undefined;

provideMenuContext({ contentId });

function clearLongPress(): void {
  if (longPressTimer !== undefined) window.clearTimeout(longPressTimer);
  longPressTimer = undefined;
  longPressPointer = undefined;
}

function onPointerdown(event: Event): void {
  const pointerEvent = event as PointerEvent;
  if (
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
  longPressTimer = window.setTimeout(() => {
    const pointer = longPressPointer;
    clearLongPress();
    if (!pointer || !trigger.value) return;
    trigger.value.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        cancelable: true,
        clientX: pointer.x,
        clientY: pointer.y,
      }),
    );
  }, 600);
}

function onPointermove(event: Event): void {
  const pointerEvent = event as PointerEvent;
  const pointer = longPressPointer;
  if (!pointer || pointer.id !== pointerEvent.pointerId) return;
  if (Math.hypot(pointerEvent.clientX - pointer.x, pointerEvent.clientY - pointer.y) > 10) {
    clearLongPress();
  }
}

function closeMenu(restoreFocus: boolean): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  emit("update:open", false);
  if (restoreFocus) void restoreMenuTrigger(trigger.value);
}

async function onContextmenu(event: Event): Promise<void> {
  const mouseEvent = event as MouseEvent;
  if (trigger.value?.getAttribute("aria-disabled") === "true") return;
  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();
  virtualReference.value = {
    contextElement: trigger.value ?? undefined,
    getBoundingClientRect: () => new DOMRect(mouseEvent.clientX, mouseEvent.clientY, 0, 0),
  };

  if (!isOpen.value) {
    isOpen.value = true;
    emit("update:open", true);
  }
  await nextTick();
  if (isOpen.value) focusMenuEdge(content.value, "first");
}

const surface = useMenuSurface({
  close: closeMenu,
  content,
  modal: () => props.modal,
  open: () => isOpen.value,
  trigger,
});

const { floatingStyle } = useFloatingPosition({
  align: () => "start",
  arrow: noArrow,
  floating: content,
  open: () => isOpen.value,
  reference: () => virtualReference.value,
  side: () => "bottom",
  sideOffset: () => 2,
});

onBeforeUnmount(() => {
  clearLongPress();
  content.value?.remove();
});
</script>

<template>
  <span class="ds-menu-root">
    <span ref="triggerHost" class="ds-menu-trigger"><slot name="trigger" /></span>
    <Teleport v-if="isOpen" :to="resolvedPortalTo">
      <div
        :id="contentId"
        ref="content"
        class="ds-context-menu"
        :style="floatingStyle"
        role="menu"
        tabindex="-1"
        @ds-menu-select="surface.onSelect"
        @focusin="surface.onFocusin"
        @keydown="surface.onKeydown"
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
