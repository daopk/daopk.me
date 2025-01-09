import { onUnmounted, ref, watch, type Ref } from "vue";

export interface GestureSnapshot {
  readonly startX: number;
  readonly startY: number;
  readonly x: number;
  readonly y: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly startedAt: number;
  readonly at: number;
  readonly pointerType: "mouse" | "touch" | "pen";
  readonly pointerId: number;
}

export interface UseGestureOptions {
  onStart?: (snapshot: GestureSnapshot, event: PointerEvent) => boolean | void;
  onMove?: (snapshot: GestureSnapshot, event: PointerEvent) => void;
  onEnd?: (snapshot: GestureSnapshot, event: PointerEvent) => void;
  onCancel?: (event: PointerEvent) => void;
  acceptMouse?: boolean;
}

export interface UseGestureReturn {
  readonly active: Ref<boolean>;
  readonly current: Ref<GestureSnapshot | null>;
  /** Detach listeners and release pointer capture. Idempotent. */
  dispose(): void;
}

export function useGesture(
  target: Ref<HTMLElement | null | undefined>,
  options: UseGestureOptions = {},
): UseGestureReturn {
  const active = ref(false);
  const current = ref<GestureSnapshot | null>(null);

  let attachedEl: HTMLElement | undefined;
  let capturedPointerId: number | undefined;
  let startSnapshot: GestureSnapshot | undefined;

  const acceptMouse = options.acceptMouse ?? true;

  function makeSnapshot(event: PointerEvent, anchor?: GestureSnapshot): GestureSnapshot {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const startX = anchor ? anchor.startX : event.clientX;
    const startY = anchor ? anchor.startY : event.clientY;
    const startedAt = anchor ? anchor.startedAt : now;

    return {
      startX,
      startY,
      x: event.clientX,
      y: event.clientY,
      deltaX: event.clientX - startX,
      deltaY: event.clientY - startY,
      startedAt,
      at: now,
      pointerType: (event.pointerType || "mouse") as GestureSnapshot["pointerType"],
      pointerId: event.pointerId,
    };
  }

  function onPointerDown(event: PointerEvent): void {
    if (!attachedEl) {
      return;
    }
    if (!acceptMouse && event.pointerType === "mouse") {
      return;
    }
    if (active.value) {
      return;
    }

    const snapshot = makeSnapshot(event);
    const allow = options.onStart?.(snapshot, event);
    if (allow === false) {
      return;
    }

    startSnapshot = snapshot;
    capturedPointerId = event.pointerId;
    active.value = true;
    current.value = snapshot;

    try {
      attachedEl.setPointerCapture(event.pointerId);
    } catch {}
  }

  function onPointerMove(event: PointerEvent): void {
    if (!active.value || event.pointerId !== capturedPointerId || !startSnapshot) {
      return;
    }

    const snapshot = makeSnapshot(event, startSnapshot);
    current.value = snapshot;
    options.onMove?.(snapshot, event);
  }

  function finalize(event: PointerEvent, cancelled: boolean): void {
    if (!active.value || event.pointerId !== capturedPointerId || !startSnapshot) {
      return;
    }

    const snapshot = makeSnapshot(event, startSnapshot);
    active.value = false;
    current.value = null;

    try {
      attachedEl?.releasePointerCapture(event.pointerId);
    } catch {}

    capturedPointerId = undefined;
    startSnapshot = undefined;

    if (cancelled) {
      options.onCancel?.(event);
    } else {
      options.onEnd?.(snapshot, event);
    }
  }

  function onPointerUp(event: PointerEvent): void {
    finalize(event, false);
  }

  function onPointerCancel(event: PointerEvent): void {
    finalize(event, true);
  }

  function attach(el: HTMLElement): void {
    attachedEl = el;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
  }

  function detach(): void {
    if (!attachedEl) {
      return;
    }

    attachedEl.removeEventListener("pointerdown", onPointerDown);
    attachedEl.removeEventListener("pointermove", onPointerMove);
    attachedEl.removeEventListener("pointerup", onPointerUp);
    attachedEl.removeEventListener("pointercancel", onPointerCancel);

    if (capturedPointerId !== undefined) {
      try {
        attachedEl.releasePointerCapture(capturedPointerId);
      } catch {}
    }

    attachedEl = undefined;
    capturedPointerId = undefined;
    startSnapshot = undefined;
    active.value = false;
    current.value = null;
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

  return { active, current, dispose };
}
