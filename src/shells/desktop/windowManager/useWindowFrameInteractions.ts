import { getCurrentScope, onScopeDispose, ref, type Ref } from "vue";

import { TITLEBAR_HEIGHT, type SnapEdge } from "./useWindowManager";
import { SNAP_ENTER, SNAP_EXIT } from "./snapConfig";

type StageBounds = Readonly<{ width: number; height: number }>;
type StageOffset = Readonly<{ x: number; y: number }>;

interface WindowFrameRecord {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly maximized: boolean;
}

export interface WindowFrameSnapshot {
  readonly window: WindowFrameRecord;
  readonly stageBounds: StageBounds;
  readonly stageOffset?: StageOffset;
}

export type WindowFrameOutcome =
  | { readonly type: "focus-window"; readonly windowId: string }
  | {
      readonly type: "move-window";
      readonly windowId: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: "resize-window";
      readonly windowId: string;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly type: "snap-window"; readonly windowId: string; readonly edge: SnapEdge }
  | {
      readonly type: "preview-snap";
      readonly windowId: string;
      readonly edge: SnapEdge | null;
    };

export interface WindowFrameSession {
  readonly read: () => WindowFrameSnapshot;
  readonly focus: () => void;
  readonly publish: (outcome: WindowFrameOutcome) => void;
}

export interface WindowFrameInteractions {
  readonly dragging: Readonly<Ref<boolean>>;
  readonly resizing: Readonly<Ref<boolean>>;
  readonly resizeDirections: readonly WindowFrameResizeDirection[];
  startDrag(event: PointerEvent): void;
  startResize(direction: WindowFrameResizeDirection, event: PointerEvent): void;
}

export type WindowFrameResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_VISIBLE_X = 60;
const RESIZE_DIRECTIONS: readonly WindowFrameResizeDirection[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

type PointerFinish = "commit" | "cancel";

interface PointerLifecycle {
  readonly onStart: () => void;
  readonly onMove: (event: PointerEvent) => void;
  readonly onFinish: (finish: PointerFinish) => void;
}

export function useWindowFrameInteractions(session: WindowFrameSession): WindowFrameInteractions {
  const dragging = ref(false);
  const resizing = ref(false);
  const snapIntent = ref<SnapEdge | null>(null);
  let stopTracking: ((finish: PointerFinish) => void) | null = null;

  function clampPosition(
    x: number,
    y: number,
    record: WindowFrameRecord,
    stage: StageBounds,
  ): { x: number; y: number } {
    let safeX = x;
    if (stage.width > 0) {
      const minX = Math.min(0, MIN_VISIBLE_X - record.width);
      const maxX = Math.max(stage.width - MIN_VISIBLE_X, 0);
      safeX = Math.min(Math.max(x, minX), maxX);
    }

    let safeY = y;
    if (stage.height > 0) {
      safeY = Math.min(Math.max(y, 0), Math.max(stage.height - TITLEBAR_HEIGHT, 0));
    }

    return { x: safeX, y: safeY };
  }

  function clampResize(
    x: number,
    y: number,
    width: number,
    height: number,
    stage: StageBounds,
  ): { x: number; y: number; width: number; height: number } {
    const { width: stageW, height: stageH } = stage;

    if (stageW <= 0 || stageH <= 0) {
      return { x, y, width, height };
    }

    const clampedX = Math.max(0, x);
    const clampedY = Math.max(0, y);
    const adjustedWidth = width + (x - clampedX);
    const adjustedHeight = height + (y - clampedY);

    return {
      x: clampedX,
      y: clampedY,
      width: Math.min(adjustedWidth, stageW - clampedX),
      height: Math.min(adjustedHeight, stageH - clampedY),
    };
  }

  function setSnapIntent(windowId: string, next: SnapEdge | null): void {
    if (snapIntent.value === next) {
      return;
    }

    snapIntent.value = next;
    session.publish({ type: "preview-snap", windowId, edge: next });
  }

  function nextSnapIntent(stageX: number, stageY: number, width: number): SnapEdge | null {
    if (stageY <= SNAP_ENTER) {
      return "max";
    }

    if (stageX <= SNAP_ENTER) {
      return "left";
    }

    if (stageX >= width - SNAP_ENTER) {
      return "right";
    }

    const current = snapIntent.value;

    if (current === "max" && stageY <= SNAP_EXIT) {
      return "max";
    }

    if (current === "left" && stageX <= SNAP_EXIT) {
      return "left";
    }

    if (current === "right" && stageX >= width - SNAP_EXIT) {
      return "right";
    }

    return null;
  }

  function updateSnapIntent(
    windowId: string,
    clientX: number,
    clientY: number,
    snapshot: WindowFrameSnapshot,
  ): void {
    if (snapshot.window.maximized) {
      setSnapIntent(windowId, null);
      return;
    }

    const { width } = snapshot.stageBounds;

    // Wait for ResizeObserver to populate stage bounds before resolving edge intent.
    if (width <= 0) {
      setSnapIntent(windowId, null);
      return;
    }

    const offset = snapshot.stageOffset;
    const stageX = clientX - (offset?.x ?? 0);
    const stageY = clientY - (offset?.y ?? 0);

    setSnapIntent(windowId, nextSnapIntent(stageX, stageY, width));
  }

  function trackPointer(
    event: PointerEvent,
    lifecycle: PointerLifecycle,
    stopPropagation = false,
  ): void {
    if (event.button !== 0) {
      return;
    }

    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    stopTracking?.("cancel");

    const onMove = (move: PointerEvent): void => {
      lifecycle.onMove(move);
    };
    const onPointerUp = (): void => {
      finish("commit");
    };
    const onPointerCancel = (): void => {
      finish("cancel");
    };
    const finish = (result: PointerFinish): void => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerCancel);

      try {
        target.releasePointerCapture(event.pointerId);
      } catch {}

      if (stopTracking === finish) {
        stopTracking = null;
      }

      lifecycle.onFinish(result);
    };

    stopTracking = finish;

    try {
      target.setPointerCapture(event.pointerId);
    } catch {}

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerCancel);

    lifecycle.onStart();
    event.preventDefault();
    if (stopPropagation) {
      event.stopPropagation();
    }
  }

  function startDrag(event: PointerEvent): void {
    const start = session.read();
    const windowId = start.window.id;
    const offsetX = event.clientX - start.window.x;
    const offsetY = event.clientY - start.window.y;

    trackPointer(
      event,
      {
        onStart: () => {
          dragging.value = true;
          setSnapIntent(windowId, null);
          session.focus();
        },
        onMove: (move) => {
          const snapshot = session.read();
          const clamped = clampPosition(
            move.clientX - offsetX,
            move.clientY - offsetY,
            snapshot.window,
            snapshot.stageBounds,
          );
          session.publish({ type: "move-window", windowId, x: clamped.x, y: clamped.y });
          updateSnapIntent(windowId, move.clientX, move.clientY, snapshot);
        },
        onFinish: (finish) => {
          dragging.value = false;

          const pending = snapIntent.value;
          setSnapIntent(windowId, null);

          if (finish === "commit" && pending !== null) {
            session.publish({ type: "snap-window", windowId, edge: pending });
          }
        },
      },
      true,
    );
  }

  function applyResizeDelta(
    direction: WindowFrameResizeDirection,
    start: WindowFrameRecord,
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

  function startResize(direction: WindowFrameResizeDirection, event: PointerEvent): void {
    const start = session.read();
    const windowId = start.window.id;
    const startX = event.clientX;
    const startY = event.clientY;

    trackPointer(
      event,
      {
        onStart: () => {
          resizing.value = true;
          session.focus();
        },
        onMove: (move) => {
          const next = applyResizeDelta(
            direction,
            start.window,
            move.clientX - startX,
            move.clientY - startY,
          );
          const clamped = clampResize(
            next.x,
            next.y,
            next.width,
            next.height,
            session.read().stageBounds,
          );
          session.publish({ type: "resize-window", windowId, ...clamped });
        },
        onFinish: () => {
          resizing.value = false;
        },
      },
      true,
    );
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      stopTracking?.("cancel");
    });
  }

  return {
    dragging,
    resizing,
    resizeDirections: RESIZE_DIRECTIONS,
    startDrag,
    startResize,
  };
}
