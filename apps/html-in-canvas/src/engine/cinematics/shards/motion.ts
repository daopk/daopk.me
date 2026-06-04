import {
  SHARD_DROP_MAX_DELAY_MS,
  SHARD_DROP_MAX_DELAY_PROGRESS_CAP,
  SHARD_FLOAT_LAG_PROGRESS,
  SHARD_FLOAT_SPAN_PROGRESS,
  SHARD_POINTER_CRACK_RADIUS_PX,
  SHARD_POINTER_FADE_END_MS,
  SHARD_POINTER_FADE_START_MS,
  SHARD_POINTER_LIFT_PX,
  SHARD_POINTER_RADIUS_PX,
  SHARD_POINTER_REPEL_PX,
  SHARD_POINTER_TILT_RAD,
} from "./config";
import { clamp, easeInCubic, lerp, normalizeVector, smoothstep } from "./math";
import type {
  HtmlInCanvasCrackPointerWakeInput,
  HtmlInCanvasPointerWake,
  HtmlInCanvasShardDropMaxDelayInput,
  HtmlInCanvasShardDropMotionInput,
  HtmlInCanvasShardDropProgressInput,
  HtmlInCanvasShardDropTailProgressInput,
  HtmlInCanvasShardFloatInput,
  HtmlInCanvasShardPointerReaction,
  HtmlInCanvasShardPointerReactionInput,
  HtmlInCanvasVector3,
} from "./types";

export function resolveHtmlInCanvasPointerWakeIntensity(ageMs: number, velocity: number): number {
  const fade = 1 - smoothstep(SHARD_POINTER_FADE_START_MS, SHARD_POINTER_FADE_END_MS, ageMs);
  const velocityBoost = 0.78 + clamp(velocity, 0, 1) * 0.22;

  return clamp(fade * velocityBoost, 0, 1);
}

export function resolveHtmlInCanvasShardPointerReaction({
  shardPosition,
  pointer,
}: HtmlInCanvasShardPointerReactionInput): HtmlInCanvasShardPointerReaction {
  const influence = resolveHtmlInCanvasPointerDistanceInfluence(
    shardPosition,
    pointer,
    SHARD_POINTER_RADIUS_PX,
  );

  if (influence <= 0.001 || pointer === null) {
    return emptyHtmlInCanvasShardPointerReaction();
  }

  const dx = shardPosition.x - pointer.position.x;
  const dy = shardPosition.y - pointer.position.y;
  const distance = Math.hypot(dx, dy);
  const direction =
    distance < 0.001
      ? normalizeVector({ x: shardPosition.x, y: shardPosition.y, z: 0 })
      : { x: dx / distance, y: dy / distance, z: 0 };
  const velocityLift = 0.76 + pointer.velocity * 0.24;
  const velocityPush = 0.82 + pointer.velocity * 0.18;
  const glowBoost = clamp(influence * (0.72 + pointer.velocity * 0.28), 0, 1);

  return {
    position: {
      x: direction.x * SHARD_POINTER_REPEL_PX * influence * velocityPush,
      y: direction.y * SHARD_POINTER_REPEL_PX * influence * velocityPush,
      z: SHARD_POINTER_LIFT_PX * influence * velocityLift,
    },
    rotation: {
      x: -direction.y * SHARD_POINTER_TILT_RAD * influence,
      y: direction.x * SHARD_POINTER_TILT_RAD * influence,
      z: (direction.x - direction.y) * SHARD_POINTER_TILT_RAD * influence * 0.28,
    },
    glowBoost,
  };
}

export function resolveHtmlInCanvasCrackPointerWake({
  crackPosition,
  pointer,
}: HtmlInCanvasCrackPointerWakeInput): number {
  const influence = resolveHtmlInCanvasPointerDistanceInfluence(
    crackPosition,
    pointer,
    SHARD_POINTER_CRACK_RADIUS_PX,
  );

  if (pointer === null) {
    return 0;
  }

  return clamp(influence * (0.62 + pointer.velocity * 0.38), 0, 1);
}

export function resolveHtmlInCanvasShardFloatProgress({
  activation,
  progress,
}: HtmlInCanvasShardFloatInput): number {
  if (progress >= 1) {
    return 1;
  }

  const remaining = Math.max(0, 1 - activation);
  const lag = Math.min(SHARD_FLOAT_LAG_PROGRESS, remaining * 0.35);
  const start = activation + lag;
  const span = Math.min(SHARD_FLOAT_SPAN_PROGRESS, Math.max(0.001, 1 - start));
  const end = start + span;

  if (progress <= start) {
    return 0;
  }

  if (end <= start + 0.001) {
    return 1;
  }

  return smoothstep(start, end, progress);
}

export function resolveHtmlInCanvasShardHoverBlend(floatProgress: number): number {
  return smoothstep(0.82, 1, floatProgress);
}

export function resolveHtmlInCanvasShardDropProgress({
  delay,
  duration = 1 - delay,
  progress,
}: HtmlInCanvasShardDropProgressInput): number {
  if (progress <= delay) {
    return 0;
  }

  if (delay >= 1) {
    return 1;
  }

  return clamp((progress - delay) / Math.max(0.001, duration), 0, 1);
}

export function resolveHtmlInCanvasShardDropTailProgress({
  delay,
  duration,
  progress,
}: HtmlInCanvasShardDropTailProgressInput): number {
  const tailStart = delay + duration;

  if (progress <= tailStart) {
    return 0;
  }

  return clamp((progress - tailStart) / Math.max(0.001, 1 - tailStart), 0, 1);
}

export function resolveHtmlInCanvasShardDropMaxDelayProgress({
  dropDurationMs,
}: HtmlInCanvasShardDropMaxDelayInput): number {
  return clamp(
    SHARD_DROP_MAX_DELAY_MS / Math.max(1, dropDurationMs),
    0,
    SHARD_DROP_MAX_DELAY_PROGRESS_CAP,
  );
}

export function resolveHtmlInCanvasShardDropMotion({
  start,
  target,
  momentum,
  progress,
}: HtmlInCanvasShardDropMotionInput): HtmlInCanvasVector3 {
  const eased = easeInCubic(progress);
  const momentumCarry = progress * (1 - progress) * (1 - progress);

  return {
    x: lerp(start.x, target.x, eased) + momentum.x * momentumCarry,
    y: lerp(start.y, target.y, eased) + momentum.y * momentumCarry,
    z: lerp(start.z, target.z, eased) + momentum.z * momentumCarry,
  };
}

function resolveHtmlInCanvasPointerDistanceInfluence(
  position: HtmlInCanvasVector3,
  pointer: HtmlInCanvasPointerWake | null,
  radius: number,
): number {
  if (pointer === null) {
    return 0;
  }

  const distance = Math.hypot(position.x - pointer.position.x, position.y - pointer.position.y);

  return smoothstep(radius, 0, distance) * pointer.intensity;
}

function emptyHtmlInCanvasShardPointerReaction(): HtmlInCanvasShardPointerReaction {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    glowBoost: 0,
  };
}
