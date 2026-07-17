<script setup vapor lang="ts">
interface SeparatorProps {
  orientation?: "horizontal" | "vertical";
  /** Omit the separator role for purely visual dividers. */
  decorative?: boolean;
}

withDefaults(defineProps<SeparatorProps>(), {
  orientation: "horizontal",
  decorative: false,
});
</script>

<template>
  <div
    class="ds-kit-separator"
    :class="`ds-kit-separator--${orientation}`"
    :role="decorative ? undefined : 'separator'"
    :aria-orientation="decorative ? undefined : orientation"
  />
</template>

<style scoped lang="scss">
.ds-kit-separator {
  background: var(--color-border);
  border: 0;
  flex: 0 0 auto;
}

.ds-kit-separator--horizontal {
  block-size: 1px;
  inline-size: 100%;
}

.ds-kit-separator--vertical {
  align-self: stretch;
  block-size: auto;
  inline-size: 1px;
  min-block-size: var(--space-md);
}
</style>
