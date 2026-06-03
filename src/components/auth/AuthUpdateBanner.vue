<script setup lang="ts">
import { Button } from "~/components/ui";
import { RefreshCw } from "~/icons/lucide";

defineProps<{
  message: string;
  buttonLabel: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  update: [];
}>();
</script>

<template>
  <div class="auth-gate__update">
    <span class="auth-gate__update-copy" role="status" aria-atomic="true">
      {{ message }}
    </span>
    <Button
      class="auth-gate__update-button"
      variant="secondary"
      size="sm"
      type="button"
      :loading="loading"
      :icon-start="RefreshCw"
      @click="emit('update')"
    >
      {{ buttonLabel }}
    </Button>
  </div>
</template>

<style scoped lang="scss">
.auth-gate__update {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: var(--radius-lg);
  display: flex;
  gap: var(--space-md);
  justify-self: end;
  padding: var(--space-sm) var(--space-md);
  position: absolute;
  right: clamp(var(--space-lg), 5vw, 56px);
  top: clamp(var(--space-lg), 5vw, 56px);
  z-index: 1;
}

.auth-gate__update-copy {
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.auth-gate__update-button {
  min-block-size: 30px;
}

@media (max-width: 760px) {
  .auth-gate__update {
    backdrop-filter: blur(18px) saturate(1.08);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 28px color-mix(in srgb, black 14%, transparent);
    gap: var(--space-sm);
    inline-size: auto;
    inset-block-start: calc(env(safe-area-inset-top, 0px) + var(--space-md));
    inset-inline-end: calc(env(safe-area-inset-right, 0px) + var(--space-lg));
    inset-inline-start: calc(env(safe-area-inset-left, 0px) + var(--space-lg));
    justify-content: space-between;
    min-block-size: 44px;
    padding: var(--space-xs) var(--space-sm) var(--space-xs) var(--space-md);
    position: absolute;
    z-index: 2;
  }

  .auth-gate__update-copy {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .auth-gate__update-button {
    flex: 0 0 auto;
    min-block-size: 34px;
  }
}
</style>
