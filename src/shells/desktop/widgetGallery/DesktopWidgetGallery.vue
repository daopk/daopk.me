<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from "vue";

import { Button } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { useWidgetEnabled } from "~/composables/useWidgetEnabled";
import {
  autoPlace,
  resolveNearestFreeWidgetPlacement,
  useWidgetPlacementStore,
  type WidgetGridRect,
  type WidgetPlacement,
} from "~/core/widgets/WidgetPlacementStore";
import {
  createWidgetCatalogItems,
  matchesWidgetCatalogQuery,
  setWidgetVisible,
  widgetDefaultVisible,
  widgetMatchesSurface,
  type WidgetCatalogItem,
  type WidgetCatalogProviderKind,
} from "~/core/widgets/catalog";
import {
  gridToPixels,
  snapToGrid,
  WIDGET_GRID_PITCH_PX,
  WIDGET_SIZE_GRID_UNITS,
  widgetPixelDimensions,
} from "~/core/widgets/sizing";
import { Check, Plus, Search, X } from "~/icons/lucide";
import { SettingsWidgetsIcon as WidgetsIcon } from "~/icons/fluentColor";
import type { AppManifest } from "~/types/app";
import type { WidgetManifest, WidgetSurface } from "~/types/widget";

type ConcreteSurface = Exclude<WidgetSurface, "any">;
type SourceFilter = "all" | Extract<WidgetCatalogProviderKind, "system" | "app">;

const SURFACE_TABS: ReadonlyArray<{ id: ConcreteSurface; label: string }> = [
  { id: "desktop:wallpaper", label: "Desktop" },
  { id: "desktop:menubar", label: "Menubar" },
];

const SOURCE_FILTERS: ReadonlyArray<{ id: SourceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "system", label: "System" },
  { id: "app", label: "Apps" },
];

const kernel = useKernel();
const placements = useWidgetPlacementStore();
const { enabled: enabledMap, isEnabled, setEnabled } = useWidgetEnabled("desktop");

const open = ref(false);
const query = ref("");
const activeSurface = ref<ConcreteSurface>("desktop:wallpaper");
const sourceFilter = ref<SourceFilter>("all");
const widgets = shallowRef<readonly WidgetManifest[]>(kernel.widgets.list());
const apps = shallowRef<readonly AppManifest[]>(kernel.apps.list());
const panelRef = ref<HTMLElement | null>(null);
const panelPosition = ref<{ x: number; y: number } | null>(null);
const panelDragging = ref(false);
const dragging = ref<{
  item: WidgetCatalogItem;
  x: number;
  y: number;
  width: number;
  height: number;
} | null>(null);

let stopDocumentDrag: (() => void) | undefined;
let stopPanelDrag: (() => void) | undefined;

function refreshCatalog(): void {
  widgets.value = kernel.widgets.list();
  apps.value = kernel.apps.list();
}

const stopOpen = kernel.events.on("widget.gallery.open.requested", () => {
  refreshCatalog();
  open.value = true;
  void nextTick(clampPanelToViewport);
});
const stopWidgetRegistered = kernel.events.on("widget.registered", refreshCatalog);
const stopWidgetUnregistered = kernel.events.on("widget.unregistered", refreshCatalog);
const stopAppRegistered = kernel.events.on("app.registered", refreshCatalog);
const stopAppUnregistered = kernel.events.on("app.unregistered", refreshCatalog);

onMounted(() => {
  if (!placements.isHydrated()) {
    placements.hydrate();
  }
  window.addEventListener("resize", clampPanelToViewport);
});

onUnmounted(() => {
  stopOpen();
  stopWidgetRegistered();
  stopWidgetUnregistered();
  stopAppRegistered();
  stopAppUnregistered();
  stopDocumentDrag?.();
  stopPanelDrag?.();
  window.removeEventListener("resize", clampPanelToViewport);
});

const catalogItems = computed(() => {
  void enabledMap.value;
  return createWidgetCatalogItems({
    widgets: widgets.value,
    apps: apps.value,
    isVisible: (manifest, defaultVisible) => isEnabled(manifest.id, defaultVisible),
  });
});

const filteredItems = computed(() =>
  catalogItems.value.filter((item) => {
    if (!widgetMatchesSurface(item.manifest, activeSurface.value)) return false;
    if (sourceFilter.value !== "all" && item.provider.kind !== sourceFilter.value) return false;
    return matchesWidgetCatalogQuery(item, query.value);
  }),
);

const hasItems = computed(() => filteredItems.value.length > 0);

function close(): void {
  open.value = false;
}

function show(item: WidgetCatalogItem): void {
  setWidgetVisible(setEnabled, item.manifest, true);
}

function hide(item: WidgetCatalogItem): void {
  setWidgetVisible(setEnabled, item.manifest, false);
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function desktopStageRect(): DOMRect | null {
  return document.querySelector<HTMLElement>(".desktop-stage")?.getBoundingClientRect() ?? null;
}

function panelDragBounds(
  width: number,
  height: number,
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const margin = 8;
  const desktopTop = desktopStageRect()?.top ?? 0;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const minX = margin;
  const minY = Math.max(margin, desktopTop + margin);

  return {
    minX,
    maxX: Math.max(minX, viewportWidth - width - margin),
    minY,
    maxY: Math.max(minY, viewportHeight - height - margin),
  };
}

function clampPanelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const bounds = panelDragBounds(width, height);

  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    y: clamp(y, bounds.minY, bounds.maxY),
  };
}

function clampPanelToViewport(): void {
  if (!open.value || panelPosition.value === null) return;

  const panel = panelRef.value;
  if (panel === null) return;

  const rect = panel.getBoundingClientRect();
  panelPosition.value = clampPanelPosition(
    panelPosition.value.x,
    panelPosition.value.y,
    rect.width,
    rect.height,
  );
}

function startPanelDrag(event: PointerEvent): void {
  if (event.button !== 0) return;

  const panel = panelRef.value;
  if (panel === null) return;

  const rect = panel.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const width = rect.width;
  const height = rect.height;
  const origin = clampPanelPosition(
    panelPosition.value?.x ?? rect.left,
    panelPosition.value?.y ?? rect.top,
    width,
    height,
  );

  stopPanelDrag?.();
  panelPosition.value = origin;
  panelDragging.value = true;

  const move = (next: PointerEvent): void => {
    const x = origin.x + next.clientX - startX;
    const y = origin.y + next.clientY - startY;
    panelPosition.value = clampPanelPosition(x, y, width, height);
    next.preventDefault();
  };

  const end = (): void => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    stopPanelDrag = undefined;
    panelDragging.value = false;
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  stopPanelDrag = end;
  event.preventDefault();
}

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

function desktopOccupiedRects(
  excludeId: string,
  viewportCols: number,
  viewportRows: number,
): WidgetGridRect[] {
  const occupied: WidgetGridRect[] = [];

  for (const manifest of widgets.value) {
    if (manifest.id === excludeId) continue;
    if (!widgetMatchesSurface(manifest, "desktop:wallpaper")) continue;
    if (!isEnabled(manifest.id, widgetDefaultVisible(manifest))) continue;

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

    occupied.push(placementRect(manifest, resolved));
  }

  return occupied;
}

function dropTargetAtPointer(
  item: WidgetCatalogItem,
  clientX: number,
  clientY: number,
): { placement: WidgetPlacement; stageRect: DOMRect } | null {
  const rect = desktopStageRect();
  if (rect === null) return null;
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }

  const size = widgetPixelDimensions(item.manifest.size);
  const rawX = clientX - rect.left - size.width / 2;
  const rawY = clientY - rect.top - size.height / 2;
  const snappedX = snapToGrid(clamp(rawX, 0, rect.width - size.width));
  const snappedY = snapToGrid(clamp(rawY, 0, rect.height - size.height));
  const requested = {
    gridX: Math.round(snappedX / WIDGET_GRID_PITCH_PX),
    gridY: Math.round(snappedY / WIDGET_GRID_PITCH_PX),
  };
  const viewportCols = Math.floor(rect.width / WIDGET_GRID_PITCH_PX);
  const viewportRows = Math.floor(rect.height / WIDGET_GRID_PITCH_PX);
  const placement = resolveNearestFreeWidgetPlacement(
    item.manifest.size,
    requested,
    desktopOccupiedRects(item.id, viewportCols, viewportRows),
    viewportCols,
    viewportRows,
  );

  return placement === undefined ? null : { placement, stageRect: rect };
}

function dragPreviewPosition(
  item: WidgetCatalogItem,
  clientX: number,
  clientY: number,
  size: { width: number; height: number },
): { x: number; y: number } {
  const target = dropTargetAtPointer(item, clientX, clientY);
  if (target !== null) {
    return {
      x: target.stageRect.left + gridToPixels(target.placement.gridX),
      y: target.stageRect.top + gridToPixels(target.placement.gridY),
    };
  }

  return {
    x: clientX - size.width / 2,
    y: clientY - size.height / 2,
  };
}

function placeAtPointer(item: WidgetCatalogItem, clientX: number, clientY: number): void {
  const target = dropTargetAtPointer(item, clientX, clientY);
  if (target === null) return;
  placements.set(item.id, target.placement);
  show(item);
}

function startDesktopDrag(item: WidgetCatalogItem, event: PointerEvent): void {
  if (event.button !== 0 || item.visible || !item.desktopPlaceable) return;

  const size = widgetPixelDimensions(item.manifest.size);
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;

  stopDocumentDrag?.();

  const move = (next: PointerEvent): void => {
    const dx = next.clientX - startX;
    const dy = next.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 6) {
      return;
    }
    moved = true;
    const position = dragPreviewPosition(item, next.clientX, next.clientY, size);
    dragging.value = {
      item,
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    };
    next.preventDefault();
  };

  const end = (next: PointerEvent): void => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    stopDocumentDrag = undefined;
    if (moved) {
      placeAtPointer(item, next.clientX, next.clientY);
    }
    dragging.value = null;
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  stopDocumentDrag = (): void => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    dragging.value = null;
  };
}

const dragStyle = computed(() => {
  const state = dragging.value;
  if (state === null) return {};
  return {
    inlineSize: `${state.width}px`,
    blockSize: `${state.height}px`,
    transform: `translate3d(${state.x}px, ${state.y}px, 0)`,
  };
});

const panelStyle = computed(() => {
  const position = panelPosition.value;
  if (position === null) return {};

  return {
    insetBlockStart: `${position.y.toString()}px`,
    insetInlineEnd: "auto",
    insetInlineStart: `${position.x.toString()}px`,
  };
});
</script>

<template>
  <aside
    v-if="open"
    ref="panelRef"
    class="desktop-widget-gallery"
    :class="{ 'desktop-widget-gallery--dragging': panelDragging }"
    :style="panelStyle"
    aria-label="Widget gallery"
  >
    <header class="desktop-widget-gallery__header" @pointerdown="startPanelDrag">
      <span class="desktop-widget-gallery__header-icon" aria-hidden="true">
        <WidgetsIcon />
      </span>
      <div class="desktop-widget-gallery__heading">
        <h2>Widgets</h2>
        <p>Drag desktop widgets onto the wallpaper, or add them to desktop surfaces.</p>
      </div>
      <button
        type="button"
        class="desktop-widget-gallery__close"
        aria-label="Close"
        @click="close"
        @pointerdown.stop
      >
        <X aria-hidden="true" />
      </button>
    </header>

    <label class="desktop-widget-gallery__search">
      <Search class="desktop-widget-gallery__search-icon" aria-hidden="true" />
      <input v-model="query" type="search" placeholder="Search widgets" />
    </label>

    <div class="desktop-widget-gallery__segments" aria-label="Widget source">
      <button
        v-for="filter in SOURCE_FILTERS"
        :key="filter.id"
        type="button"
        :aria-pressed="sourceFilter === filter.id"
        @click="sourceFilter = filter.id"
      >
        {{ filter.label }}
      </button>
    </div>

    <div class="desktop-widget-gallery__tabs" role="tablist" aria-label="Widget surface">
      <button
        v-for="tab in SURFACE_TABS"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeSurface === tab.id"
        @click="activeSurface = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <section class="desktop-widget-gallery__list" aria-live="polite">
      <p v-if="!hasItems" class="desktop-widget-gallery__empty">No widgets match this view.</p>
      <article
        v-for="item in filteredItems"
        v-else
        :key="`${activeSurface}::${item.id}`"
        class="desktop-widget-gallery__item"
        :data-visible="item.visible || undefined"
        :data-widget-id="item.id"
      >
        <button
          type="button"
          class="desktop-widget-gallery__preview"
          :disabled="item.visible || !item.desktopPlaceable"
          :aria-label="item.desktopPlaceable ? `Drag ${item.title} to desktop` : item.title"
          @pointerdown="startDesktopDrag(item, $event)"
        >
          <component :is="item.icon ?? WidgetsIcon" class="desktop-widget-gallery__preview-icon" />
          <span class="desktop-widget-gallery__preview-size">{{ item.sizeLabel }}</span>
        </button>

        <div class="desktop-widget-gallery__item-body">
          <div class="desktop-widget-gallery__item-title-line">
            <h3>{{ item.title }}</h3>
            <span v-if="item.visible" class="desktop-widget-gallery__added">
              <Check aria-hidden="true" />
              Added
            </span>
          </div>
          <p class="desktop-widget-gallery__item-description">{{ item.description }}</p>
          <p class="desktop-widget-gallery__item-meta">
            {{ item.provider.label }} · {{ item.surfaceLabel }}
          </p>
        </div>

        <div class="desktop-widget-gallery__actions">
          <Button v-if="item.visible" variant="ghost" size="sm" @click="hide(item)">Remove</Button>
          <Button v-else variant="primary" size="sm" :icon-start="Plus" @click="show(item)">
            Add
          </Button>
        </div>
      </article>
    </section>
  </aside>

  <Teleport to="body">
    <div
      v-if="dragging"
      class="desktop-widget-gallery__drag-ghost"
      :style="dragStyle"
      aria-hidden="true"
    >
      {{ dragging.item.title }}
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.desktop-widget-gallery {
  background: color-mix(in srgb, var(--color-bg-elevated) 94%, transparent);
  backdrop-filter: blur(var(--blur-md, 12px));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  inline-size: min(380px, calc(100vw - 32px));
  inset-block-start: calc(var(--menubar-height) + 16px);
  inset-inline-end: 16px;
  max-block-size: calc(100vh - var(--menubar-height) - 32px);
  padding: var(--space-md);
  position: fixed;
  z-index: var(--dialog-content-z);
}

.desktop-widget-gallery__header {
  align-items: flex-start;
  cursor: grab;
  display: flex;
  gap: var(--space-sm);
  touch-action: none;
  user-select: none;
}

.desktop-widget-gallery--dragging,
.desktop-widget-gallery--dragging .desktop-widget-gallery__header {
  cursor: grabbing;
}

.desktop-widget-gallery__header-icon {
  align-items: center;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  padding: var(--space-xs);

  svg {
    block-size: 24px;
    inline-size: 24px;
  }
}

.desktop-widget-gallery__heading {
  flex: 1 1 auto;
  min-inline-size: 0;

  h2 {
    font-size: 18px;
    font-weight: 650;
    line-height: 1.1;
    margin: 0;
  }

  p {
    color: var(--color-fg-muted);
    font-size: 12px;
    line-height: 1.4;
    margin: 4px 0 0;
  }
}

.desktop-widget-gallery__close {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  padding: 4px;

  &:hover,
  &:focus-visible {
    background: var(--color-bg-subtle);
    color: var(--color-fg);
    outline: none;
  }

  svg {
    block-size: 16px;
    inline-size: 16px;
  }
}

.desktop-widget-gallery__search {
  align-items: center;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-xs);
  padding: 0 var(--space-sm);

  &:focus-within {
    border-color: var(--color-accent);
  }

  input {
    background: transparent;
    border: 0;
    color: var(--color-fg);
    flex: 1 1 auto;
    font-size: 13px;
    min-inline-size: 0;
    outline: none;
    padding: var(--space-sm) 0;
  }
}

.desktop-widget-gallery__search-icon {
  block-size: 14px;
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  inline-size: 14px;
}

.desktop-widget-gallery__segments,
.desktop-widget-gallery__tabs {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: grid;
  gap: 2px;
  padding: 2px;
}

.desktop-widget-gallery__segments {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.desktop-widget-gallery__tabs {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.desktop-widget-gallery__segments button,
.desktop-widget-gallery__tabs button {
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  font-size: 12px;
  min-block-size: 28px;

  &[aria-pressed="true"],
  &[aria-selected="true"] {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-weight: 600;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
}

.desktop-widget-gallery__list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-sm);
  min-block-size: 0;
  overflow-y: auto;
  padding-inline-end: 2px;
}

.desktop-widget-gallery__empty {
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg-muted);
  font-size: 13px;
  margin: 0;
  padding: var(--space-md);
  text-align: center;
}

.desktop-widget-gallery__item {
  align-items: center;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: 72px minmax(0, 1fr) auto;
  padding: var(--space-sm);

  &[data-visible] {
    border-color: color-mix(in srgb, var(--color-accent) 42%, var(--color-border));
  }
}

.desktop-widget-gallery__preview {
  align-items: center;
  aspect-ratio: 1;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent),
    var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: grab;
  display: flex;
  inline-size: 72px;
  justify-content: center;
  position: relative;

  &:disabled {
    cursor: default;
    opacity: 0.82;
  }
}

.desktop-widget-gallery__preview-icon {
  block-size: 28px;
  inline-size: 28px;
}

.desktop-widget-gallery__preview-size {
  background: color-mix(in srgb, var(--color-bg-elevated) 88%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  font-size: 10px;
  inset-block-end: 4px;
  inset-inline-end: 4px;
  line-height: 1;
  padding: 2px 4px;
  position: absolute;
}

.desktop-widget-gallery__item-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-inline-size: 0;
}

.desktop-widget-gallery__item-title-line {
  align-items: center;
  display: flex;
  gap: var(--space-xs);

  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-widget-gallery__added {
  align-items: center;
  color: var(--color-accent);
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 11px;
  gap: 3px;

  svg {
    block-size: 12px;
    inline-size: 12px;
  }
}

.desktop-widget-gallery__item-description,
.desktop-widget-gallery__item-meta {
  color: var(--color-fg-muted);
  font-size: 12px;
  line-height: 1.35;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-widget-gallery__item-meta {
  font-size: 11px;
}

.desktop-widget-gallery__actions {
  align-items: center;
  display: flex;
  justify-content: flex-end;
}

.desktop-widget-gallery__drag-ghost {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg-elevated) 78%, transparent);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  display: flex;
  font-size: 13px;
  font-weight: 600;
  inset: 0 auto auto 0;
  justify-content: center;
  pointer-events: none;
  position: fixed;
  z-index: var(--dialog-content-z);
}

@media (max-width: 768px) {
  .desktop-widget-gallery {
    display: none;
  }
}
</style>
