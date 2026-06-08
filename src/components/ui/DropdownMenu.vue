<script lang="ts">
export {
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "reka-ui";
</script>

<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";

interface DropdownMenuProps {
  align?: "start" | "center" | "end";
  contentClass?: string;
  modal?: boolean;
  sideOffset?: number;
}

withDefaults(defineProps<DropdownMenuProps>(), {
  align: "start",
  contentClass: "",
  modal: false,
  sideOffset: 4,
});

const emit = defineEmits<{
  "update:open": [next: boolean];
}>();

function onUpdateOpen(value: boolean): void {
  emit("update:open", value);
}
</script>

<template>
  <DropdownMenuRoot :modal="modal" @update:open="onUpdateOpen">
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        :class="['ds-dropdown-menu', contentClass]"
        :align="align"
        :side-offset="sideOffset"
        :collision-padding="8"
        loop
      >
        <slot name="items" />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style lang="scss">
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
