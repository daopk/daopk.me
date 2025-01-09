<script setup lang="ts"></script>

<template>
  <div class="app-mount-loading" aria-busy="true" aria-live="polite">
    <span class="app-mount-loading__label">Loading…</span>
  </div>
</template>

<style scoped lang="scss">
.app-mount-loading {
  align-items: center;
  block-size: 100%;
  color: var(--color-fg-muted);
  display: flex;
  inline-size: 100%;
  justify-content: center;
  padding: var(--space-md);
}

.app-mount-loading__label {
  font-size: 13px;
}

@media (prefers-reduced-motion: no-preference) {
  .app-mount-loading__label {
    animation: app-mount-loading-pulse 1200ms ease-in-out infinite;
  }
}

@keyframes app-mount-loading-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}
</style>
