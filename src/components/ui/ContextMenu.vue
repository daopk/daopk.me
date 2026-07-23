<script lang="ts">
export { default as ContextMenuItem } from "./MenuItem.vue";
export { default as ContextMenuSeparator } from "./MenuSeparator.vue";
</script>

<script setup vapor lang="ts">
import {
  DropdownMenuContent as RopavDropdownMenuContent,
  DropdownMenuContextTrigger as RopavDropdownMenuContextTrigger,
  DropdownMenuPortal as RopavDropdownMenuPortal,
  DropdownMenuRoot as RopavDropdownMenuRoot,
} from "ropav/dropdown-menu";

import MenuPrimitiveSlot from "./MenuPrimitiveSlot.vue";
import { useMenuLifecycle } from "./useMenuLifecycle";

interface ContextMenuProps {
  modal?: boolean;
  portalTo?: string | HTMLElement;
}

const props = withDefaults(defineProps<ContextMenuProps>(), {
  modal: true,
  portalTo: undefined,
});

const emit = defineEmits<{ "update:open": [next: boolean] }>();
const CONTEXT_MENU_BASE_Z_INDEX = 1700;
const menu = useMenuLifecycle({
  isModal: () => props.modal,
  onOpenChange: (next) => emit("update:open", next),
});
</script>

<template>
  <RopavDropdownMenuRoot
    :base-z-index="CONTEXT_MENU_BASE_Z_INDEX"
    :modal="modal"
    @update:open="menu.onOpenChange"
  >
    <RopavDropdownMenuContextTrigger
      :as="MenuPrimitiveSlot"
      :element-callback="menu.setTrigger"
      :long-press-delay="600"
      :long-press-tolerance="10"
      :omit-attributes="['aria-controls', 'aria-expanded']"
      @contextmenu.stop
    >
      <slot name="trigger" />
    </RopavDropdownMenuContextTrigger>
    <RopavDropdownMenuPortal :to="portalTo">
      <div :ref="menu.portalRoot" class="ds-menu-portal">
        <RopavDropdownMenuContent
          class="ds-context-menu"
          :offset="2"
          placement="bottom-start"
          strategy="fixed"
          @focus-outside="menu.onOutsideInteraction"
          @keydown="menu.onContentKeydown"
          @pointer-down-outside="menu.onOutsideInteraction"
        >
          <slot name="items" />
        </RopavDropdownMenuContent>
      </div>
    </RopavDropdownMenuPortal>
  </RopavDropdownMenuRoot>
</template>

<style lang="scss">
.ds-menu-portal {
  display: contents;
}

.ds-context-menu {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  font-size: var(--font-size-sm);
  max-block-size: calc(100dvh - var(--space-sm) - var(--space-sm));
  min-inline-size: 180px;
  outline: none;
  overflow-y: auto;
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

    &.rp-dropdown-menu__item--focused,
    &[data-highlighted],
    &:hover {
      background: var(--color-bg-subtle);
    }

    &[data-disabled] {
      color: var(--color-fg-muted);
      cursor: not-allowed;
      pointer-events: none;
    }

    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: start;
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
