import { computed, ref, type ComputedRef, type Ref } from "vue";

import type { WidgetPlacement } from "~/core/widgets/WidgetPlacementStore";
import type { WidgetCatalogItem } from "~/core/widgets/catalog";
import { gridToPixels, widgetPixelDimensions } from "~/core/widgets/sizing";

export interface WidgetGalleryDesktopDragTarget {
  placement: WidgetPlacement;
  stageRect: DOMRect;
}

export interface WidgetGalleryDesktopDragState {
  item: WidgetCatalogItem;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseWidgetGalleryDesktopDragOptions {
  resolveTargetAtPointer: (
    item: WidgetCatalogItem,
    clientX: number,
    clientY: number,
  ) => WidgetGalleryDesktopDragTarget | null;
  onPlace: (item: WidgetCatalogItem, placement: WidgetPlacement) => void;
}

export function useWidgetGalleryDesktopDrag(options: UseWidgetGalleryDesktopDragOptions): {
  dragging: Ref<WidgetGalleryDesktopDragState | null>;
  dragStyle: ComputedRef<Record<string, string>>;
  startDesktopDrag: (item: WidgetCatalogItem, event: PointerEvent) => void;
  stopDesktopDrag: () => void;
} {
  const dragging = ref<WidgetGalleryDesktopDragState | null>(null);

  let stopDesktopDragImpl: (() => void) | undefined;

  function dragPreviewPosition(
    item: WidgetCatalogItem,
    clientX: number,
    clientY: number,
    size: { width: number; height: number },
  ): { x: number; y: number } {
    const target = options.resolveTargetAtPointer(item, clientX, clientY);
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
    const target = options.resolveTargetAtPointer(item, clientX, clientY);
    if (target === null) return;
    options.onPlace(item, target.placement);
  }

  function stopDesktopDrag(): void {
    stopDesktopDragImpl?.();
  }

  function startDesktopDrag(item: WidgetCatalogItem, event: PointerEvent): void {
    if (event.button !== 0 || item.visible || !item.desktopPlaceable) return;

    const size = widgetPixelDimensions(item.manifest.size);
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    stopDesktopDrag();

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
      stopDesktopDragImpl = undefined;
      if (moved) {
        placeAtPointer(item, next.clientX, next.clientY);
      }
      dragging.value = null;
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    stopDesktopDragImpl = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      dragging.value = null;
    };
  }

  const dragStyle = computed<Record<string, string>>((): Record<string, string> => {
    const state = dragging.value;
    if (state === null) return {};
    return {
      inlineSize: `${state.width}px`,
      blockSize: `${state.height}px`,
      transform: `translate3d(${state.x}px, ${state.y}px, 0)`,
    };
  });

  return {
    dragging,
    dragStyle,
    startDesktopDrag,
    stopDesktopDrag,
  };
}
