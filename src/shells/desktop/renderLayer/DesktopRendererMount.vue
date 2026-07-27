<script setup vapor lang="ts">
import { defineVaporAsyncComponent, markRaw, onUnmounted, type VaporComponent } from "vue";

import { useKernel } from "~/composables/useKernel";
import {
  denyAllKeyboardAdapter,
  provideHostedAppEnvironment,
} from "~/shells/shared/hostedAppEnvironment";
import type { DesktopRendererManifest } from "~/types/desktop";
import { verifiedVaporLoader } from "~/utils/vaporComponent";

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

provideHostedAppEnvironment({
  manifestId,
  handleId: handle.id,
  args: {
    contributionId: props.renderer.id,
    surface: props.renderer.surface,
  },
  isActive: () => false,
  keyboard: denyAllKeyboardAdapter,
});

onUnmounted(() => {
  kernel.processes.kill(handle.id, "shell");
});

const asyncComponentCache = new WeakMap<DesktopRendererManifest, VaporComponent>();

function resolveComponent(renderer: DesktopRendererManifest): VaporComponent {
  const cached = asyncComponentCache.get(renderer);
  if (cached) return cached;
  const wrapped = markRaw(
    defineVaporAsyncComponent(
      verifiedVaporLoader(renderer.component, `Desktop renderer ${renderer.id}`),
    ),
  );
  asyncComponentCache.set(renderer, wrapped);
  return wrapped;
}
</script>

<template>
  <component :is="resolveComponent(renderer)" :stage-size="stageSize" />
</template>
