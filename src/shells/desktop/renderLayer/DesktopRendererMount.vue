<script setup lang="ts">
import { defineAsyncComponent, markRaw, onUnmounted, provide, type Component } from "vue";

import { useKernel } from "~/composables/useKernel";
import { AppContextInjectionKey, type AppContext } from "~/types/app";
import type { DesktopRendererManifest } from "~/types/desktop";

const props = defineProps<{
  renderer: DesktopRendererManifest;
  stageSize: { width: number; height: number };
}>();

const kernel = useKernel();

const manifestId = props.renderer.manifestId ?? props.renderer.id.split(":")[0]!;

const handle = kernel.processes.spawn(manifestId, {
  contributionId: props.renderer.id,
  surface: props.renderer.surface,
});

const context: AppContext = Object.freeze({
  manifestId,
  handleId: handle.id,
  args: Object.freeze({
    contributionId: props.renderer.id,
    surface: props.renderer.surface,
  }),
});

provide(AppContextInjectionKey, context);

onUnmounted(() => {
  kernel.processes.kill(handle.id, "shell");
});

const asyncComponentCache = new WeakMap<DesktopRendererManifest, Component>();

function resolveComponent(renderer: DesktopRendererManifest): Component {
  const cached = asyncComponentCache.get(renderer);
  if (cached) return cached;
  const wrapped = markRaw(defineAsyncComponent(renderer.component));
  asyncComponentCache.set(renderer, wrapped);
  return wrapped;
}
</script>

<template>
  <component :is="resolveComponent(renderer)" :stage-size="stageSize" />
</template>
