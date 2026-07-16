<script lang="ts">
export { default as DropdownMenuItem } from "./MenuItem.vue";
export { default as DropdownMenuItemIndicator } from "./MenuItemIndicator.vue";
export { default as DropdownMenuLabel } from "./MenuLabel.vue";
export { default as DropdownMenuRadioGroup } from "./MenuRadioGroup.vue";
export { default as DropdownMenuRadioItem } from "./MenuRadioItem.vue";
export { default as DropdownMenuSeparator } from "./MenuSeparator.vue";
</script>

<script setup vapor lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import {
  useDropdownMenu,
  type DropdownMenuItem as RopavDropdownMenuItem,
  type DropdownMenuPlacement,
  type DropdownMenuProps as RopavDropdownMenuProps,
} from "ropav/dropdown-menu";

import { focusMenuEdge, provideMenuContext, useMenuSurface, useMenuTriggerAria } from "./menuCore";
import { resolvePortalTarget } from "./portalTarget";
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
const triggerHost = ref<HTMLElement | null>(null);
const resolvedPortalTo = computed(() => resolvePortalTarget(props.portalTo));
const placement = computed<DropdownMenuPlacement>(() =>
  props.align === "center" ? "bottom" : `bottom-${props.align}`,
);
const trigger = useSlotTrigger(triggerHost, {
  click: recordFirstItemFocus,
  keydown: recordKeyboardFocus,
});
const emptyItems: RopavDropdownMenuItem[] = [];
let pendingFocus: "first" | "last" = "first";

const ropavProps: Readonly<RopavDropdownMenuProps> = {
  get id() {
    return contentId;
  },
  items: emptyItems,
  get modal() {
    return props.modal;
  },
  get offset() {
    return props.sideOffset;
  },
  get placement() {
    return placement.value;
  },
  get portalTo() {
    return resolvedPortalTo.value;
  },
  strategy: "fixed",
  get target() {
    return trigger.value;
  },
};

const {
  actualPlacement,
  close,
  contentStyle,
  isVisible,
  menuRef: content,
  rootRef,
} = useDropdownMenu(ropavProps, { openChange: onOpenChange });
const resolvedContentStyle = computed(() => ({
  ...contentStyle.value,
  zIndex: "var(--dropdown-menu-z)",
}));
const setRootRef = (value: unknown) => (rootRef.value = toHTMLElement(value));
const setContentRef = (value: unknown) => (content.value = toHTMLElement(value));

provideMenuContext({ contentId });
useMenuTriggerAria(trigger, () => isVisible.value, contentId);

const surface = useMenuSurface({
  close: closeMenu,
  content,
  open: () => isVisible.value,
});

function recordFirstItemFocus(): void {
  pendingFocus = "first";
}

function toHTMLElement(value: unknown): HTMLElement | null {
  return value instanceof HTMLElement ? value : null;
}

function recordKeyboardFocus(event: Event): void {
  const keyboardEvent = event as KeyboardEvent;
  if (keyboardEvent.key === "ArrowUp") pendingFocus = "last";
  else if (
    keyboardEvent.key === "ArrowDown" ||
    keyboardEvent.key === "Enter" ||
    keyboardEvent.key === " "
  ) {
    pendingFocus = "first";
  }
}

function onOpenChange(next: boolean): void {
  emit("update:open", next);
  if (next) void focusItems(pendingFocus);
}

async function focusItems(edge: "first" | "last"): Promise<void> {
  await nextTick();
  await nextTick();
  if (isVisible.value) focusMenuEdge(content.value, edge);
}

function onContentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeMenu(true);
    return;
  }
  surface.onKeydown(event);
}

function closeMenu(restoreFocus: boolean): void {
  close({ focusTrigger: restoreFocus });
}
</script>

<template>
  <span :ref="setRootRef" class="ds-menu-root">
    <span ref="triggerHost" class="ds-menu-trigger"><slot name="trigger" /></span>
    <Teleport :to="resolvedPortalTo">
      <div class="ds-menu-portal">
        <div
          v-if="isVisible"
          :id="contentId"
          :ref="setContentRef"
          role="menu"
          tabindex="-1"
          :data-side="actualPlacement.split('-')[0]"
          :style="resolvedContentStyle"
          :class="['ds-dropdown-menu', contentClass]"
          @ds-menu-select="surface.onSelect"
          @focusin="surface.onFocusin"
          @keydown="onContentKeydown"
          @pointermove="surface.onPointermove"
        >
          <slot name="items" />
        </div>
      </div>
    </Teleport>
  </span>
</template>

<style lang="scss">
.ds-menu-root,
.ds-menu-trigger,
.ds-menu-portal {
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
