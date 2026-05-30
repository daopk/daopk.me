<script setup lang="ts">
interface StatusBannerProps {
  tone?: "info" | "success" | "warning" | "error";
  role?: string;
}

withDefaults(defineProps<StatusBannerProps>(), {
  tone: "info",
  role: "status",
});
</script>

<template>
  <div class="ds-kit-status-banner" :class="`ds-kit-status-banner--${tone}`" :role="role">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.ds-kit-status-banner {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg-muted);
  line-height: 1.45;
  padding: var(--space-sm) var(--space-md);
}

.ds-kit-status-banner--info {
  background: var(--color-bg-subtle);
}

.ds-kit-status-banner--success {
  background: color-mix(in srgb, var(--color-success) 8%, transparent);
  border-color: color-mix(in srgb, var(--color-success) 24%, var(--color-border));
  color: var(--color-success);
}

.ds-kit-status-banner--warning {
  background: color-mix(in srgb, var(--color-accent-sheen) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-accent-sheen) 30%, var(--color-border));
  color: var(--color-fg);
}

.ds-kit-status-banner--error {
  background: color-mix(in srgb, var(--color-error-soft) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-error-soft) 30%, var(--color-border));
  color: var(--color-error-soft);
}
</style>
