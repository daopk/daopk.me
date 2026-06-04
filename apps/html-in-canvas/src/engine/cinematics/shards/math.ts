import type { HtmlInCanvasPoint } from "./fracture";
import type { HtmlInCanvasSampledColor, HtmlInCanvasVector3 } from "./types";

export function easeOutCubic(value: number): number {
  const inverse = 1 - value;
  return 1 - inverse * inverse * inverse;
}

export function easeInCubic(value: number): number {
  return value * value * value;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function normalizeVector(vector: HtmlInCanvasVector3): HtmlInCanvasVector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length < 0.001) {
    return { x: 0, y: -1, z: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

export function clampVectorLength(
  vector: HtmlInCanvasVector3,
  maxLength: number,
): HtmlInCanvasVector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length <= maxLength || length < 0.001) {
    return vector;
  }

  const scale = maxLength / length;

  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale,
  };
}

export function distanceBetween(a: HtmlInCanvasPoint, b: HtmlInCanvasPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function mixColor(
  a: HtmlInCanvasSampledColor,
  b: HtmlInCanvasSampledColor,
  amount: number,
): HtmlInCanvasSampledColor {
  return {
    r: lerp(a.r, b.r, amount),
    g: lerp(a.g, b.g, amount),
    b: lerp(a.b, b.b, amount),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
