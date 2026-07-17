<script setup vapor lang="ts">
interface PanelProps {
  as?: keyof HTMLElementTagNameMap;
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "default" | "subtle" | "elevated" | "plain";
}

withDefaults(defineProps<PanelProps>(), {
  as: "section",
  padding: "md",
  variant: "default",
});
</script>

<template>
  <component
    :is="as"
    class="ds-kit-panel"
    :class="[`ds-kit-panel--${variant}`, `ds-kit-panel--padding-${padding}`]"
  >
    <slot />
  </component>
</template>

<style scoped lang="scss">
.ds-kit-panel {
  border-radius: var(--radius-md);
  color: var(--color-fg);
  min-inline-size: 0;
}

.ds-kit-panel--default {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
}

.ds-kit-panel--subtle {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
}

.ds-kit-panel--elevated {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.ds-kit-panel--plain {
  background: transparent;
}

.ds-kit-panel--padding-none {
  padding: 0;
}

.ds-kit-panel--padding-sm {
  padding: var(--space-sm);
}

.ds-kit-panel--padding-md {
  padding: var(--space-md);
}

.ds-kit-panel--padding-lg {
  padding: var(--space-lg);
}
</style>
