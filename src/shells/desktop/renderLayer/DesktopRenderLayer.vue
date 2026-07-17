<script setup vapor lang="ts">
import { onUnmounted, reactive, shallowRef, useTemplateRef } from "vue";
import { useResizeObserver } from "@vueuse/core";

import { useKernel } from "~/composables/useKernel";
import type { DesktopRendererManifest } from "~/types/desktop";

import DesktopRendererMount from "./DesktopRendererMount.vue";

const kernel = useKernel();
const hostRef = useTemplateRef<HTMLElement>("hostRef");

const hostSize = reactive({ width: 0, height: 0 });
const renderers = shallowRef<readonly DesktopRendererManifest[]>(
  kernel.desktop.renderers.list({ surface: "desktop:wallpaper" }),
);

useResizeObserver(hostRef, (entries) => {
  const entry = entries[0];
  if (!entry) return;
  hostSize.width = entry.contentRect.width;
  hostSize.height = entry.contentRect.height;
});

function refreshRenderers(): void {
  renderers.value = kernel.desktop.renderers.list({ surface: "desktop:wallpaper" });
}

const stopRendererRegistered = kernel.events.on("desktop.renderer.registered", refreshRenderers);
const stopRendererUnregistered = kernel.events.on(
  "desktop.renderer.unregistered",
  refreshRenderers,
);

onUnmounted(() => {
  stopRendererRegistered();
  stopRendererUnregistered();
});
</script>

<template>
  <div ref="hostRef" class="desktop-render-layer" data-shell-slot="desktop:renderers">
    <DesktopRendererMount
      v-for="renderer in renderers"
      :key="renderer.id"
      :renderer="renderer"
      :stage-size="hostSize"
    />
  </div>
</template>

<style scoped lang="scss">
.desktop-render-layer {
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: var(--desktop-widget-layer-z);

  @media (max-width: 768px) {
    display: none;
  }

  :deep([data-desktop-renderer-interactive]) {
    pointer-events: auto;
  }
}
</style>
