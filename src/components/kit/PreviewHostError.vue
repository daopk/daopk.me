<script setup vapor lang="ts">
import EmptyState from "./EmptyState.vue";
</script>

<template>
  <EmptyState
    class="ds-kit-preview-host__state"
    role="alert"
    title="Preview failed"
    description="The preview app could not be loaded."
  />
</template>

<style scoped>
.ds-kit-preview-host__state {
  block-size: 100%;
  min-block-size: 160px;
}
</style>
