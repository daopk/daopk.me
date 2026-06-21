<script setup lang="ts">
import { Spinner } from "~/components/kit";
</script>

<template>
  <div class="app-mount-loading" aria-busy="true" aria-live="polite">
    <Spinner size="lg" label="Loading app" />
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
</style>
