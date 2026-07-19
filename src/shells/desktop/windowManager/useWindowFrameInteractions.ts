import { ref, type Ref } from "vue";

import { TITLEBAR_HEIGHT, type SnapEdge, type WindowRecord } from "./useWindowManager";
import { clampWindowPosition } from "./windowGeometry";
import { useWindowDrag, type WindowDragHandlers } from "./useWindowDrag";
import {
  useWindowResize,
  type ResizeDirection,
  type WindowResizeHandlers,
} from "./useWindowResize";
import { SNAP_ENTER, SNAP_EXIT } from "./snapConfig";

type StageBounds = Readonly<{ width: number; height: number }>;
type StageOffset = Readonly<{ x: number; y: number }>;

export interface UseWindowFrameInteractionsOptions {
  readonly getRecord: () => WindowRecord;
  readonly getStageBounds: () => StageBounds;
  readonly getStageOffset: () => StageOffset | undefined;
  readonly onFocus: () => void;
  readonly onMove: (id: string, x: number, y: number) => void;
  readonly onResize: (id: string, x: number, y: number, width: number, height: number) => void;
  readonly onSnap: (id: string, edge: SnapEdge) => void;
  readonly onSnapIntent: (id: string, edge: SnapEdge | null) => void;
}

export interface WindowFrameInteractions {
  readonly dragging: Ref<boolean>;
  readonly resizing: Ref<boolean>;
  readonly drag: WindowDragHandlers;
  readonly resizeDirections: readonly ResizeDirection[];
  readonly resizeHandlers: Readonly<Record<ResizeDirection, WindowResizeHandlers["onPointerDown"]>>;
}

const RESIZE_DIRECTIONS: readonly ResizeDirection[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export function useWindowFrameInteractions(
  options: UseWindowFrameInteractionsOptions,
): WindowFrameInteractions {
  const dragging = ref(false);
  const resizing = ref(false);
  const snapIntent = ref<SnapEdge | null>(null);

  function clampPosition(x: number, y: number): { x: number; y: number } {
    const record = options.getRecord();
    const stage = options.getStageBounds();

    return clampWindowPosition(x, y, {
      stageWidth: stage.width,
      stageHeight: stage.height,
      windowWidth: record.width,
      titlebarHeight: TITLEBAR_HEIGHT,
    });
  }

  function clampResize(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { x: number; y: number; width: number; height: number } {
    const { width: stageW, height: stageH } = options.getStageBounds();

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

  function setSnapIntent(next: SnapEdge | null): void {
    if (snapIntent.value === next) {
      return;
    }

    snapIntent.value = next;
    options.onSnapIntent(options.getRecord().id, next);
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

  function updateSnapIntent(clientX: number, clientY: number): void {
    if (options.getRecord().maximized) {
      setSnapIntent(null);
      return;
    }

    const { width } = options.getStageBounds();

    // Wait for ResizeObserver to populate stage bounds before resolving edge intent.
    if (width <= 0) {
      setSnapIntent(null);
      return;
    }

    const offset = options.getStageOffset();
    const stageX = clientX - (offset?.x ?? 0);
    const stageY = clientY - (offset?.y ?? 0);

    setSnapIntent(nextSnapIntent(stageX, stageY, width));
  }

  const drag = useWindowDrag({
    getPosition: () => {
      const record = options.getRecord();
      return { x: record.x, y: record.y };
    },
    onMove: (x, y, pointerX, pointerY) => {
      const record = options.getRecord();
      const clamped = clampPosition(x, y);
      options.onMove(record.id, clamped.x, clamped.y);
      updateSnapIntent(pointerX, pointerY);
    },
    onStart: () => {
      dragging.value = true;
      setSnapIntent(null);
      options.onFocus();
    },
    onEnd: () => {
      dragging.value = false;

      const pending = snapIntent.value;
      setSnapIntent(null);

      if (pending !== null) {
        options.onSnap(options.getRecord().id, pending);
      }
    },
  });

  const sharedResizeOptions = {
    getBounds: () => {
      const record = options.getRecord();
      return { x: record.x, y: record.y, width: record.width, height: record.height };
    },
    onResize: (x: number, y: number, width: number, height: number) => {
      const record = options.getRecord();
      const clamped = clampResize(x, y, width, height);
      options.onResize(record.id, clamped.x, clamped.y, clamped.width, clamped.height);
    },
    onStart: () => {
      resizing.value = true;
      options.onFocus();
    },
    onEnd: () => {
      resizing.value = false;
    },
  };

  const resizeHandlers = Object.fromEntries(
    RESIZE_DIRECTIONS.map((direction) => [
      direction,
      useWindowResize({ ...sharedResizeOptions, direction }).onPointerDown,
    ]),
  ) as Record<ResizeDirection, WindowResizeHandlers["onPointerDown"]>;

  return {
    dragging,
    resizing,
    drag,
    resizeDirections: RESIZE_DIRECTIONS,
    resizeHandlers,
  };
}
