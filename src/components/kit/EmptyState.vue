<script setup vapor lang="ts">
import type { VaporComponent } from "vue";

interface EmptyStateProps {
  icon?: VaporComponent;
  title?: string;
  description?: string;
  role?: string;
}

withDefaults(defineProps<EmptyStateProps>(), {
  icon: undefined,
  title: undefined,
  description: undefined,
  role: "status",
});
</script>

<template>
  <div class="ds-kit-empty-state" :role="role">
    <slot name="icon">
      <component :is="icon" v-if="icon" class="ds-kit-empty-state__icon" aria-hidden="true" />
    </slot>
    <p v-if="title" class="ds-kit-empty-state__title">{{ title }}</p>
    <p v-if="description" class="ds-kit-empty-state__description">{{ description }}</p>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.ds-kit-empty-state {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  justify-content: center;
  min-block-size: 0;
  padding: var(--space-lg);
  text-align: center;
}

.ds-kit-empty-state__icon {
  block-size: 28px;
  color: var(--color-fg-muted);
  inline-size: 28px;
}

.ds-kit-empty-state__title,
.ds-kit-empty-state__description {
  margin: 0;
}

.ds-kit-empty-state__title {
  color: var(--color-fg);
  font-weight: var(--font-weight-semibold);
}

.ds-kit-empty-state__description {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  max-inline-size: 34ch;
}
</style>
