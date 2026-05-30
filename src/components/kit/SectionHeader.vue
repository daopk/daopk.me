<script setup lang="ts">
import type { Component } from "vue";

interface SectionHeaderProps {
  as?: keyof HTMLElementTagNameMap;
  title?: string;
  subtitle?: string;
  icon?: Component;
  level?: 1 | 2 | 3 | 4;
}

const props = withDefaults(defineProps<SectionHeaderProps>(), {
  as: "header",
  title: undefined,
  subtitle: undefined,
  icon: undefined,
  level: 2,
});
</script>

<template>
  <component :is="as" class="ds-kit-section-header">
    <slot name="icon">
      <component :is="icon" v-if="icon" class="ds-kit-section-header__icon" aria-hidden="true" />
    </slot>
    <div class="ds-kit-section-header__copy">
      <component :is="`h${props.level}`" v-if="title" class="ds-kit-section-header__title">
        {{ title }}
      </component>
      <p v-if="subtitle" class="ds-kit-section-header__subtitle">{{ subtitle }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="ds-kit-section-header__actions">
      <slot name="actions" />
    </div>
  </component>
</template>

<style scoped lang="scss">
.ds-kit-section-header {
  align-items: flex-start;
  color: var(--color-fg);
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.ds-kit-section-header__icon {
  block-size: 24px;
  color: var(--color-accent);
  flex: 0 0 auto;
  inline-size: 24px;
}

.ds-kit-section-header__copy {
  display: grid;
  flex: 1 1 auto;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.ds-kit-section-header__title {
  font-size: 18px;
  font-weight: 650;
  line-height: 1.2;
  margin: 0;
}

.ds-kit-section-header__subtitle {
  color: var(--color-fg-muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}

.ds-kit-section-header__actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
}
</style>
