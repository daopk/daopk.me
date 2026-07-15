<script lang="ts">
export { default as DropdownMenuItem } from "./MenuItem.vue";
export { default as DropdownMenuItemIndicator } from "./MenuItemIndicator.vue";
export { default as DropdownMenuLabel } from "./MenuLabel.vue";
export { default as DropdownMenuRadioGroup } from "./MenuRadioGroup.vue";
export { default as DropdownMenuRadioItem } from "./MenuRadioItem.vue";
export { default as DropdownMenuSeparator } from "./MenuSeparator.vue";
</script>

<script setup vapor lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId } from "vue";

import {
  focusMenuEdge,
  provideMenuContext,
  restoreMenuTrigger,
  useMenuSurface,
  useMenuTriggerAria,
} from "./menuCore";
import { resolvePortalTarget } from "./portalTarget";
import { useFloatingPosition } from "./useFloatingPosition";
import { useSlotTrigger } from "./useSlotTrigger";

interface DropdownMenuProps {
  align?: "start" | "center" | "end";
  contentClass?: string;
  modal?: boolean;
  portalTo?: string | HTMLElement;
  sideOffset?: number;
}

const props = withDefaults(defineProps<DropdownMenuProps>(), {
  align: "start",
  contentClass: "",
  modal: false,
  portalTo: undefined,
  sideOffset: 4,
});

const emit = defineEmits<{ "update:open": [next: boolean] }>();
const contentId = `ds-dropdown-menu-${useId()}`;
const isOpen = ref(false);
const triggerHost = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const noArrow = shallowRef<HTMLElement | null>(null);
const resolvedPortalTo = computed(() => resolvePortalTarget(props.portalTo));
const trigger = useSlotTrigger(triggerHost, {
  click: onTriggerClick,
  keydown: onTriggerKeydown,
});

provideMenuContext({ contentId });
useMenuTriggerAria(trigger, () => isOpen.value, contentId);

function triggerDisabled(): boolean {
  const element = trigger.value;
  return (
    element === null ||
    (element instanceof HTMLButtonElement && element.disabled) ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function closeMenu(restoreFocus: boolean): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  emit("update:open", false);
  if (restoreFocus) void restoreMenuTrigger(trigger.value);
}

async function openMenu(edge: "first" | "last" = "first"): Promise<void> {
  if (isOpen.value || triggerDisabled()) return;
  isOpen.value = true;
  emit("update:open", true);
  await nextTick();
  if (isOpen.value) focusMenuEdge(content.value, edge);
}

function onTriggerClick(event: Event): void {
  if (event.defaultPrevented || triggerDisabled()) return;
  if (isOpen.value) closeMenu(false);
  else void openMenu("first");
}

function onTriggerKeydown(event: Event): void {
  const keyboardEvent = event as KeyboardEvent;
  if (keyboardEvent.key !== "ArrowDown" && keyboardEvent.key !== "ArrowUp") return;
  keyboardEvent.preventDefault();
  void openMenu(keyboardEvent.key === "ArrowDown" ? "first" : "last");
}

const surface = useMenuSurface({
  close: closeMenu,
  content,
  modal: () => props.modal,
  open: () => isOpen.value,
  trigger,
});

const { floatingStyle, resolvedSide } = useFloatingPosition({
  align: () => props.align,
  arrow: noArrow,
  floating: content,
  open: () => isOpen.value,
  reference: () => trigger.value,
  side: () => "bottom",
  sideOffset: () => props.sideOffset,
});

onBeforeUnmount(() => content.value?.remove());
</script>

<template>
  <span class="ds-menu-root">
    <span ref="triggerHost" class="ds-menu-trigger"><slot name="trigger" /></span>
    <Teleport v-if="isOpen" :to="resolvedPortalTo">
      <div
        :id="contentId"
        ref="content"
        :class="['ds-dropdown-menu', contentClass]"
        :data-side="resolvedSide"
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

.ds-dropdown-menu {
  animation: ds-dropdown-menu-in var(--duration-fast) var(--ease) both;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  font-size: var(--font-size-sm);
  min-inline-size: 188px;
  outline: none;
  padding: var(--space-xs);
  z-index: var(--dropdown-menu-z);

  &:focus-visible {
    outline: none;
  }

  [role="menuitem"],
  [role="menuitemcheckbox"],
  [role="menuitemradio"] {
    align-items: center;
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    gap: var(--space-sm);
    inline-size: 100%;
    line-height: var(--leading-snug);
    min-block-size: 30px;
    outline: none;
    padding: var(--space-sm) var(--space-sm);
    position: relative;
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

  [role="menuitemradio"] {
    padding-inline-start: 28px;
  }

  [role="menuitemradio"][aria-checked="false"] [data-menu-indicator] {
    display: none;
  }

  [role="separator"] {
    background: var(--color-border);
    block-size: 1px;
    margin-block: var(--space-xs);
  }
}

.ds-dropdown-menu__label {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  padding: var(--space-xs) var(--space-sm);
  text-transform: uppercase;
}

.ds-dropdown-menu__indicator {
  align-items: center;
  color: var(--color-accent);
  display: inline-flex;
  inset-inline-start: var(--space-sm);
  position: absolute;
}

.ds-dropdown-menu__item-icon {
  block-size: 14px;
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  inline-size: 14px;
}

@keyframes ds-dropdown-menu-in {
  from {
    opacity: 0;
    transform: translateY(-2px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-dropdown-menu {
    animation-duration: 0ms;
  }
}
</style>
