<script setup vapor lang="ts">
import type { Component } from "vue";

interface ListButtonProps {
  active?: boolean;
  disabled?: boolean;
  icon?: Component;
  meta?: string;
  title?: string;
  type?: "button" | "submit" | "reset";
}

withDefaults(defineProps<ListButtonProps>(), {
  active: false,
  disabled: false,
  icon: undefined,
  meta: undefined,
  title: undefined,
  type: "button",
});
</script>

<template>
  <button
    :type="type"
    class="ds-kit-list-button"
    :class="{ 'ds-kit-list-button--active': active }"
    :aria-current="active ? 'page' : undefined"
    :disabled="disabled || undefined"
  >
    <slot name="icon">
      <component :is="icon" v-if="icon" class="ds-kit-list-button__icon" aria-hidden="true" />
    </slot>
    <span class="ds-kit-list-button__copy">
      <span v-if="title" class="ds-kit-list-button__title">{{ title }}</span>
      <slot />
      <span v-if="meta" class="ds-kit-list-button__meta">{{ meta }}</span>
    </span>
    <span v-if="$slots.end" class="ds-kit-list-button__end">
      <slot name="end" />
    </span>
  </button>
</template>

<style scoped lang="scss">
.ds-kit-list-button {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: var(--space-sm);
  inline-size: 100%;
  min-block-size: max(38px, var(--control-height-md));
  min-inline-size: 0;
  padding: var(--space-sm);
  text-align: start;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.ds-kit-list-button:hover,
.ds-kit-list-button:focus-visible,
.ds-kit-list-button--active {
  background: var(--color-bg-elevated);
  color: var(--color-fg);
}

.ds-kit-list-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ds-kit-list-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ds-kit-list-button__icon {
  block-size: 18px;
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  inline-size: 18px;
}

.ds-kit-list-button__copy {
  display: grid;
  flex: 1 1 auto;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.ds-kit-list-button__title,
.ds-kit-list-button__meta {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-kit-list-button__title {
  font-weight: var(--font-weight-semibold);
}

.ds-kit-list-button__meta {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
}

.ds-kit-list-button__end {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
}

@media (prefers-reduced-motion: reduce) {
  .ds-kit-list-button {
    transition: none;
  }
}
</style>
