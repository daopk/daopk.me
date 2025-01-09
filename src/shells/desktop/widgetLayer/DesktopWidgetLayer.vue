<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, shallowRef, useTemplateRef } from "vue";
import { useResizeObserver } from "@vueuse/core";

import { useKernel } from "~/composables/useKernel";
import { useWidgetEnabled } from "~/composables/useWidgetEnabled";
import { debugWarn } from "~/core/debug";
import { widgetDefaultVisible } from "~/core/widgets/catalog";
import {
  autoPlace,
  resolveNearestFreeWidgetPlacement,
  useWidgetPlacementStore,
  type WidgetGridRect,
  type WidgetPlacement,
} from "~/core/widgets/WidgetPlacementStore";
import { WIDGET_GRID_PITCH_PX, WIDGET_SIZE_GRID_UNITS } from "~/core/widgets/sizing";
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

function gridInsetUnits(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function resolveDefaultPlacement(
  manifest: WidgetManifest,
  dims: { w: number; h: number },
  viewportCols: number,
): WidgetPlacement | undefined {
  const placement = manifest.defaultPlacement;
  if (placement === undefined) return undefined;

  if ("anchor" in placement) {
    if (placement.anchor === "top-right") {
      return {
        gridX: viewportCols - dims.w - gridInsetUnits(placement.insetX),
        gridY: gridInsetUnits(placement.insetY),
      };
    }
  }

  if ("gridX" in placement) {
    return { gridX: placement.gridX, gridY: placement.gridY };
  }

  return undefined;
}

function clampPlacement(
  placement: WidgetPlacement,
  dims: { w: number; h: number },
  viewportCols: number,
  viewportRows: number,
): WidgetPlacement {
  return {
    gridX: Math.max(0, Math.min(placement.gridX, viewportCols - dims.w)),
    gridY: Math.max(0, Math.min(placement.gridY, viewportRows - dims.h)),
  };
}

function placementRect(manifest: WidgetManifest, placement: WidgetPlacement): WidgetGridRect {
  const dims = WIDGET_SIZE_GRID_UNITS[manifest.size];
  return { x: placement.gridX, y: placement.gridY, w: dims.w, h: dims.h };
}

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
  const out: Record<string, WidgetPlacement> = {};

  if (hostSize.width === 0 || hostSize.height === 0) {
    return out;
  }

  const viewportCols = Math.floor(hostSize.width / WIDGET_GRID_PITCH_PX);
  const viewportRows = Math.floor(hostSize.height / WIDGET_GRID_PITCH_PX);
  const occupied: WidgetGridRect[] = [];

  for (const manifest of enabledWidgets.value) {
    const dims = WIDGET_SIZE_GRID_UNITS[manifest.size];

    const requested =
      placements.get(manifest.id) ??
      resolveDefaultPlacement(manifest, dims, viewportCols) ??
      autoPlace(manifest.size, occupied, viewportCols, viewportRows);

    const resolved =
      resolveNearestFreeWidgetPlacement(
        manifest.size,
        requested,
        occupied,
        viewportCols,
        viewportRows,
      ) ?? clampPlacement(requested, dims, viewportCols, viewportRows);

    out[manifest.id] = resolved;
    occupied.push(placementRect(manifest, resolved));
  }

  return out;
});

function onSlotDrop(id: string, gridX: number, gridY: number): void {
  const manifest = enabledWidgets.value.find((candidate) => candidate.id === id);
  if (manifest === undefined || hostSize.width === 0 || hostSize.height === 0) {
    return;
  }

  const viewportCols = Math.floor(hostSize.width / WIDGET_GRID_PITCH_PX);
  const viewportRows = Math.floor(hostSize.height / WIDGET_GRID_PITCH_PX);
  const occupied = enabledWidgets.value
    .filter((candidate) => candidate.id !== id)
    .map((candidate) => {
      const placement = effectivePlacements.value[candidate.id];
      return placement === undefined ? undefined : placementRect(candidate, placement);
    })
    .filter((rect): rect is WidgetGridRect => rect !== undefined);

  const resolved = resolveNearestFreeWidgetPlacement(
    manifest.size,
    { gridX, gridY },
    occupied,
    viewportCols,
    viewportRows,
  );
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
