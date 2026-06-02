import type { BabyTouchPoint } from "./babyTouchTypes";

export type BabyTouchPointerMode = "natural" | "landscape-right";

export function pointFromPointerEvent(
  event: PointerEvent,
  mode: BabyTouchPointerMode = "natural",
): BabyTouchPoint {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = rect.width <= 0 ? 0.5 : (event.clientX - rect.left) / rect.width;
  const y = rect.height <= 0 ? 0.5 : (event.clientY - rect.top) / rect.height;

  if (mode === "landscape-right") {
    return {
      x: y,
      y: 1 - x,
    };
  }

  return {
    x,
    y,
  };
}

export function capturePointer(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  try {
    target.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture can fail in test DOMs and after some touch cancellations.
  }
}

export function releasePointer(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  try {
    target.releasePointerCapture(event.pointerId);
  } catch {
    // Matching the capture fallback above keeps cancellation paths quiet.
  }
}
