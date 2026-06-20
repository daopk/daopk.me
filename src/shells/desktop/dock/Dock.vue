<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, watchEffect } from "vue";

import DockItem from "./DockItem.vue";
import { useDock } from "./useDock";
import { clearDockReveal, setDockReveal, type DockRevealRect } from "./dockReveal";

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { useReducedMotion } from "~/composables/useReducedMotion";
import type { AppDockItem, DockDropPlacement, DockItemModel } from "./types";

const {
  items,
  launch,
  keepInDock,
  removeFromDock,
  canDragPinnedApp,
  canReorderPinnedApp,
  canMovePinnedApp,
  movePinnedApp,
  reorderPinnedApp,
  hasRunning,
  hasAttention,
} = useDock();

const kernel = useKernel();
const dockAutoHide = kernel.settings.use("dockAutoHide");
const { reduced } = useReducedMotion();
const contextOpenKey = ref<string | null>(null);
const dockRef = ref<HTMLElement | null>(null);
const draggedManifestId = ref<string | null>(null);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);
const dragOverKey = ref<string | null>(null);
const dragOverPlacement = ref<DockDropPlacement | null>(null);
const dragRemoving = ref(false);
const dragRemoveTooltipVisible = ref(false);
const suppressLaunchKey = ref<string | null>(null);
const pointerInsideRevealZone = ref(false);
const focusInsideDock = ref(false);
const dockRevealed = ref(false);
const REMOVE_TOOLTIP_DELAY_MS = 1000;

interface PointerDragSession {
  active: boolean;
  pointerId: number;
  sourceKey: string;
  sourceManifestId: string;
  startX: number;
  startY: number;
}

interface DockPointTarget {
  button: HTMLElement;
  item: DockItemModel;
}

let pointerDragSession: PointerDragSession | null = null;
let dragRemoveTooltipTimer: number | null = null;

const dockIsRevealed = computed(
  () =>
    !dockAutoHide.value ||
    dockRevealed.value ||
    focusInsideDock.value ||
    contextOpenKey.value !== null,
);

function measureDockRect(): DockRevealRect | null {
  const el = dockRef.value;
  if (el === null) {
    return null;
  }

  const rect = el.getBoundingClientRect();
  return { top: rect.top, height: rect.height };
}

// Publish dock occupancy to the window host so maximize can stop above a
// visible dock without the host reaching into the dock's DOM.
watchEffect(() => {
  setDockReveal({ occupiesStage: dockIsRevealed.value, measure: measureDockRect });
});

function revealDock(): void {
  if (dockAutoHide.value) {
    dockRevealed.value = true;
  }
}

function concealDockIfIdle(): void {
  if (
    !dockAutoHide.value ||
    pointerInsideRevealZone.value ||
    focusInsideDock.value ||
    contextOpenKey.value !== null
  ) {
    return;
  }

  dockRevealed.value = false;
}

function setContextOpen(key: string, open: boolean): void {
  contextOpenKey.value = open ? key : contextOpenKey.value === key ? null : contextOpenKey.value;
  if (open) {
    revealDock();
  } else {
    void nextTick(concealDockIfIdle);
  }
}

function onRevealPointerEnter(): void {
  pointerInsideRevealZone.value = true;
  revealDock();
}

function onRevealPointerLeave(): void {
  pointerInsideRevealZone.value = false;
  concealDockIfIdle();
}

function onDockFocusIn(): void {
  focusInsideDock.value = true;
  revealDock();
}

function onDockFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget;
  const currentTarget = event.currentTarget;
  if (
    nextTarget instanceof Node &&
    currentTarget instanceof HTMLElement &&
    currentTarget.contains(nextTarget)
  ) {
    return;
  }

  focusInsideDock.value = false;
  concealDockIfIdle();
}

function dispatch(id: string, payload?: Readonly<Record<string, unknown>>): void {
  void kernel.commands.dispatch(id, {
    source: "menu",
    ...(payload === undefined ? {} : { payload }),
  });
}

function openLabel(item: DockItemModel): string {
  if (item.kind === "system") {
    return `Open ${item.name}`;
  }

  return hasRunning(item) ? `Activate ${item.name}` : `Open ${item.name}`;
}

function openItem(item: DockItemModel): void {
  if (item.kind === "system") {
    if (item.action === "spotlight") {
      dispatch("spotlight:open");
    } else {
      kernel.events.emit("app.launch.requested", { manifestId: "trash", source: "menu" });
    }
    return;
  }

  dispatch("app:open", { manifestId: item.manifestId });
}

function onLaunch(item: DockItemModel): void {
  if (suppressLaunchKey.value === item.key) {
    suppressLaunchKey.value = null;
    return;
  }

  launch(item);
}

function isDraggablePinnedApp(item: DockItemModel): item is AppDockItem {
  return item.kind === "app" && canDragPinnedApp(item);
}

function isReorderableApp(item: DockItemModel): item is AppDockItem {
  return item.kind === "app" && canReorderPinnedApp(item);
}

function pointerIsOutsideDock(clientX: number, clientY: number): boolean {
  const dock = dockRef.value;

  if (!dock) {
    return false;
  }

  const rect = dock.getBoundingClientRect();
  const tolerance = 8;

  return (
    clientX < rect.left - tolerance ||
    clientX > rect.right + tolerance ||
    clientY < rect.top - tolerance ||
    clientY > rect.bottom + tolerance
  );
}

function dropPlacementFromElement(clientX: number, target: HTMLElement): DockDropPlacement {
  const rect = target.getBoundingClientRect();
  const midpoint = rect.left + rect.width / 2;

  return clientX < midpoint ? "before" : "after";
}

function dockTargetFromPoint(clientX: number, clientY: number): DockPointTarget | null {
  const sourceKey = pointerDragSession?.sourceKey;
  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>(".dock-item[data-dock-item-key]"),
  );
  let nearest: { distance: number; target: DockPointTarget } | null = null;

  for (const button of buttons) {
    const key = button.dataset.dockItemKey;

    if (key === undefined || key === sourceKey) {
      continue;
    }

    const item = items.value.find((candidate) => candidate.key === key);
    if (!item) {
      continue;
    }

    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const inVerticalBand = clientY >= rect.top - 8 && clientY <= rect.bottom + 8;

    if (!inVerticalBand) {
      continue;
    }

    if (clientX >= rect.left && clientX <= rect.right) {
      return { button, item };
    }

    const distance = Math.abs(clientX - centerX);
    if (distance <= rect.width && (nearest === null || distance < nearest.distance)) {
      nearest = { distance, target: { button, item } };
    }
  }

  return nearest?.target ?? null;
}

function updateDropTargetFromPointer(event: PointerEvent): DockPointTarget | null {
  const target = dockTargetFromPoint(event.clientX, event.clientY);

  if (!target || !isReorderableApp(target.item)) {
    clearDropTarget();
    return target;
  }

  dragOverKey.value = target.item.key;
  dragOverPlacement.value = dropPlacementFromElement(event.clientX, target.button);
  return target;
}

function clearDropTarget(): void {
  dragOverKey.value = null;
  dragOverPlacement.value = null;
}

function clearDragRemoveTooltipTimer(): void {
  if (dragRemoveTooltipTimer !== null) {
    window.clearTimeout(dragRemoveTooltipTimer);
    dragRemoveTooltipTimer = null;
  }
}

function setDragRemoving(removing: boolean): void {
  if (dragRemoving.value === removing) {
    return;
  }

  dragRemoving.value = removing;
  dragRemoveTooltipVisible.value = false;
  clearDragRemoveTooltipTimer();

  if (removing) {
    dragRemoveTooltipTimer = window.setTimeout(() => {
      if (dragRemoving.value) {
        dragRemoveTooltipVisible.value = true;
      }

      dragRemoveTooltipTimer = null;
    }, REMOVE_TOOLTIP_DELAY_MS);
  }
}

function startPointerListeners(): void {
  window.addEventListener("pointermove", onWindowPointerMove, { passive: false });
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerCancel);
}

function stopPointerListeners(): void {
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", onWindowPointerCancel);
}

function cleanupPointerDrag(): void {
  stopPointerListeners();
  pointerDragSession = null;
  draggedManifestId.value = null;
  dragOffsetX.value = 0;
  dragOffsetY.value = 0;
  setDragRemoving(false);
  clearDropTarget();
}

function markLaunchSuppressed(key: string): void {
  suppressLaunchKey.value = key;
  window.setTimeout(() => {
    if (suppressLaunchKey.value === key) {
      suppressLaunchKey.value = null;
    }
  }, 0);
}

function onReorderPointerDown(event: PointerEvent, item: DockItemModel): void {
  if (event.button !== 0 || !isDraggablePinnedApp(item)) {
    return;
  }

  pointerDragSession = {
    active: false,
    pointerId: event.pointerId,
    sourceKey: item.key,
    sourceManifestId: item.manifestId,
    startX: event.clientX,
    startY: event.clientY,
  };
  clearDropTarget();

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  startPointerListeners();
}

function activatePointerDragIfNeeded(event: PointerEvent, session: PointerDragSession): boolean {
  dragOffsetX.value = event.clientX - session.startX;
  dragOffsetY.value = event.clientY - session.startY;

  if (session.active) {
    return true;
  }

  const distance = Math.hypot(dragOffsetX.value, dragOffsetY.value);

  if (distance < 6) {
    return false;
  }

  session.active = true;
  draggedManifestId.value = session.sourceManifestId;
  return true;
}

function onWindowPointerMove(event: PointerEvent): void {
  const session = pointerDragSession;

  if (!session || event.pointerId !== session.pointerId) {
    return;
  }

  if (!activatePointerDragIfNeeded(event, session)) {
    return;
  }

  event.preventDefault();
  const target = updateDropTargetFromPointer(event);
  setDragRemoving(
    !(target?.item.kind === "app" && dragOverPlacement.value !== null) &&
      pointerIsOutsideDock(event.clientX, event.clientY),
  );
}

function onWindowPointerUp(event: PointerEvent): void {
  const session = pointerDragSession;

  if (!session || event.pointerId !== session.pointerId) {
    return;
  }

  if (session.active) {
    event.preventDefault();
    const target = updateDropTargetFromPointer(event);

    if (target?.item.kind === "app" && dragOverPlacement.value !== null) {
      reorderPinnedApp(session.sourceManifestId, target.item.manifestId, dragOverPlacement.value);
    } else if (pointerIsOutsideDock(event.clientX, event.clientY)) {
      const source = items.value.find((item) => item.key === session.sourceKey);
      if (source?.kind === "app") {
        removeFromDock(source);
      }
    }

    markLaunchSuppressed(session.sourceKey);
  }

  cleanupPointerDrag();
}

function onWindowPointerCancel(event: PointerEvent): void {
  if (pointerDragSession && event.pointerId === pointerDragSession.pointerId) {
    cleanupPointerDrag();
  }
}

function itemDragPlacement(item: DockItemModel): DockDropPlacement | null {
  return dragOverKey.value === item.key ? dragOverPlacement.value : null;
}

onBeforeUnmount(() => {
  cleanupPointerDrag();
  clearDockReveal();
});

watch(dockAutoHide, (enabled) => {
  if (!enabled) {
    dockRevealed.value = false;
    return;
  }

  if (pointerInsideRevealZone.value || focusInsideDock.value || contextOpenKey.value !== null) {
    dockRevealed.value = true;
  }
});
</script>

<template>
  <div
    class="dock-reveal-zone"
    :class="{
      'dock-reveal-zone--auto-hide': dockAutoHide,
      'dock-reveal-zone--revealed': dockAutoHide && dockIsRevealed,
      'dock-reveal-zone--reduced-motion': reduced,
    }"
    :data-auto-hide="dockAutoHide ? 'true' : undefined"
    :data-revealed="dockAutoHide && dockIsRevealed ? 'true' : undefined"
    :data-reduced-motion="reduced ? 'true' : undefined"
    @pointerenter="onRevealPointerEnter"
    @pointerdown="revealDock"
    @pointerleave="onRevealPointerLeave"
    @focusin="onDockFocusIn"
    @focusout="onDockFocusOut"
  >
    <div ref="dockRef" class="dock" role="toolbar" aria-label="Application dock">
      <ContextMenu
        v-for="item in items"
        :key="item.key"
        @update:open="(open) => setContextOpen(item.key, open)"
      >
        <template #trigger>
          <DockItem
            :item="item"
            :running="hasRunning(item)"
            :attention="hasAttention(item)"
            :context-menu-open="contextOpenKey === item.key"
            :draggable="isDraggablePinnedApp(item)"
            :dragging="item.kind === 'app' && draggedManifestId === item.manifestId"
            :drag-offset-x="dragOffsetX"
            :drag-offset-y="dragOffsetY"
            :drag-removing="
              item.kind === 'app' && draggedManifestId === item.manifestId && dragRemoving
            "
            :drag-remove-tooltip-visible="
              item.kind === 'app' &&
              draggedManifestId === item.manifestId &&
              dragRemoveTooltipVisible
            "
            :drag-over-placement="itemDragPlacement(item)"
            @launch="onLaunch"
            @reorder-pointer-down="onReorderPointerDown"
          />
        </template>
        <template #items>
          <ContextMenuItem @select="openItem(item)">{{ openLabel(item) }}</ContextMenuItem>
          <ContextMenuItem
            v-if="item.kind === 'app' && !item.singleton"
            @select="dispatch('app:spawnNew', { manifestId: item.manifestId })"
          >
            Open New Window
          </ContextMenuItem>
          <ContextMenuItem v-if="item.kind === 'app' && item.pinned" @select="removeFromDock(item)">
            Remove from Dock
          </ContextMenuItem>
          <ContextMenuItem
            v-else-if="item.kind === 'app' && hasRunning(item)"
            @select="keepInDock(item)"
          >
            Keep in Dock
          </ContextMenuItem>
          <template v-if="canReorderPinnedApp(item)">
            <ContextMenuSeparator />
            <ContextMenuItem
              :disabled="!canMovePinnedApp(item, 'left')"
              @select="movePinnedApp(item, 'left')"
            >
              Move Left
            </ContextMenuItem>
            <ContextMenuItem
              :disabled="!canMovePinnedApp(item, 'right')"
              @select="movePinnedApp(item, 'right')"
            >
              Move Right
            </ContextMenuItem>
          </template>
        </template>
      </ContextMenu>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dock-reveal-zone {
  --dock-reveal-edge-size: 10px;

  align-items: flex-end;
  block-size: var(--dock-clearance);
  box-sizing: border-box;
  display: flex;
  inset-block-end: 0;
  inset-inline: 0;
  justify-content: center;
  padding-block-end: max(var(--dock-bottom-gap), env(safe-area-inset-bottom, 0));
  pointer-events: none;
  position: absolute;
  z-index: var(--dock-z);
}

.dock-reveal-zone--auto-hide {
  block-size: calc(var(--dock-reveal-edge-size) + max(0px, env(safe-area-inset-bottom, 0)));
  pointer-events: auto;
}

.dock-reveal-zone--auto-hide.dock-reveal-zone--revealed {
  block-size: var(--dock-clearance);
}

.dock {
  backdrop-filter: blur(var(--dock-blur));
  -webkit-backdrop-filter: blur(var(--dock-blur));
  background: var(--dock-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--dock-radius);
  display: flex;
  gap: var(--dock-gap);
  padding: var(--dock-padding);
  pointer-events: auto;
  position: relative;
  transform: translateY(0);
  transition:
    opacity 140ms var(--ease),
    transform 180ms var(--ease);
}

.dock-reveal-zone--auto-hide:not(.dock-reveal-zone--revealed) .dock {
  opacity: 0;
  pointer-events: none;
  transform: translateY(
    calc(100% + var(--dock-bottom-gap) + max(0px, env(safe-area-inset-bottom, 0)))
  );
}

.dock-reveal-zone--reduced-motion .dock {
  transition: none;
}

@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .dock {
    background: var(--color-bg-elevated);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dock {
    transition: none;
  }
}
</style>
