import { computed, ref, type ComputedRef, type Ref } from "vue";

export interface UseWidgetGalleryPanelDragOptions {
  panelRef: Ref<HTMLElement | null>;
  isOpen: () => boolean;
  getDesktopStageTop: () => number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function useWidgetGalleryPanelDrag(options: UseWidgetGalleryPanelDragOptions): {
  panelPosition: Ref<{ x: number; y: number } | null>;
  panelDragging: Ref<boolean>;
  panelStyle: ComputedRef<Record<string, string>>;
  startPanelDrag: (event: PointerEvent) => void;
  clampPanelToViewport: () => void;
  stopPanelDrag: () => void;
} {
  const panelPosition = ref<{ x: number; y: number } | null>(null);
  const panelDragging = ref(false);

  let stopPanelDragImpl: (() => void) | undefined;

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
    const desktopTop = options.getDesktopStageTop();
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
    if (!options.isOpen() || panelPosition.value === null) return;

    const panel = options.panelRef.value;
    if (panel === null) return;

    const rect = panel.getBoundingClientRect();
    panelPosition.value = clampPanelPosition(
      panelPosition.value.x,
      panelPosition.value.y,
      rect.width,
      rect.height,
    );
  }

  function stopPanelDrag(): void {
    stopPanelDragImpl?.();
  }

  function startPanelDrag(event: PointerEvent): void {
    if (event.button !== 0) return;

    const panel = options.panelRef.value;
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

    stopPanelDrag();
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
      stopPanelDragImpl = undefined;
      panelDragging.value = false;
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    stopPanelDragImpl = end;
    event.preventDefault();
  }

  const panelStyle = computed<Record<string, string>>((): Record<string, string> => {
    const position = panelPosition.value;
    if (position === null) return {};

    return {
      insetBlockStart: `${position.y.toString()}px`,
      insetInlineEnd: "auto",
      insetInlineStart: `${position.x.toString()}px`,
    };
  });

  return {
    panelPosition,
    panelDragging,
    panelStyle,
    startPanelDrag,
    clampPanelToViewport,
    stopPanelDrag,
  };
}
