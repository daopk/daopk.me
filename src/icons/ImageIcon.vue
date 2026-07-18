<script setup lang="ts" vapor>
const props = defineProps<{ src: string }>();
</script>

<template>
  <img :src="props.src" alt="" :draggable="false" decoding="async" />
</template>

<style scoped>
img {
  block-size: 1em;
  inline-size: 1em;
}
</style>
