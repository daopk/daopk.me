<script setup lang="ts">
interface DataTableProps {
  as?: keyof HTMLElementTagNameMap;
  label: string;
}

withDefaults(defineProps<DataTableProps>(), {
  as: "div",
});
</script>

<template>
  <component :is="as" class="ds-kit-data-table" role="table" :aria-label="label">
    <slot />
  </component>
</template>

<style scoped lang="scss">
.ds-kit-data-table {
  min-block-size: 0;
  min-inline-size: 0;
}
</style>
