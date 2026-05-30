<script setup lang="ts">
interface AppToolbarProps {
  as?: keyof HTMLElementTagNameMap;
  density?: "compact" | "comfortable";
  variant?: "subtle" | "plain";
  wrap?: boolean;
}

withDefaults(defineProps<AppToolbarProps>(), {
  as: "header",
  density: "compact",
  variant: "subtle",
  wrap: false,
});
</script>

<template>
  <component
    :is="as"
    class="ds-kit-toolbar"
    :class="[
      `ds-kit-toolbar--${density}`,
      `ds-kit-toolbar--${variant}`,
      wrap && 'ds-kit-toolbar--wrap',
    ]"
  >
    <div v-if="$slots.start" class="ds-kit-toolbar__section ds-kit-toolbar__section--start">
      <slot name="start" />
    </div>
    <div class="ds-kit-toolbar__section ds-kit-toolbar__section--main">
      <slot />
    </div>
    <div v-if="$slots.end" class="ds-kit-toolbar__section ds-kit-toolbar__section--end">
      <slot name="end" />
    </div>
  </component>
</template>

<style scoped lang="scss">
.ds-kit-toolbar {
  align-items: center;
  color: var(--color-fg);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.ds-kit-toolbar--compact {
  min-block-size: 44px;
  padding: var(--space-xs) var(--space-sm);
}

.ds-kit-toolbar--comfortable {
  min-block-size: 52px;
  padding: var(--space-sm) var(--space-md);
}

.ds-kit-toolbar--subtle {
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
}

.ds-kit-toolbar--plain {
  background: transparent;
}

.ds-kit-toolbar--wrap {
  flex-wrap: wrap;
}

.ds-kit-toolbar__section {
  align-items: center;
  display: flex;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.ds-kit-toolbar__section--main {
  flex: 1 1 auto;
}

.ds-kit-toolbar__section--start,
.ds-kit-toolbar__section--end {
  flex: 0 0 auto;
}
</style>
