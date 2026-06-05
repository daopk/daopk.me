import { onBeforeUnmount } from "vue";

import { PARENT_HOLD_MS } from "./babyTouchTiming";
import type { BabyTouchPoint } from "./babyTouchTypes";

interface BabyTouchParentHoldOptions {
  readonly onComplete: () => void;
  readonly setTimeout?: (handler: TimerHandler, timeout?: number) => number;
  readonly clearTimeout?: (handle?: number) => void;
}

function cornerForPoint(point: BabyTouchPoint): "left" | "right" | null {
  if (point.y > 0.22) {
    return null;
  }
  if (point.x < 0.22) {
    return "left";
  }
  if (point.x > 0.78) {
    return "right";
  }
  return null;
}

export function useBabyTouchParentHold(options: BabyTouchParentHoldOptions) {
  const setTimer =
    options.setTimeout ??
    ((handler: TimerHandler, timeout?: number) => window.setTimeout(handler, timeout));
  const clearTimer = options.clearTimeout ?? ((handle?: number) => window.clearTimeout(handle));

  let parentHoldTimer: ReturnType<typeof setTimer> | null = null;
  const cornerPointers = new Map<number, "left" | "right">();

  function cancelParentHold(): void {
    if (parentHoldTimer !== null) {
      clearTimer(parentHoldTimer);
      parentHoldTimer = null;
    }
  }

  function maybeStartParentHold(): void {
    if (
      parentHoldTimer !== null ||
      ![...cornerPointers.values()].includes("left") ||
      ![...cornerPointers.values()].includes("right")
    ) {
      return;
    }
    parentHoldTimer = setTimer(() => {
      parentHoldTimer = null;
      cornerPointers.clear();
      options.onComplete();
    }, PARENT_HOLD_MS);
  }

  function handleParentCornerDown(pointerId: number, point: BabyTouchPoint): boolean {
    const corner = cornerForPoint(point);
    if (corner === null) {
      return false;
    }
    cornerPointers.set(pointerId, corner);
    maybeStartParentHold();
    return true;
  }

  function handleParentCornerUp(pointerId: number): void {
    if (!cornerPointers.has(pointerId)) {
      return;
    }
    cornerPointers.delete(pointerId);
    if (
      ![...cornerPointers.values()].includes("left") ||
      ![...cornerPointers.values()].includes("right")
    ) {
      cancelParentHold();
    }
  }

  onBeforeUnmount(() => {
    cancelParentHold();
  });

  return {
    cancelParentHold,
    handleParentCornerDown,
    handleParentCornerUp,
  };
}
