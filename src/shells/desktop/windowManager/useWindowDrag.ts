export interface UseWindowDragOptions {
  getPosition: () => { x: number; y: number };
  onMove: (x: number, y: number, pointerX: number, pointerY: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface WindowDragHandlers {
  onPointerDown: (event: PointerEvent) => void;
}

export function useWindowDrag(options: UseWindowDragOptions): WindowDragHandlers {
  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const target = event.currentTarget;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const start = options.getPosition();
    const offsetX = event.clientX - start.x;
    const offsetY = event.clientY - start.y;

    try {
      target.setPointerCapture(event.pointerId);
    } catch {}

    options.onStart?.();

    const onMove = (move: PointerEvent): void => {
      options.onMove(move.clientX - offsetX, move.clientY - offsetY, move.clientX, move.clientY);
    };

    const cleanup = (): void => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", cleanup);
      target.removeEventListener("pointercancel", cleanup);

      try {
        target.releasePointerCapture(event.pointerId);
      } catch {}

      options.onEnd?.();
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", cleanup);
    target.addEventListener("pointercancel", cleanup);

    event.preventDefault();
  }

  return { onPointerDown };
}
