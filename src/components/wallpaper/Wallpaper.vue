<script setup vapor lang="ts">
import { computed, toRef, watchEffect } from "vue";

import { useWallpaper } from "~/composables/useWallpaper";
import type { Wallpaper as WallpaperModel } from "~/core/theme/wallpapers";
import type { ShellId } from "~/types/shell";

const props = defineProps<{
  readonly shellId: ShellId;
  readonly syncPageBackground?: boolean;
}>();

const { current } = useWallpaper({ shellId: toRef(props, "shellId") });

function cssUrl(value: string): string {
  return `url("${value.replace(/["\\]/g, "\\$&")}")`;
}

function pageBackgroundVars(wallpaper: WallpaperModel): Record<string, string> {
  if (wallpaper.type === "image") {
    return {
      "--mobile-shell-page-background-color": "transparent",
      "--mobile-shell-page-background-image": cssUrl(wallpaper.value),
    };
  }

  return {
    "--mobile-shell-page-background-color": wallpaper.value,
    "--mobile-shell-page-background-image": "none",
  };
}

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

watchEffect((onCleanup) => {
  if (!props.syncPageBackground || typeof document === "undefined") {
    return;
  }

  const rootStyle = document.documentElement.style;
  const vars = pageBackgroundVars(current.value);

  for (const [key, value] of Object.entries(vars)) {
    rootStyle.setProperty(key, value);
  }

  onCleanup(() => {
    for (const key of Object.keys(vars)) {
      rootStyle.removeProperty(key);
    }
  });
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
