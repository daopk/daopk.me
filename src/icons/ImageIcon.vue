<script setup lang="ts" vapor>
type IconSize = number | string;

const props = withDefaults(
  defineProps<{
    src: string;
    size?: IconSize;
    strokeWidth?: IconSize;
  }>(),
  {
    size: 24,
    strokeWidth: undefined,
  },
);
</script>

<template>
  <img
    :src="props.src"
    :width="props.size"
    :height="props.size"
    alt=""
    :draggable="false"
    decoding="async"
  />
</template>
