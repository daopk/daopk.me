<script setup vapor lang="ts">
import type { VaporComponent } from "vue";

interface IconButtonProps {
  label: string;
  icon?: VaporComponent;
  active?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  size?: "sm" | "md";
  title?: string;
  type?: "button" | "submit" | "reset";
  variant?: "ghost" | "subtle";
}

withDefaults(defineProps<IconButtonProps>(), {
  icon: undefined,
  active: false,
  disabled: false,
  pressed: undefined,
  size: "md",
  title: undefined,
  type: "button",
  variant: "ghost",
});
</script>

<template>
  <button
    :type="type"
    class="ds-kit-icon-button"
    :class="[
      `ds-kit-icon-button--${size}`,
      `ds-kit-icon-button--${variant}`,
      active && 'ds-kit-icon-button--active',
    ]"
    :aria-label="label"
    :aria-pressed="pressed"
    :disabled="disabled || undefined"
    :title="title ?? label"
  >
    <slot name="icon">
      <component :is="icon" v-if="icon" class="ds-kit-icon-button__icon" aria-hidden="true" />
    </slot>
    <span v-if="$slots.default" class="ds-kit-icon-button__label"><slot /></span>
  </button>
</template>

<style scoped lang="scss">
.ds-kit-icon-button {
  align-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font: inherit;
  justify-content: center;
  min-inline-size: 0;
  padding: 0;
  transition:
    background-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.ds-kit-icon-button--sm {
  block-size: var(--control-height-sm);
  inline-size: var(--control-height-sm);
}

.ds-kit-icon-button--md {
  block-size: var(--control-height-md);
  inline-size: var(--control-height-md);
}

.ds-kit-icon-button--ghost {
  background: transparent;
}

.ds-kit-icon-button--subtle {
  background: color-mix(in srgb, var(--color-fg) 6%, transparent);
}

.ds-kit-icon-button:hover,
.ds-kit-icon-button:focus-visible,
.ds-kit-icon-button--active {
  background: var(--color-bg-elevated);
  color: var(--color-fg);
}

.ds-kit-icon-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ds-kit-icon-button:disabled {
  color: var(--color-fg-muted);
  cursor: default;
  opacity: 0.45;
}

.ds-kit-icon-button:disabled:hover {
  background: transparent;
}

.ds-kit-icon-button__icon {
  block-size: 16px;
  inline-size: 16px;
}

.ds-kit-icon-button__label {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .ds-kit-icon-button {
    transition: none;
  }
}
</style>
