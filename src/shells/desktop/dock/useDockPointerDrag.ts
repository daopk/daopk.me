import { onBeforeUnmount, ref, type Ref } from "vue";

import type { AppDockItem, DockDropPlacement, DockItemModel } from "./types";

/**
 * Pointer-driven dock reordering + drag-to-remove. Extracted from `Dock.vue`
 * so the component keeps only its presentation + reveal concerns. The dock
 * supplies its live items, a ref to the dock element (used for hit-testing),
 * and the mutation callbacks from `useDock`; this composable owns all of the
 * transient drag state and the window-level pointer listeners.
 */
export interface DockPointerDragOptions {
  items: Readonly<Ref<readonly DockItemModel[]>>;
  dockRef: Readonly<Ref<HTMLElement | null>>;
  canDragPinnedApp: (item: DockItemModel) => boolean;
  canReorderPinnedApp: (item: DockItemModel) => boolean;
  reorderPinnedApp: (
    sourceManifestId: string,
    targetManifestId: string,
    placement: DockDropPlacement,
  ) => void;
  removeFromDock: (item: DockItemModel) => void;
}

export interface DockPointerDrag {
  draggedManifestId: Readonly<Ref<string | null>>;
  dragOffsetX: Readonly<Ref<number>>;
  dragOffsetY: Readonly<Ref<number>>;
  dragRemoving: Readonly<Ref<boolean>>;
  dragRemoveTooltipVisible: Readonly<Ref<boolean>>;
  isDraggablePinnedApp: (item: DockItemModel) => item is AppDockItem;
  itemDragPlacement: (item: DockItemModel) => DockDropPlacement | null;
  onReorderPointerDown: (event: PointerEvent, item: DockItemModel) => void;
  /**
   * A completed drag suppresses the click-`launch` that the pointerup would
   * otherwise trigger. The dock calls this from its `@launch` handler; it
   * returns `true` (and clears the latch) when the launch must be skipped.
   */
  consumeLaunchSuppression: (key: string) => boolean;
}

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

const REMOVE_TOOLTIP_DELAY_MS = 1000;

export function useDockPointerDrag(options: DockPointerDragOptions): DockPointerDrag {
  const { items, dockRef, canDragPinnedApp, canReorderPinnedApp, reorderPinnedApp, removeFromDock } =
    options;

  const draggedManifestId = ref<string | null>(null);
  const dragOffsetX = ref(0);
  const dragOffsetY = ref(0);
  const dragOverKey = ref<string | null>(null);
  const dragOverPlacement = ref<DockDropPlacement | null>(null);
  const dragRemoving = ref(false);
  const dragRemoveTooltipVisible = ref(false);
  const suppressLaunchKey = ref<string | null>(null);

  let pointerDragSession: PointerDragSession | null = null;
  let dragRemoveTooltipTimer: number | null = null;

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

  function consumeLaunchSuppression(key: string): boolean {
    if (suppressLaunchKey.value === key) {
      suppressLaunchKey.value = null;
      return true;
    }

    return false;
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

  onBeforeUnmount(cleanupPointerDrag);

  return {
    draggedManifestId,
    dragOffsetX,
    dragOffsetY,
    dragRemoving,
    dragRemoveTooltipVisible,
    isDraggablePinnedApp,
    itemDragPlacement,
    onReorderPointerDown,
    consumeLaunchSuppression,
  };
}
