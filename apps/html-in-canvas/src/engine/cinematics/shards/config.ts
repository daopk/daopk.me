import type { HtmlInCanvasSampledColor, HtmlInCanvasShardOverlayConfig } from "./types";

export const DEFAULT_CONFIG: HtmlInCanvasShardOverlayConfig = {
  seed: 0x51a7_c0de,
  maxShardCount: 140,
  crackDurationMs: 1500,
  floatDurationMs: 1900,
  floatWaitTimeoutMs: 10_000,
  dropDurationMs: 2200,
  maxPixelRatio: 2,
  minShardAreaRatio: 0.0016,
};

export const REDUCED_DURATION_MS = 180;
export const CAMERA_FOV_DEGREES = 45;
export const CRACK_Z_PX = 8;
export const CRACK_BACKPLATE_FADE_END_PROGRESS = 0.075;
export const CRACK_BLOOM_WIDTH_PX = 13;
export const CRACK_CORE_LINE_WIDTH = 1.35;
export const CRACK_GLOW_WIDTH_PX = 4.6;
export const CRACK_STEP_PROGRESS = 0.05;
export const SHARD_BLEED_PX = 1.5;
export const SHARD_DROP_CRACK_GLOW_MULTIPLIER = 0.72;
export const SHARD_DROP_EDGE_GLOW_BOOST = 0.72;
export const SHARD_DROP_MAX_DELAY_MS = 1000;
export const SHARD_DROP_MAX_DELAY_PROGRESS_CAP = 0.5;
export const SHARD_DROP_MAX_MOMENTUM_PX = 180;
export const SHARD_DROP_MAX_ROTATION_MOMENTUM_RAD = 0.72;
export const SHARD_DROP_MOMENTUM_MS = 420;
export const SHARD_DROP_TAIL_ROTATION_RAD = 0.72;
export const SHARD_EDGE_EMISSIVE_BASE = 0.18;
export const SHARD_EDGE_POINTER_EMISSIVE_BOOST = 0.64;
export const SHARD_FLOAT_EDGE_OPACITY = 0.74;
export const SHARD_FLOAT_LAG_PROGRESS = 0.3;
export const SHARD_FLOAT_FRONT_OPACITY = 0.8;
export const SHARD_FLOAT_REFLECTION_OPACITY = 0.09;
export const SHARD_FLOAT_SPAN_PROGRESS = 1;
export const SHARD_POINTER_CRACK_RADIUS_PX = 164;
export const SHARD_POINTER_FADE_END_MS = 1800;
export const SHARD_POINTER_FADE_START_MS = 420;
export const SHARD_POINTER_LEAVE_AGE_MS = 820;
export const SHARD_POINTER_LIFT_PX = 34;
export const SHARD_POINTER_RADIUS_PX = 188;
export const SHARD_POINTER_REPEL_PX = 34;
export const SHARD_POINTER_SMOOTH_MS = 96;
export const SHARD_POINTER_TILT_RAD = 0.13;
export const SHARD_POINTER_VELOCITY_FOR_FULL_WAKE = 1.35;
export const SHARD_REFLECTION_POINTER_BOOST_OPACITY = 0.08;
export const SHARD_THICKNESS_PX = 6;
export const HTML_IN_CANVAS_REFLECTION_COLORS: readonly HtmlInCanvasSampledColor[] = [
  { r: 0.49, g: 0.91, b: 0.86 },
  { r: 0.72, g: 0.58, b: 1 },
  { r: 1, g: 0.95, b: 0.8 },
];
