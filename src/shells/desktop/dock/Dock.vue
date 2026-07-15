<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, watchEffect } from "vue";

import DockItem from "./DockItem.vue";
import { useDock } from "./useDock";
import { useDockPointerDrag } from "./useDockPointerDrag";
import { clearDockReveal, setDockReveal, type DockRevealRect } from "./dockReveal";

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { useReducedMotion } from "~/composables/useReducedMotion";
import type { DockItemModel } from "./types";

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
const pointerInsideRevealZone = ref(false);
const focusInsideDock = ref(false);
const dockRevealed = ref(false);

const {
  draggedManifestId,
  dragOffsetX,
  dragOffsetY,
  dragRemoving,
  dragRemoveTooltipVisible,
  isDraggablePinnedApp,
  itemDragPlacement,
  onReorderPointerDown,
  consumeLaunchSuppression,
} = useDockPointerDrag({
  items,
  dockRef,
  canDragPinnedApp,
  canReorderPinnedApp,
  reorderPinnedApp,
  removeFromDock,
});

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
  if (consumeLaunchSuppression(item.key)) {
    return;
  }

  launch(item);
}

onBeforeUnmount(() => {
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
  <nav
    class="dock-reveal-zone"
    aria-label="Application dock"
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
  </nav>
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
