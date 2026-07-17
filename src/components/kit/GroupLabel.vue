<script setup vapor lang="ts">
interface GroupLabelProps {
  as?: keyof HTMLElementTagNameMap;
}

withDefaults(defineProps<GroupLabelProps>(), {
  as: "p",
});
</script>

<template>
  <component :is="as" class="ds-kit-group-label">
    <slot />
  </component>
</template>

<style scoped lang="scss">
.ds-kit-group-label {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  margin: 0;
  text-transform: uppercase;
}
</style>
