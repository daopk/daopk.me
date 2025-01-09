<script setup lang="ts">
import { computed, toRef } from "vue";

import { useWallpaper } from "~/composables/useWallpaper";
import type { ShellId } from "~/types/shell";

const props = defineProps<{
  readonly shellId: ShellId;
}>();

const { current } = useWallpaper({ shellId: toRef(props, "shellId") });

const layerStyle = computed(() => {
  const w = current.value;
  if (w.type === "image") {
    return {
      backgroundImage: `url("${w.value}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    } as Record<string, string>;
  }
  return { background: w.value } as Record<string, string>;
});
</script>

<template>
  <div class="wallpaper" aria-hidden="true">
    <div class="wallpaper__layer" :style="layerStyle" />
  </div>
</template>

<style scoped lang="scss">
.wallpaper {
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  position: absolute;
  z-index: 0;
}

.wallpaper__layer {
  filter: blur(var(--wallpaper-blur, 0px));
  inset: 0;
  position: absolute;
  transform: scale(var(--wallpaper-blur-scale, 1));
}
</style>
