<script setup vapor lang="ts">
import { computed } from "vue";

import { snapEdgeToBounds, type SnapEdge, type StageSize } from "./useWindowManager";

const props = defineProps<{
  edge: SnapEdge;
  stage: StageSize;
}>();

const style = computed<Record<string, string>>(() => {
  const bounds = snapEdgeToBounds(props.edge, props.stage);

  return {
    left: `${bounds.x.toString()}px`,
    top: `${bounds.y.toString()}px`,
    inlineSize: `${bounds.width.toString()}px`,
    blockSize: `${bounds.height.toString()}px`,
  };
});
</script>

<template>
  <div class="snap-preview" :style="style" aria-hidden="true" />
</template>

<style scoped lang="scss">
.snap-preview {
  background: var(--window-snap-preview-bg);
  border: 1px solid var(--window-snap-preview-border);
  border-radius: var(--window-snap-preview-radius);
  pointer-events: none;
  position: absolute;
  z-index: 1;
}
</style>
