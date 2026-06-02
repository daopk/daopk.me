import { onScopeDispose, watch, type Ref } from "vue";

import type { PdfViewerBindings, PdfViewerZoomPoint } from "./usePdfViewer";

const WHEEL_ZOOM_INTENSITY = 0.0035;
const WHEEL_COMMIT_DELAY_MS = 140;

type PdfViewerGestureBindings = Pick<
  PdfViewerBindings,
  "scale" | "pageCount" | "previewScaleAt" | "commitPreviewScale"
>;

interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

interface PinchState {
  readonly a: number;
  readonly b: number;
  readonly startDistance: number;
  readonly startScale: number;
}

interface GestureZoomState {
  readonly startScale: number;
}

interface WebKitGestureEvent extends Event {
  readonly clientX?: number;
  readonly clientY?: number;
  readonly scale?: number;
}

export interface UsePdfViewerGesturesReturn {
  dispose(): void;
}

export function usePdfViewerGestures(
  target: Ref<HTMLElement | null | undefined>,
  viewer: PdfViewerGestureBindings,
): UsePdfViewerGesturesReturn {
  let attachedEl: HTMLElement | undefined;
  let pinch: PinchState | null = null;
  let gestureZoom: GestureZoomState | null = null;
  let wheelCommitTimer: number | undefined;
  const pointers = new Map<number, PointerPosition>();

  function hasDocument(): boolean {
    return viewer.pageCount.value > 0;
  }

  function pointFromEvent(event: Pick<MouseEvent, "clientX" | "clientY">): PdfViewerZoomPoint {
    return {
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  function centerPoint(): PdfViewerZoomPoint | null {
    if (attachedEl === undefined) {
      return null;
    }

    const rect = attachedEl.getBoundingClientRect();
    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
  }

  function gesturePoint(event: WebKitGestureEvent): PdfViewerZoomPoint | null {
    if (typeof event.clientX === "number" && typeof event.clientY === "number") {
      return {
        clientX: event.clientX,
        clientY: event.clientY,
      };
    }
    return centerPoint();
  }

  function clearWheelCommit(): void {
    if (wheelCommitTimer === undefined) {
      return;
    }
    window.clearTimeout(wheelCommitTimer);
    wheelCommitTimer = undefined;
  }

  function commitPreview(): void {
    clearWheelCommit();
    void viewer.commitPreviewScale();
  }

  function scheduleWheelCommit(): void {
    clearWheelCommit();
    wheelCommitTimer = window.setTimeout(() => {
      wheelCommitTimer = undefined;
      void viewer.commitPreviewScale();
    }, WHEEL_COMMIT_DELAY_MS);
  }

  function beginPinch(): void {
    if (!hasDocument()) {
      return;
    }

    const ids = [...pointers.keys()];
    const idA = ids[0];
    const idB = ids[1];
    if (idA === undefined || idB === undefined) {
      return;
    }

    const a = pointers.get(idA);
    const b = pointers.get(idB);
    if (a === undefined || b === undefined) {
      return;
    }

    pinch = {
      a: idA,
      b: idB,
      startDistance: Math.hypot(a.x - b.x, a.y - b.y),
      startScale: viewer.scale.value,
    };
  }

  function updatePinch(): void {
    if (pinch === null || pinch.startDistance <= 0) {
      return;
    }

    const a = pointers.get(pinch.a);
    const b = pointers.get(pinch.b);
    if (a === undefined || b === undefined) {
      return;
    }

    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    viewer.previewScaleAt((pinch.startScale * distance) / pinch.startDistance, {
      clientX: (a.x + b.x) / 2,
      clientY: (a.y + b.y) / 2,
    });
  }

  function onPointerDown(event: PointerEvent): void {
    if (!hasDocument()) {
      return;
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      event.preventDefault();
      try {
        attachedEl?.setPointerCapture(event.pointerId);
      } catch {}
      beginPinch();
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) {
      return;
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch !== null) {
      event.preventDefault();
      updatePinch();
    }
  }

  function onPointerEnd(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) {
      return;
    }

    const wasPinching = pinch !== null;
    pointers.delete(event.pointerId);
    try {
      attachedEl?.releasePointerCapture(event.pointerId);
    } catch {}

    if (!wasPinching) {
      return;
    }

    if (pointers.size >= 2) {
      beginPinch();
      return;
    }

    pinch = null;
    commitPreview();
  }

  function onPointerCancel(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) {
      return;
    }

    onPointerEnd(event);
  }

  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey || !hasDocument()) {
      return;
    }

    event.preventDefault();
    const changed = viewer.previewScaleAt(
      viewer.scale.value * Math.exp(-event.deltaY * WHEEL_ZOOM_INTENSITY),
      pointFromEvent(event),
    );
    if (changed) {
      scheduleWheelCommit();
    }
  }

  function beginGestureZoom(event: Event): void {
    if (!hasDocument()) {
      return;
    }

    event.preventDefault();
    gestureZoom = {
      startScale: viewer.scale.value,
    };
  }

  function updateGestureZoom(event: Event): void {
    if (!hasDocument()) {
      return;
    }

    event.preventDefault();
    if (gestureZoom === null) {
      beginGestureZoom(event);
    }

    if (gestureZoom === null) {
      return;
    }

    const gestureEvent = event as WebKitGestureEvent;
    const point = gesturePoint(gestureEvent);
    if (point === null) {
      return;
    }

    const eventScale =
      typeof gestureEvent.scale === "number" && Number.isFinite(gestureEvent.scale)
        ? gestureEvent.scale
        : 1;
    viewer.previewScaleAt(gestureZoom.startScale * eventScale, point);
  }

  function endGestureZoom(event: Event): void {
    if (!hasDocument()) {
      return;
    }

    event.preventDefault();
    gestureZoom = null;
    commitPreview();
  }

  function attach(el: HTMLElement): void {
    attachedEl = el;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerEnd);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", beginGestureZoom, { passive: false });
    el.addEventListener("gesturechange", updateGestureZoom, { passive: false });
    el.addEventListener("gestureend", endGestureZoom, { passive: false });
  }

  function detach(): void {
    if (attachedEl === undefined) {
      return;
    }

    attachedEl.removeEventListener("pointerdown", onPointerDown);
    attachedEl.removeEventListener("pointermove", onPointerMove);
    attachedEl.removeEventListener("pointerup", onPointerEnd);
    attachedEl.removeEventListener("pointercancel", onPointerCancel);
    attachedEl.removeEventListener("wheel", onWheel);
    attachedEl.removeEventListener("gesturestart", beginGestureZoom);
    attachedEl.removeEventListener("gesturechange", updateGestureZoom);
    attachedEl.removeEventListener("gestureend", endGestureZoom);
    attachedEl = undefined;
    pointers.clear();
    pinch = null;
    gestureZoom = null;
  }

  const stopWatch = watch(
    target,
    (el, _previous, onCleanup) => {
      detach();
      if (el !== null && el !== undefined) {
        attach(el);
      }
      onCleanup(detach);
    },
    { immediate: true, flush: "post" },
  );

  function dispose(): void {
    clearWheelCommit();
    stopWatch();
    detach();
  }

  onScopeDispose(dispose);

  return { dispose };
}
