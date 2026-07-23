<script lang="ts">
export { default as DropdownMenuCheckboxItem } from "./MenuCheckboxItem.vue";
export { default as DropdownMenuItem } from "./MenuItem.vue";
export { default as DropdownMenuItemIndicator } from "./MenuItemIndicator.vue";
export { default as DropdownMenuLabel } from "./MenuLabel.vue";
export { default as DropdownMenuRadioGroup } from "./MenuRadioGroup.vue";
export { default as DropdownMenuRadioItem } from "./MenuRadioItem.vue";
export { default as DropdownMenuSeparator } from "./MenuSeparator.vue";
export { default as DropdownMenuSub } from "./MenuSub.vue";
export { default as DropdownMenuSubContent } from "./MenuSubContent.vue";
export { default as DropdownMenuSubTrigger } from "./MenuSubTrigger.vue";
</script>

<script setup vapor lang="ts">
import { computed, useTemplateRef } from "vue";
import {
  DropdownMenuContent as RopavDropdownMenuContent,
  DropdownMenuPortal as RopavDropdownMenuPortal,
  DropdownMenuRoot as RopavDropdownMenuRoot,
  DropdownMenuTrigger as RopavDropdownMenuTrigger,
  type DropdownMenuCloseOptions,
  type DropdownMenuPlacement,
} from "ropav/dropdown-menu";

import MenuPrimitiveSlot from "./MenuPrimitiveSlot.vue";
import { useMenuLifecycle } from "./useMenuLifecycle";

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
const DROPDOWN_MENU_BASE_Z_INDEX = 1200;
const placement = computed<DropdownMenuPlacement>(() =>
  props.align === "center" ? "bottom" : `bottom-${props.align}`,
);
const rootRef = useTemplateRef<{
  close: (options?: DropdownMenuCloseOptions & { returnFocus?: boolean }) => void;
}>("rootRef");
const menu = useMenuLifecycle({
  isModal: () => props.modal,
  onOpenChange: (next) => emit("update:open", next),
});

function closeWithoutFocusRestore(event: Event): void {
  event.preventDefault();
  menu.suppressFocusRestore();
  rootRef.value?.close({ returnFocus: false });
}
</script>

<template>
  <RopavDropdownMenuRoot
    ref="rootRef"
    :base-z-index="DROPDOWN_MENU_BASE_Z_INDEX"
    :modal="modal"
    @update:open="menu.onOpenChange"
  >
    <RopavDropdownMenuTrigger :as="MenuPrimitiveSlot" :element-callback="menu.setTrigger">
      <slot name="trigger" />
    </RopavDropdownMenuTrigger>
    <RopavDropdownMenuPortal :to="portalTo">
      <div :ref="menu.portalRoot" class="ds-menu-portal">
        <RopavDropdownMenuContent
          :class="['ds-dropdown-menu', contentClass]"
          :offset="sideOffset"
          :placement="placement"
          strategy="fixed"
          @focus-outside="menu.onOutsideInteraction"
          @keydown="menu.onContentKeydown"
          @pointer-down-outside="menu.onOutsideInteraction"
        >
          <slot name="items" :close-without-focus-restore="closeWithoutFocusRestore" />
        </RopavDropdownMenuContent>
      </div>
    </RopavDropdownMenuPortal>
  </RopavDropdownMenuRoot>
</template>

<style lang="scss">
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
  max-block-size: calc(100dvh - var(--menubar-height) - var(--space-sm));
  min-inline-size: 188px;
  outline: none;
  overflow-y: auto;
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

  [role="menuitem"],
  [role="menuitemcheckbox"],
  [role="menuitemradio"] {
    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: start;
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
