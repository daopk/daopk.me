<script lang="ts">
export { ContextMenuItem, ContextMenuSeparator } from "reka-ui";
</script>

<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
} from "reka-ui";

interface ContextMenuProps {
  modal?: boolean;
}

withDefaults(defineProps<ContextMenuProps>(), {
  modal: true,
});

const emit = defineEmits<{
  "update:open": [next: boolean];
}>();

function onUpdateOpen(value: boolean): void {
  emit("update:open", value);
}
</script>

<template>
  <ContextMenuRoot :modal="modal" @update:open="onUpdateOpen">
    <ContextMenuTrigger as-child>
      <slot name="trigger" />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="ds-context-menu" :collision-padding="8">
        <slot name="items" />
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<style lang="scss">
/* NOTE: NOT scoped — reka-ui portals `ContextMenuContent` into
   `<body>`, outside this SFC's scoped-style boundary. A scoped
   selector would never match. The `.ds-context-menu` namespace +
   descendant selectors keep this rule self-contained without
   leaking. */

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
