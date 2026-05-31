<script setup lang="ts">
interface ActionRowProps {
  as?: keyof HTMLElementTagNameMap;
  title?: string;
  description?: string;
}

withDefaults(defineProps<ActionRowProps>(), {
  as: "section",
  title: undefined,
  description: undefined,
});
</script>

<template>
  <component :is="as" class="ds-kit-action-row">
    <div class="ds-kit-action-row__copy">
      <slot name="copy">
        <h3 v-if="title" class="ds-kit-action-row__title">{{ title }}</h3>
        <p v-if="description" class="ds-kit-action-row__description">{{ description }}</p>
      </slot>
    </div>
    <div v-if="$slots.default" class="ds-kit-action-row__control">
      <slot />
    </div>
  </component>
</template>

<style scoped lang="scss">
.ds-kit-action-row {
  align-items: center;
  border-block-start: 1px solid var(--color-border);
  color: var(--color-fg);
  display: flex;
  gap: var(--space-lg);
  justify-content: space-between;
  min-inline-size: 0;
  padding-block: var(--space-md);
}

.ds-kit-action-row__copy {
  display: grid;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.ds-kit-action-row__title,
.ds-kit-action-row__description {
  margin: 0;
}

.ds-kit-action-row__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}

.ds-kit-action-row__description {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
}

.ds-kit-action-row__control {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
}
</style>
