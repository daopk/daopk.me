<script setup vapor lang="ts">
import Spinner from "./Spinner.vue";
</script>

<template>
  <div class="ds-kit-preview-host__state">
    <Spinner size="md" label="Loading preview" />
  </div>
</template>

<style scoped>
.ds-kit-preview-host__state {
  block-size: 100%;
  min-block-size: 160px;
}
</style>
