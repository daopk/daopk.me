import { snapToGrid, WIDGET_GRID_PITCH_PX } from "~/core/widgets/sizing";

export interface UseWidgetDragOptions {
  getPosition: () => { x: number; y: number };
  getSize: () => { width: number; height: number };
  getHostSize: () => { width: number; height: number };
  /**
   * Streamed during drag with the next clamped pixel position
   * (top-left). The slot binds this to its inline `transform: translate`
   * so the widget follows the pointer in real time. Called at the
   * pointer event rate (typically 60–120 Hz). Caller MUST NOT
   * trigger a layout-inducing read inside this callback — it's the
   * hot path.
   */
  onMove: (x: number, y: number) => void;
  onDrop: (gridX: number, gridY: number) => void;
  /**
   * Optional hook — fires once the pointer crosses the drag threshold.
   * Useful for lifting `z-index` during drag (raises the dragged
   * widget to `--desktop-widget-layer-z` + 1 so it sits above its
   * neighbours but still below windows).
   */
  onStart?: () => void;
  /**
   * Optional hook — fires once on `pointerup` / `pointercancel`,
   * AFTER `onDrop` is called. Mirror of `onStart` (drop the lifted
   * z-index, clear the dragging-cursor class, etc.).
   */
  onEnd?: () => void;
}

export interface WidgetDragHandlers {
  onPointerDown: (event: PointerEvent) => void;
}

const DRAG_START_THRESHOLD_PX = 6;
const DRAG_START_THRESHOLD_SQ = DRAG_START_THRESHOLD_PX * DRAG_START_THRESHOLD_PX;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function useWidgetDrag(options: UseWidgetDragOptions): WidgetDragHandlers {
  // Guards against a re-entrant `pointerdown` while a gesture is armed.
  let active = false;

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    if (active) {
      return;
    }

    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    active = true;

    const startPos = options.getPosition();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const offsetX = event.clientX - startPos.x;
    const offsetY = event.clientY - startPos.y;
    const pointerId = event.pointerId;

    let dragging = false;
    let lastX = startPos.x;
    let lastY = startPos.y;

    const updatePosition = (move: PointerEvent): void => {
      const size = options.getSize();
      const host = options.getHostSize();
      const rawX = move.clientX - offsetX;
      const rawY = move.clientY - offsetY;
      const maxX = host.width - size.width;
      const maxY = host.height - size.height;
      lastX = clamp(rawX, 0, maxX);
      lastY = clamp(rawY, 0, maxY);
      options.onMove(lastX, lastY);
    };

    const startDrag = (): void => {
      dragging = true;

      try {
        target.setPointerCapture(pointerId);
      } catch {}

      options.onStart?.();
    };

    const onMove = (move: PointerEvent): void => {
      if (move.pointerId !== pointerId) {
        return;
      }

      if (!dragging) {
        const deltaX = move.clientX - startClientX;
        const deltaY = move.clientY - startClientY;
        if (deltaX * deltaX + deltaY * deltaY < DRAG_START_THRESHOLD_SQ) {
          return;
        }
        startDrag();
      }

      updatePosition(move);
      move.preventDefault();
    };

    const cleanup = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);

      try {
        target.releasePointerCapture(pointerId);
      } catch {}

      if (!dragging) {
        active = false;
        return;
      }

      const snappedX = snapToGrid(lastX);
      const snappedY = snapToGrid(lastY);
      const gridX = Math.round(snappedX / WIDGET_GRID_PITCH_PX);
      const gridY = Math.round(snappedY / WIDGET_GRID_PITCH_PX);
      options.onDrop(gridX, gridY);

      options.onEnd?.();

      active = false;
    };

    const onPointerUp = (up: PointerEvent): void => {
      if (up.pointerId !== pointerId) {
        return;
      }
      if (dragging) {
        up.preventDefault();
      }
      cleanup();
    };

    const onPointerCancel = (cancel: PointerEvent): void => {
      if (cancel.pointerId !== pointerId) {
        return;
      }
      cleanup();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  }

  return { onPointerDown };
}
