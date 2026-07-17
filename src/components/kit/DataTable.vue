<script setup vapor lang="ts">
interface DataTableProps {
  as?: keyof HTMLElementTagNameMap;
  label: string;
  variant?: "plain" | "lined";
}

withDefaults(defineProps<DataTableProps>(), {
  as: "div",
  variant: "plain",
});
</script>

<template>
  <component
    :is="as"
    class="ds-kit-data-table"
    :class="`ds-kit-data-table--${variant}`"
    role="table"
    :aria-label="label"
  >
    <slot />
  </component>
</template>

<style scoped lang="scss">
.ds-kit-data-table {
  min-block-size: 0;
  min-inline-size: 0;
}

/* `lined` is an opt-in default skin for simple tables built from
   role="row" / role="columnheader" / role="cell" descendants. `plain`
   (default) ships no row styling so apps with a bespoke grid layout keep full
   control. */
.ds-kit-data-table--lined {
  color: var(--color-fg);

  :deep([role="row"]) {
    align-items: center;
    border-block-end: 1px solid var(--color-border);
    display: flex;
    gap: var(--space-md);
    min-block-size: max(40px, var(--control-height-md));
    padding: var(--space-sm) var(--space-md);
  }

  :deep([role="columnheader"]),
  :deep([role="cell"]) {
    flex: 1 1 0;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep([role="columnheader"]) {
    color: var(--color-fg-muted);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
  }

  :deep([role="cell"]) {
    font-size: var(--font-size-sm);
  }
}
</style>
