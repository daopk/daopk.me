<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, shallowRef, useTemplateRef } from "vue";
import { useResizeObserver } from "@vueuse/core";

import { useKernel } from "~/composables/useKernel";
import { useWidgetEnabled } from "~/composables/useWidgetEnabled";
import { debugWarn } from "~/core/debug";
import { widgetDefaultVisible } from "~/core/widgets/catalog";
import { useWidgetPlacementStore, type WidgetPlacement } from "~/core/widgets/WidgetPlacementStore";
import { useDesktopWidgetPlacementResolver } from "~/shells/desktop/widgetPlacement/useDesktopWidgetPlacement";
import type { CommandContext } from "~/types/command";
import type { WidgetManifest } from "~/types/widget";

import DesktopWidgetSlot from "./DesktopWidgetSlot.vue";

const kernel = useKernel();
const placements = useWidgetPlacementStore();
const { enabled: enabledMap, isEnabled, setEnabled } = useWidgetEnabled("desktop");

const hostRef = useTemplateRef<HTMLElement>("hostRef");

const hostSize = reactive({ width: 0, height: 0 });

useResizeObserver(hostRef, (entries) => {
  const entry = entries[0];
  if (!entry) return;
  hostSize.width = entry.contentRect.width;
  hostSize.height = entry.contentRect.height;
});

const widgets = shallowRef<readonly WidgetManifest[]>(
  kernel.widgets.list({ surface: "desktop:wallpaper" }),
);

const placementResolver = useDesktopWidgetPlacementResolver({
  getWidgets: () => widgets.value,
  getPlacement: (id) => placements.get(id),
  isEnabled: (id, defaultVisible) => isEnabled(id, defaultVisible),
});

function refreshWidgets(): void {
  widgets.value = kernel.widgets.list({ surface: "desktop:wallpaper" });
}

const stopRegistered = kernel.events.on("widget.registered", refreshWidgets);
const stopUnregistered = kernel.events.on("widget.unregistered", refreshWidgets);
function widgetIdFromPayload(ctx: CommandContext, commandId: string): string | null {
  const value = ctx.payload.widgetId;
  if (typeof value !== "string" || value.length === 0) {
    debugWarn("[desktop-widget-layer]", commandId, "missing string payload", "widgetId");
    return null;
  }

  return value;
}

const stopRemoveWidgetCommand = kernel.commands.register({
  id: "desktop:widget.remove",
  title: "Remove Widget from Desktop",
  scope: "shell",
  run(ctx) {
    const widgetId = widgetIdFromPayload(ctx, "desktop:widget.remove");
    if (widgetId === null) return;
    const manifest = kernel.widgets.get(widgetId);
    setEnabled(widgetId, false, manifest === undefined ? true : widgetDefaultVisible(manifest));
  },
});

const enabledWidgets = computed<readonly WidgetManifest[]>(() => {
  void enabledMap.value;
  return widgets.value.filter((m) => isEnabled(m.id, widgetDefaultVisible(m)));
});

onMounted(() => {
  if (!placements.isHydrated()) {
    placements.hydrate();
  }
});

onUnmounted(() => {
  stopRegistered();
  stopUnregistered();
  stopRemoveWidgetCommand();
  // Intentionally NOT disposing `placements` — see file docstring,
});

const effectivePlacements = computed<Record<string, WidgetPlacement>>(() => {
  void enabledMap.value;
  return placementResolver.resolveEffectivePlacements(hostSize);
});

function onSlotDrop(id: string, gridX: number, gridY: number): void {
  const manifest = enabledWidgets.value.find((candidate) => candidate.id === id);
  if (manifest === undefined || hostSize.width === 0 || hostSize.height === 0) {
    return;
  }

  const resolved = placementResolver.resolveGridPlacement(manifest, { gridX, gridY }, hostSize, {
    excludeId: id,
    occupiedPlacements: effectivePlacements.value,
  });
  if (resolved === undefined) {
    return;
  }

  placements.set(id, resolved);
}
</script>

<template>
  <div ref="hostRef" class="desktop-widget-layer" data-shell-slot="desktop:wallpaper">
    <template v-if="hostSize.width > 0 && hostSize.height > 0">
      <DesktopWidgetSlot
        v-for="manifest in enabledWidgets"
        :key="manifest.id"
        :manifest="manifest"
        :placement="effectivePlacements[manifest.id] ?? { gridX: 0, gridY: 0 }"
        :host-size="hostSize"
        @drop="onSlotDrop"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.desktop-widget-layer {
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: var(--desktop-widget-layer-z);

  @media (max-width: 768px) {
    display: none;
  }

  :deep(.desktop-widget-slot) {
    pointer-events: auto;
  }
}
</style>
