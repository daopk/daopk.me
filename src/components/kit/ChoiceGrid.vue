<script setup vapor lang="ts">
interface ChoiceGridProps {
  label: string;
  /** Minimum column width before the grid reflows to fewer columns. */
  minColumnWidth?: string;
}

withDefaults(defineProps<ChoiceGridProps>(), {
  minColumnWidth: "180px",
});
</script>

<template>
  <div
    class="ds-kit-choice-grid"
    role="radiogroup"
    :aria-label="label"
    :style="{ '--ds-choice-grid-min': minColumnWidth }"
  >
    <slot />
  </div>
</template>

<style scoped lang="scss">
.ds-kit-choice-grid {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fill, minmax(min(var(--ds-choice-grid-min), 100%), 1fr));
}
</style>
