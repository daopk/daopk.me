<script setup vapor lang="ts">
import { inject } from "vue";

import { Button } from "~/components/ui";
import { AlertCircle as ErrorIcon, RefreshCw } from "~/icons/lucide";

import { AppMountRetryKey } from "./appMountContext";

const retry = inject(AppMountRetryKey, null);
</script>

<template>
  <div class="app-mount-error" role="alert">
    <ErrorIcon class="app-mount-error__icon" aria-hidden="true" />
    <p class="app-mount-error__title">Failed to load app content</p>
    <p class="app-mount-error__hint">
      {{
        retry
          ? "The app couldn't load. Check your connection and try again."
          : "Try closing and reopening the window."
      }}
    </p>
    <Button
      v-if="retry"
      class="app-mount-error__retry"
      variant="secondary"
      size="sm"
      :icon-start="RefreshCw"
      @click="retry"
    >
      Try again
    </Button>
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
  max-inline-size: 34ch;
}

.app-mount-error__retry {
  margin-block-start: var(--space-xs);
}
</style>
