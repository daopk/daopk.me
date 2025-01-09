export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface UseWindowResizeOptions {
  direction: ResizeDirection;
  getBounds: () => { x: number; y: number; width: number; height: number };
  onResize: (x: number, y: number, width: number, height: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface WindowResizeHandlers {
  onPointerDown: (event: PointerEvent) => void;
}

function applyDelta(
  direction: ResizeDirection,
  start: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = start;

  if (direction.includes("e")) {
    width = start.width + dx;
  }

  if (direction.includes("s")) {
    height = start.height + dy;
  }

  if (direction.includes("w")) {
    x = start.x + dx;
    width = start.width - dx;
  }

  if (direction.includes("n")) {
    y = start.y + dy;
    height = start.height - dy;
  }

  return { x, y, width, height };
}

export function useWindowResize(options: UseWindowResizeOptions): WindowResizeHandlers {
  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const target = event.currentTarget;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const startBounds = options.getBounds();
    const startX = event.clientX;
    const startY = event.clientY;

    try {
      target.setPointerCapture(event.pointerId);
    } catch {}

    options.onStart?.();

    const onMove = (move: PointerEvent): void => {
      const dx = move.clientX - startX;
      const dy = move.clientY - startY;

      const next = applyDelta(options.direction, startBounds, dx, dy);
      options.onResize(next.x, next.y, next.width, next.height);
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
    event.stopPropagation();
  }

  return { onPointerDown };
}
