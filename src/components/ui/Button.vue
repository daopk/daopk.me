<script setup lang="ts">
import type { Component } from "vue";

interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  disabled?: boolean;
  iconStart?: Component;
  iconEnd?: Component;
  type?: "button" | "submit" | "reset";
}

withDefaults(defineProps<ButtonProps>(), {
  variant: "secondary",
  size: "md",
  loading: false,
  disabled: false,
  iconStart: undefined,
  iconEnd: undefined,
  type: "button",
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    class="ds-button"
    :class="[
      `ds-button--${variant}`,
      `ds-button--${size}`,
      loading && 'ds-button--loading',
      disabled && !loading && 'ds-button--disabled',
    ]"
  >
    <span v-if="loading" class="ds-button__spinner" role="status" aria-label="Loading">
      <span class="ds-button__spinner-ring" aria-hidden="true" />
    </span>
    <component :is="iconStart" v-else-if="iconStart" class="ds-button__icon" aria-hidden="true" />
    <slot />
    <component
      :is="iconEnd"
      v-if="iconEnd && !loading"
      class="ds-button__icon"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped lang="scss">
.ds-button {
  align-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  display: inline-flex;
  gap: var(--space-xs);
  justify-content: center;
  transition:
    border-color var(--duration-fast) var(--ease),
    background-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.ds-button__icon {
  block-size: 14px;
  inline-size: 14px;
}

.ds-button__spinner {
  block-size: 14px;
  display: inline-flex;
  flex: 0 0 auto;
  inline-size: 14px;
}

.ds-button__spinner-ring {
  animation: ds-button-spinner-spin 0.7s linear infinite;
  border-color: color-mix(in srgb, currentColor 30%, transparent);
  border-block-start-color: currentColor;
  border-radius: var(--radius-full);
  border-style: solid;
  border-width: 2px;
  block-size: 100%;
  inline-size: 100%;
}

.ds-button--sm {
  font-size: var(--font-size-xs);
  min-block-size: var(--control-height-sm);
  padding: var(--space-2xs) var(--space-sm);
}

.ds-button--md {
  font-size: var(--font-size-sm);
  min-block-size: var(--control-height-md);
  padding: var(--space-xs) var(--space-md);
}

.ds-button--primary {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-fg);

  &:hover {
    background-color: var(--color-accent-hover);
  }
}

.ds-button--secondary {
  background-color: var(--color-bg-elevated);
  border-color: var(--color-border);
  color: var(--color-fg);

  &:hover,
  &:focus-visible {
    border-color: var(--color-accent);
  }
}

.ds-button--ghost {
  background-color: transparent;
  border-color: transparent;
  color: var(--color-accent);
  padding-inline: 0;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: none;
  }
}

.ds-button--danger {
  background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-error) 24%, var(--color-border));
  color: var(--color-error-soft);

  &:hover {
    background-color: color-mix(in srgb, var(--color-error) 16%, transparent);
    border-color: color-mix(in srgb, var(--color-error) 36%, var(--color-border));
  }
}

.ds-button--loading {
  cursor: progress;
  opacity: 0.86;
}

.ds-button--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .ds-button {
    transition: none;
  }

  .ds-button__spinner-ring {
    animation-duration: 1.4s;
  }
}

@keyframes ds-button-spinner-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
