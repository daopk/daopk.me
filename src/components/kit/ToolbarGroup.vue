<script setup lang="ts">
interface ToolbarGroupProps {
  as?: keyof HTMLElementTagNameMap;
  label?: string;
  role?: string;
  separated?: boolean;
}

withDefaults(defineProps<ToolbarGroupProps>(), {
  as: "div",
  label: undefined,
  role: "group",
  separated: false,
});
</script>

<template>
  <component
    :is="as"
    class="ds-kit-toolbar-group"
    :class="{ 'ds-kit-toolbar-group--separated': separated }"
    :role="role"
    :aria-label="label"
  >
    <slot />
  </component>
</template>

<style scoped lang="scss">
.ds-kit-toolbar-group {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.ds-kit-toolbar-group--separated {
  border-inline-start: 1px solid var(--color-border);
  padding-inline-start: var(--space-sm);
}
</style>
