<script setup vapor lang="ts">
import { defineVaporAsyncComponent, markRaw, onUnmounted, provide, type VaporComponent } from "vue";

import { AppKeyboardScopeInjectionKey } from "~/composables/useAppKeyboard";
import { useKernel } from "~/composables/useKernel";
import { AppContextInjectionKey, type AppContext } from "~/types/app";
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

const context: AppContext = Object.freeze({
  manifestId,
  handleId: handle.id,
  args: Object.freeze({
    contributionId: props.renderer.id,
    surface: props.renderer.surface,
  }),
  isActive: () => false,
});

provide(AppContextInjectionKey, context);
provide(AppKeyboardScopeInjectionKey, Object.freeze({ ownsEvent: () => false }));

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
