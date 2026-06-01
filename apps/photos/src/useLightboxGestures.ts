import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from "vue";

const DEFAULT_MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2;
const SWIPE_THRESHOLD_PX = 60;
const SWIPE_CLOSE_THRESHOLD_PX = 90;
const DOUBLE_TAP_MS = 300;
const TAP_MOVE_TOLERANCE_PX = 16;
const DOUBLE_TAP_DISTANCE_PX = 40;
const WHEEL_ZOOM_INTENSITY = 0.0025;

export type SwipeAction = "prev" | "next" | "close" | null;

/** Clamp a zoom factor into the `[min, max]` range. */
export function clampScale(scale: number, min = 1, max = DEFAULT_MAX_SCALE): number {
  return Math.min(max, Math.max(min, scale));
}

/** Scale implied by a two-finger pinch, relative to the gesture's start. */
export function pinchScale(
  startScale: number,
  startDistance: number,
  currentDistance: number,
  max = DEFAULT_MAX_SCALE,
): number {
  if (startDistance <= 0) {
    return clampScale(startScale, 1, max);
  }
  return clampScale((startScale * currentDistance) / startDistance, 1, max);
}

/**
 * Translation (one axis) that keeps a focal point stationary while the scale
 * changes by `ratio`. `focalDelta` is the focal point measured from the stage
 * center; `startTranslate` is the translation before the zoom step.
 */
export function focalTranslate(focalDelta: number, ratio: number, startTranslate: number): number {
  return focalDelta * (1 - ratio) + ratio * startTranslate;
}

/** Bound a translation so a `scale`d element cannot be dragged past its edges. */
export function clampTranslate(value: number, axisSize: number, scale: number): number {
  const max = Math.max(0, (axisSize * (scale - 1)) / 2);
  return Math.min(max, Math.max(-max, value));
}

/** Map a release delta (at base scale) to a navigation/close intent. */
export function resolveSwipe(
  deltaX: number,
  deltaY: number,
  thresholds: { swipe?: number; close?: number } = {},
): SwipeAction {
  const swipe = thresholds.swipe ?? SWIPE_THRESHOLD_PX;
  const close = thresholds.close ?? SWIPE_CLOSE_THRESHOLD_PX;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX >= absY) {
    if (absX < swipe) {
      return null;
    }
    return deltaX < 0 ? "next" : "prev";
  }

  return deltaY > close ? "close" : null;
}

export interface UseLightboxGesturesOptions {
  onPrev?: () => void;
  onNext?: () => void;
  onClose?: () => void;
  maxScale?: number;
}

export interface UseLightboxGesturesReturn {
  readonly scale: Ref<number>;
  readonly translateX: Ref<number>;
  readonly translateY: Ref<number>;
  readonly isZoomed: ComputedRef<boolean>;
  readonly transformStyle: ComputedRef<{ transform: string }>;
  /** Snap back to the un-zoomed, centered state. */
  reset(): void;
  /** Detach listeners. Idempotent. */
  dispose(): void;
}

interface SingleState {
  pointerId: number;
  startX: number;
  startY: number;
  startTx: number;
  startTy: number;
  moved: boolean;
}

interface PinchState {
  a: number;
  b: number;
  startDistance: number;
  startScale: number;
  startTx: number;
  startTy: number;
  startMidX: number;
  startMidY: number;
  focalX: number;
  focalY: number;
}

interface GestureZoomState {
  startScale: number;
  startTx: number;
  startTy: number;
  focalX: number;
  focalY: number;
}

interface WebKitGestureEvent extends Event {
  readonly clientX?: number;
  readonly clientY?: number;
  readonly scale?: number;
}

/**
 * Touch-first zoom/pan/swipe for the photo lightbox: pinch to zoom, drag to pan
 * when zoomed, horizontal swipe to navigate and swipe-down to close at base
 * scale, and double-tap to toggle a 2x zoom centered on the tap.
 */
export function useLightboxGestures(
  target: Ref<HTMLElement | null | undefined>,
  options: UseLightboxGesturesOptions = {},
): UseLightboxGesturesReturn {
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;

  const scale = ref(1);
  const translateX = ref(0);
  const translateY = ref(0);

  const isZoomed = computed(() => scale.value > 1);
  const transformStyle = computed(() => ({
    transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0) scale(${scale.value})`,
  }));

  let attachedEl: HTMLElement | undefined;
  const pointers = new Map<number, { x: number; y: number }>();
  let single: SingleState | null = null;
  let pinch: PinchState | null = null;
  let gestureZoom: GestureZoomState | null = null;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  function now(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function metrics(el: HTMLElement): {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
  } {
    const rect = el.getBoundingClientRect();
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  }

  function applyClampedTranslate(tx: number, ty: number): void {
    if (attachedEl === undefined) {
      translateX.value = tx;
      translateY.value = ty;
      return;
    }
    const { width, height } = metrics(attachedEl);
    translateX.value = clampTranslate(tx, width, scale.value);
    translateY.value = clampTranslate(ty, height, scale.value);
  }

  function zoomAt(clientX: number, clientY: number, nextScale: number): void {
    if (attachedEl === undefined) {
      return;
    }

    const { centerX, centerY } = metrics(attachedEl);
    const startScale = scale.value;
    const startTx = translateX.value;
    const startTy = translateY.value;
    const clampedScale = clampScale(nextScale, 1, maxScale);
    const ratio = startScale === 0 ? 1 : clampedScale / startScale;

    scale.value = clampedScale;
    applyClampedTranslate(
      focalTranslate(clientX - centerX, ratio, startTx),
      focalTranslate(clientY - centerY, ratio, startTy),
    );
  }

  function reset(): void {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    single = null;
    pinch = null;
    gestureZoom = null;
  }

  function toggleZoomAt(clientX: number, clientY: number): void {
    if (scale.value > 1 || attachedEl === undefined) {
      reset();
      return;
    }
    zoomAt(clientX, clientY, DOUBLE_TAP_SCALE);
  }

  function beginPinch(): void {
    if (attachedEl === undefined) {
      return;
    }
    const ids = [...pointers.keys()];
    const idA = ids[0];
    const idB = ids[1];
    if (idA === undefined || idB === undefined) {
      return;
    }
    const pa = pointers.get(idA);
    const pb = pointers.get(idB);
    if (pa === undefined || pb === undefined) {
      return;
    }
    const midX = (pa.x + pb.x) / 2;
    const midY = (pa.y + pb.y) / 2;
    const { centerX, centerY } = metrics(attachedEl);
    pinch = {
      a: idA,
      b: idB,
      startDistance: Math.hypot(pa.x - pb.x, pa.y - pb.y),
      startScale: scale.value,
      startTx: translateX.value,
      startTy: translateY.value,
      startMidX: midX,
      startMidY: midY,
      focalX: midX - centerX,
      focalY: midY - centerY,
    };
    single = null;
  }

  function updatePinch(): void {
    if (pinch === null) {
      return;
    }
    const pa = pointers.get(pinch.a);
    const pb = pointers.get(pinch.b);
    if (pa === undefined || pb === undefined) {
      return;
    }
    const distance = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    const nextScale = pinchScale(pinch.startScale, pinch.startDistance, distance, maxScale);
    const ratio = pinch.startScale === 0 ? 1 : nextScale / pinch.startScale;
    const midX = (pa.x + pb.x) / 2;
    const midY = (pa.y + pb.y) / 2;
    scale.value = nextScale;
    applyClampedTranslate(
      focalTranslate(pinch.focalX, ratio, pinch.startTx) + (midX - pinch.startMidX),
      focalTranslate(pinch.focalY, ratio, pinch.startTy) + (midY - pinch.startMidY),
    );
  }

  function beginSingle(pointerId: number): void {
    const p = pointers.get(pointerId);
    if (p === undefined) {
      return;
    }
    single = {
      pointerId,
      startX: p.x,
      startY: p.y,
      startTx: translateX.value,
      startTy: translateY.value,
      moved: false,
    };
  }

  function updateSingle(): void {
    if (single === null) {
      return;
    }
    const p = pointers.get(single.pointerId);
    if (p === undefined) {
      return;
    }
    const dx = p.x - single.startX;
    const dy = p.y - single.startY;
    if (Math.abs(dx) > TAP_MOVE_TOLERANCE_PX || Math.abs(dy) > TAP_MOVE_TOLERANCE_PX) {
      single.moved = true;
    }

    if (scale.value > 1) {
      applyClampedTranslate(single.startTx + dx, single.startTy + dy);
    } else if (Math.abs(dx) >= Math.abs(dy)) {
      translateX.value = dx;
      translateY.value = 0;
    }
  }

  function endSingle(): void {
    if (single === null) {
      return;
    }
    const p = pointers.get(single.pointerId) ?? { x: single.startX, y: single.startY };
    const dx = p.x - single.startX;
    const dy = p.y - single.startY;

    if (!single.moved) {
      const tappedAt = now();
      const isDoubleTap =
        tappedAt - lastTapAt < DOUBLE_TAP_MS &&
        Math.hypot(p.x - lastTapX, p.y - lastTapY) < DOUBLE_TAP_DISTANCE_PX;
      if (isDoubleTap) {
        toggleZoomAt(p.x, p.y);
        lastTapAt = 0;
      } else {
        lastTapAt = tappedAt;
        lastTapX = p.x;
        lastTapY = p.y;
      }
      single = null;
      return;
    }

    if (scale.value > 1) {
      single = null;
      return;
    }

    const action = resolveSwipe(dx, dy, {
      swipe: SWIPE_THRESHOLD_PX,
      close: SWIPE_CLOSE_THRESHOLD_PX,
    });
    translateX.value = 0;
    translateY.value = 0;
    single = null;

    if (action === "next") {
      options.onNext?.();
    } else if (action === "prev") {
      options.onPrev?.();
    } else if (action === "close") {
      options.onClose?.();
    }
  }

  function onPointerDown(event: PointerEvent): void {
    if (attachedEl === undefined) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      attachedEl.setPointerCapture(event.pointerId);
    } catch {}

    if (pointers.size >= 2) {
      beginPinch();
    } else {
      beginSingle(event.pointerId);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch !== null) {
      updatePinch();
    } else if (single !== null) {
      updateSingle();
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const wasPinching = pinch !== null;
    if (wasPinching) {
      pinch = null;
    } else if (single !== null && single.pointerId === event.pointerId) {
      endSingle();
    }

    pointers.delete(event.pointerId);
    try {
      attachedEl?.releasePointerCapture(event.pointerId);
    } catch {}

    if (wasPinching && scale.value <= 1) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
    }

    if (wasPinching && pointers.size === 1) {
      const remaining = [...pointers.keys()][0];
      if (remaining !== undefined) {
        beginSingle(remaining);
      }
    }

    if (pointers.size === 0) {
      single = null;
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    try {
      attachedEl?.releasePointerCapture(event.pointerId);
    } catch {}
    if (pointers.size < 2) {
      pinch = null;
    }
    if (pointers.size === 0) {
      single = null;
    }
  }

  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    zoomAt(
      event.clientX,
      event.clientY,
      scale.value * Math.exp(-event.deltaY * WHEEL_ZOOM_INTENSITY),
    );
  }

  function gesturePoint(event: WebKitGestureEvent): { x: number; y: number } | null {
    if (typeof event.clientX === "number" && typeof event.clientY === "number") {
      return { x: event.clientX, y: event.clientY };
    }
    if (attachedEl === undefined) {
      return null;
    }
    const { centerX, centerY } = metrics(attachedEl);
    return { x: centerX, y: centerY };
  }

  function beginGestureZoom(event: Event): void {
    event.preventDefault();
    if (attachedEl === undefined) {
      return;
    }

    const point = gesturePoint(event as WebKitGestureEvent);
    if (point === null) {
      return;
    }

    const { centerX, centerY } = metrics(attachedEl);
    gestureZoom = {
      startScale: scale.value,
      startTx: translateX.value,
      startTy: translateY.value,
      focalX: point.x - centerX,
      focalY: point.y - centerY,
    };
    single = null;
    pinch = null;
  }

  function updateGestureZoom(event: Event): void {
    event.preventDefault();
    if (gestureZoom === null) {
      beginGestureZoom(event);
      return;
    }

    const gestureEvent = event as WebKitGestureEvent;
    const eventScale =
      typeof gestureEvent.scale === "number" && Number.isFinite(gestureEvent.scale)
        ? gestureEvent.scale
        : 1;
    const nextScale = clampScale(gestureZoom.startScale * eventScale, 1, maxScale);
    const ratio = gestureZoom.startScale === 0 ? 1 : nextScale / gestureZoom.startScale;

    scale.value = nextScale;
    applyClampedTranslate(
      focalTranslate(gestureZoom.focalX, ratio, gestureZoom.startTx),
      focalTranslate(gestureZoom.focalY, ratio, gestureZoom.startTy),
    );
  }

  function endGestureZoom(event: Event): void {
    event.preventDefault();
    gestureZoom = null;
    if (scale.value <= 1) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
    }
  }

  function attach(el: HTMLElement): void {
    attachedEl = el;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
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
    attachedEl.removeEventListener("pointerup", onPointerUp);
    attachedEl.removeEventListener("pointercancel", onPointerCancel);
    attachedEl.removeEventListener("wheel", onWheel);
    attachedEl.removeEventListener("gesturestart", beginGestureZoom);
    attachedEl.removeEventListener("gesturechange", updateGestureZoom);
    attachedEl.removeEventListener("gestureend", endGestureZoom);
    attachedEl = undefined;
    pointers.clear();
    single = null;
    pinch = null;
    gestureZoom = null;
  }

  const stopWatch = watch(
    target,
    (el, _prev, onCleanup) => {
      detach();
      if (el) {
        attach(el);
      }
      onCleanup(() => {
        detach();
      });
    },
    { immediate: true, flush: "post" },
  );

  function dispose(): void {
    stopWatch();
    detach();
  }

  onUnmounted(dispose);

  return { scale, translateX, translateY, isZoomed, transformStyle, reset, dispose };
}
