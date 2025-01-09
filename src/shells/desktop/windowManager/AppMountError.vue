<script setup lang="ts">
import { AlertCircle as ErrorIcon } from "~/icons/lucide";
</script>

<template>
  <div class="app-mount-error" role="alert">
    <ErrorIcon class="app-mount-error__icon" aria-hidden="true" />
    <p class="app-mount-error__title">Failed to load app content</p>
    <p class="app-mount-error__hint">Try closing and reopening the window.</p>
  </div>
</template>

<style scoped lang="scss">
.app-mount-error {
  align-items: center;
  block-size: 100%;
  color: var(--color-fg-muted);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  inline-size: 100%;
  justify-content: center;
  padding: var(--space-md);
  text-align: center;
}

.app-mount-error__icon {
  block-size: 24px;
  color: var(--color-fg-muted);
  inline-size: 24px;
}

.app-mount-error__title {
  color: var(--color-fg);
  font-size: var(--font-size-base);
  font-weight: 500;
  margin: 0;
}

.app-mount-error__hint {
  font-size: 12px;
  margin: 0;
}
</style>
