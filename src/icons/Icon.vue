<script setup lang="ts" vapor>
import { computed, type VaporComponent } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    icon: VaporComponent;
    size?: number | string;
    strokeWidth?: number | string;
  }>(),
  {
    size: "1em",
    strokeWidth: undefined,
  },
);

const style = computed(() => {
  const rawSize = props.size;
  const fontSize =
    typeof rawSize === "number" || /^\d+(?:\.\d+)?$/u.test(rawSize) ? `${rawSize}px` : rawSize;

  return {
    fontSize,
    strokeWidth: props.strokeWidth,
  };
});
</script>

<template>
  <component :is="props.icon" v-bind="$attrs" :style="style" />
</template>
