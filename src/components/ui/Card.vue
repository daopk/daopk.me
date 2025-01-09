<script setup lang="ts">
interface CardProps {
  variant?: "default" | "subtle";
  interactive?: boolean;
  selected?: boolean;
  as?: keyof HTMLElementTagNameMap;
}

withDefaults(defineProps<CardProps>(), {
  variant: "default",
  interactive: false,
  selected: false,
  as: "div",
});
</script>

<template>
  <component
    :is="as"
    class="ds-card"
    :class="[
      `ds-card--${variant}`,
      interactive && 'ds-card--interactive',
      selected && 'ds-card--selected',
    ]"
  >
    <slot />
  </component>
</template>

<style scoped lang="scss">
.ds-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  position: relative;
  text-align: start;
}

.ds-card--default {
  background-color: var(--color-bg-elevated);
}

.ds-card--subtle {
  background-color: var(--color-bg-subtle);
}

.ds-card--interactive {
  cursor: pointer;
  transition:
    border-color 120ms var(--ease),
    box-shadow 120ms var(--ease);

  &:hover,
  &:focus-visible {
    border-color: var(--color-accent);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.ds-card--selected {
  border-color: var(--color-accent);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

@media (prefers-reduced-motion: reduce) {
  .ds-card--interactive {
    transition: none;
  }
}
</style>
