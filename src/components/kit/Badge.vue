<script setup lang="ts">
interface BadgeProps {
  as?: keyof HTMLElementTagNameMap;
  tone?: "neutral" | "accent" | "success" | "danger";
  size?: "sm" | "md";
}

withDefaults(defineProps<BadgeProps>(), {
  as: "span",
  tone: "neutral",
  size: "sm",
});
</script>

<template>
  <component
    :is="as"
    class="ds-kit-badge"
    :class="[`ds-kit-badge--${tone}`, `ds-kit-badge--${size}`]"
  >
    <slot />
  </component>
</template>

<style scoped lang="scss">
.ds-kit-badge {
  align-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  display: inline-flex;
  font-weight: 500;
  line-height: 1.2;
  max-inline-size: 100%;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-kit-badge--sm {
  font-size: 12px;
  padding: 1px var(--space-xs);
}

.ds-kit-badge--md {
  font-size: 13px;
  padding: 2px var(--space-sm);
}

.ds-kit-badge--neutral {
  border-color: var(--color-border);
  color: var(--color-fg-muted);
}

.ds-kit-badge--accent {
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 28%, var(--color-border));
  color: var(--color-accent);
}

.ds-kit-badge--success {
  background: color-mix(in srgb, var(--color-success) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-success) 30%, var(--color-border));
  color: var(--color-success);
}

.ds-kit-badge--danger {
  background: color-mix(in srgb, var(--color-error-soft) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-error-soft) 30%, var(--color-border));
  color: var(--color-error-soft);
}
</style>
