import type { HtmlInCanvasSnapshot } from "../../transition/transitionController";
import {
  CRACK_BACKPLATE_FADE_END_PROGRESS,
  DEFAULT_CONFIG,
  HTML_IN_CANVAS_REFLECTION_COLORS,
} from "./config";
import { clamp, mixColor, smoothstep } from "./math";
import type {
  HtmlInCanvasCrackVisualInput,
  HtmlInCanvasCrackVisualState,
  HtmlInCanvasOverlayViewport,
  HtmlInCanvasSampledColor,
  HtmlInCanvasShardOverlayConfig,
  HtmlInCanvasShardReflectionColorInput,
} from "./types";

export function resolveHtmlInCanvasCrackVisual({
  activation,
  originHeat,
  seed,
  progress,
  timestamp,
  waiting,
}: HtmlInCanvasCrackVisualInput): HtmlInCanvasCrackVisualState {
  const arrival = smoothstep(activation - 0.035, activation + 0.075, progress);
  const distanceBalance = 0.99 + originHeat * 0.01;
  const pulse = 0.94 + Math.sin(timestamp * 0.007 + seed * Math.PI * 2) * 0.06;
  const shimmerPulse = Math.max(0, Math.sin(timestamp * 0.013 + seed * Math.PI * 11));
  const waitBoost = waiting ? 0.12 : 0;
  const coreOpacity = clamp(arrival * distanceBalance * (0.48 + pulse * 0.12 + waitBoost), 0, 1);
  const glowOpacity = clamp(
    arrival * distanceBalance * (0.24 + pulse * 0.06 + waitBoost * 0.42),
    0,
    0.76,
  );
  const bloomOpacity = clamp(arrival * distanceBalance * (0.095 + shimmerPulse * 0.025), 0, 0.42);
  const shimmerOpacity = clamp(arrival * shimmerPulse * 0.24, 0, 0.72);

  return {
    coreOpacity,
    glowOpacity,
    bloomOpacity,
    shimmerOpacity,
  };
}

export function resolveHtmlInCanvasCrackBackplateOpacity(progress: number): number {
  return 1 - smoothstep(0, CRACK_BACKPLATE_FADE_END_PROGRESS, progress);
}

export function resolveHtmlInCanvasOverlayViewport(
  snapshot: HtmlInCanvasSnapshot,
  config: HtmlInCanvasShardOverlayConfig = DEFAULT_CONFIG,
): HtmlInCanvasOverlayViewport {
  return {
    width: Math.max(1, Math.floor(snapshot.width)),
    height: Math.max(1, Math.floor(snapshot.height)),
    pixelRatio: Math.min(Math.max(1, snapshot.pixelRatio), config.maxPixelRatio),
  };
}

export function resolveHtmlInCanvasShardEdgeOpacity(floatProgress: number): number {
  return smoothstep(0, 0.18, floatProgress) * 0.96;
}

export function resolveHtmlInCanvasShardReflectionColor({
  ownColor,
  neighborColor,
  point,
  width,
  height,
}: HtmlInCanvasShardReflectionColorInput): HtmlInCanvasSampledColor {
  const sourceColor = mixColor(ownColor, neighborColor, 0.54);
  const x = clamp(point.x / Math.max(1, width), 0, 1);
  const y = clamp(point.y / Math.max(1, height), 0, 1);
  const portalColor = mixColor(
    HTML_IN_CANVAS_REFLECTION_COLORS[0]!,
    HTML_IN_CANVAS_REFLECTION_COLORS[1]!,
    smoothstep(0.18, 0.82, x),
  );
  const warmReflection = mixColor(
    portalColor,
    HTML_IN_CANVAS_REFLECTION_COLORS[2]!,
    smoothstep(0.48, 0.92, y) * 0.42,
  );

  return mixColor(sourceColor, warmReflection, 0.34);
}
