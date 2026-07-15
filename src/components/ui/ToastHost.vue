<script setup vapor lang="ts">
import ToastItem from "./ToastItem.vue";
import { toastQueue } from "./useToast";
</script>

<template>
  <div role="region" aria-label="Notifications">
    <ol class="ds-toast-viewport" aria-label="Notification list">
      <ToastItem v-for="toast in toastQueue" :key="toast.id" :toast="toast" />
    </ol>
  </div>
</template>

<style lang="scss">
.ds-toast-viewport {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  inset-block-end: 0;
  inset-inline-end: 0;
  list-style: none;
  margin: 0;
  max-inline-size: min(420px, calc(100vw - var(--space-lg) * 2));
  padding: var(--space-lg);
  padding-block-end: calc(var(--space-lg) + max(0px, env(safe-area-inset-bottom, 0)));
  pointer-events: none;
  position: fixed;
  width: 100%;
  z-index: var(--toast-z);
}

.ds-toast-viewport__item {
  display: flex;
  pointer-events: auto;
  touch-action: pan-y;
  width: 100%;

  &[data-swipe="move"] {
    transform: translateX(var(--ds-toast-swipe-move-x, 0));
  }

  &[data-swipe="cancel"] {
    transform: translateX(0);
    transition: transform var(--duration-fast) var(--ease);
  }

  &[data-swipe="end"] {
    opacity: 0;
    transform: translateX(100%);
    transition:
      opacity var(--duration-fast) var(--ease),
      transform var(--duration-fast) var(--ease);
  }
}

.ds-toast-viewport__item > .ds-toast {
  box-shadow: var(--shadow-lg);
  width: 100%;
}
</style>
