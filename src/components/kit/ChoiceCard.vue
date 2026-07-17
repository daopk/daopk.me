<script setup vapor lang="ts">
import type { Component } from "vue";

import { Check } from "~/icons/lucide";

interface ChoiceCardProps {
  selected?: boolean;
  title: string;
  description?: string;
  icon?: Component;
  disabled?: boolean;
}

withDefaults(defineProps<ChoiceCardProps>(), {
  selected: false,
  description: undefined,
  icon: undefined,
  disabled: false,
});

const emit = defineEmits<{
  select: [];
}>();
</script>

<template>
  <button
    type="button"
    class="ds-kit-choice-card"
    :class="{ 'ds-kit-choice-card--selected': selected, 'ds-kit-choice-card--disabled': disabled }"
    role="radio"
    :aria-checked="selected"
    :disabled="disabled"
    @click="emit('select')"
  >
    <span v-if="$slots.preview || icon" class="ds-kit-choice-card__preview">
      <slot name="preview">
        <component :is="icon" v-if="icon" :size="20" aria-hidden="true" />
      </slot>
    </span>
    <span class="ds-kit-choice-card__body">
      <span class="ds-kit-choice-card__title">{{ title }}</span>
      <span v-if="description" class="ds-kit-choice-card__description">{{ description }}</span>
    </span>
    <span class="ds-kit-choice-card__check" aria-hidden="true">
      <Check v-if="selected" :size="14" :stroke-width="3" />
    </span>
  </button>
</template>

<style scoped lang="scss">
.ds-kit-choice-card {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: var(--space-sm);
  min-block-size: max(44px, var(--control-height-md));
  padding: var(--space-sm) var(--space-md);
  text-align: start;
  transition:
    border-color var(--duration-fast) var(--ease),
    background-color var(--duration-fast) var(--ease);

  &:hover {
    border-color: color-mix(in srgb, var(--color-accent) 50%, var(--color-border));
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.ds-kit-choice-card--selected {
  border-color: var(--color-accent);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.ds-kit-choice-card--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ds-kit-choice-card__preview {
  align-items: center;
  color: var(--color-accent);
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
}

.ds-kit-choice-card__body {
  display: grid;
  flex: 1 1 auto;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.ds-kit-choice-card__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.ds-kit-choice-card__description {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  line-height: var(--leading-snug);
}

.ds-kit-choice-card__check {
  align-items: center;
  block-size: 18px;
  color: var(--color-accent);
  display: inline-flex;
  flex: 0 0 auto;
  inline-size: 18px;
  justify-content: center;
}

@media (prefers-reduced-motion: reduce) {
  .ds-kit-choice-card {
    transition: none;
  }
}
</style>
