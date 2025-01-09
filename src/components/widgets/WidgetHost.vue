<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  markRaw,
  onUnmounted,
  shallowRef,
  type Component,
} from "vue";

import { useKernel } from "~/composables/useKernel";
import { useWidgetEnabled } from "~/composables/useWidgetEnabled";
import { widgetDefaultVisible, widgetShellScopeForSurface } from "~/core/widgets/catalog";
import type { WidgetManifest, WidgetSurface } from "~/types/widget";

const props = defineProps<{
  surface: Exclude<WidgetSurface, "any">;
}>();

const kernel = useKernel();

const widgets = shallowRef<readonly WidgetManifest[]>(
  kernel.widgets.list({ surface: props.surface }),
);

function refresh(): void {
  widgets.value = kernel.widgets.list({ surface: props.surface });
}

const stopRegistered = kernel.events.on("widget.registered", refresh);
const stopUnregistered = kernel.events.on("widget.unregistered", refresh);

// snapshot. `enabledMap` is a reactive Pinia ref (cross-tab safe);
const { enabled: enabledMap, isEnabled } = useWidgetEnabled(
  widgetShellScopeForSurface(props.surface),
);

const enabledWidgets = computed<readonly WidgetManifest[]>(() => {
  void enabledMap.value;
  return widgets.value.filter((m) => isEnabled(m.id, widgetDefaultVisible(m)));
});

onUnmounted(() => {
  stopRegistered();
  stopUnregistered();
});

const asyncComponentCache = new WeakMap<WidgetManifest, Component>();

function resolveComponent(manifest: WidgetManifest): Component {
  const cached = asyncComponentCache.get(manifest);
  if (cached) return cached;
  const wrapped = markRaw(defineAsyncComponent(manifest.component));
  asyncComponentCache.set(manifest, wrapped);
  return wrapped;
}
</script>

<template>
  <component
    :is="resolveComponent(manifest)"
    v-for="manifest in enabledWidgets"
    :key="manifest.id"
    :data-widget-id="manifest.id"
  />
</template>
