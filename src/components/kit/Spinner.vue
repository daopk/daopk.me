<script setup vapor lang="ts">
interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

withDefaults(defineProps<SpinnerProps>(), {
  size: "md",
  label: "Loading",
});
</script>

<template>
  <span class="ds-kit-spinner" :class="`ds-kit-spinner--${size}`" role="status" :aria-label="label">
    <span class="ds-kit-spinner__ring" aria-hidden="true" />
  </span>
</template>

<style scoped lang="scss">
.ds-kit-spinner {
  display: inline-flex;
  flex: 0 0 auto;
}

.ds-kit-spinner__ring {
  animation: ds-kit-spinner-spin 0.7s linear infinite;
  block-size: 100%;
  border: 2px solid color-mix(in srgb, var(--color-fg) 18%, transparent);
  border-block-start-color: var(--color-accent);
  border-radius: var(--radius-full);
  inline-size: 100%;
}

.ds-kit-spinner--sm {
  block-size: 14px;
  inline-size: 14px;
}

.ds-kit-spinner--md {
  block-size: 20px;
  inline-size: 20px;
}

.ds-kit-spinner--lg {
  block-size: 28px;
  inline-size: 28px;
}

@keyframes ds-kit-spinner-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-kit-spinner__ring {
    animation-duration: 1.4s;
  }
}
</style>
