import { STICKER_SETS } from "./babyTouchStickerSets";
import { REDUCED_MOTION_LIFETIME_MS, STICKER_TRAVEL_SPEED_PX_PER_SECOND } from "./babyTouchTiming";
import type {
  BabyTouchPoint,
  BabyTouchScene,
  BabyTouchSettings,
  BabyTouchStageSize,
  BabyTouchSticker,
} from "./babyTouchTypes";
import { clamp, pick } from "./babyTouchUtils";

type BabyTouchStickerSet = (typeof STICKER_SETS)[number];

interface BabyTouchPixelPoint {
  readonly x: number;
  readonly y: number;
}

interface BabyTouchTravelVector {
  readonly travelX: number;
  readonly travelY: number;
}

const GENTLE_STICKER_SIZE_PX = 112;
const LIVELY_STICKER_SIZE_PX = 126;
const STICKER_EXIT_BUFFER_PX = 18;
const GENTLE_JITTER_DEGREES = 18;
const LIVELY_JITTER_DEGREES = 26;
const DIRECTION_EPSILON = 0.000001;

function resolveStickerSet(scene: BabyTouchScene): BabyTouchStickerSet {
  return STICKER_SETS.find((stickerSet) => stickerSet.scene === scene) ?? STICKER_SETS[0];
}

function normalizeStageSize(stageSize: BabyTouchStageSize): BabyTouchStageSize {
  return {
    width: Math.max(1, stageSize.width),
    height: Math.max(1, stageSize.height),
  };
}

function rotateVector(vector: BabyTouchPixelPoint, degrees: number): BabyTouchPixelPoint {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function normalizeVector(vector: BabyTouchPixelPoint): BabyTouchPixelPoint {
  const length = Math.hypot(vector.x, vector.y);

  if (length < DIRECTION_EPSILON) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function pickFarthestCorner(
  start: BabyTouchPixelPoint,
  stageSize: BabyTouchStageSize,
  random: () => number,
): BabyTouchPixelPoint {
  const corners: readonly BabyTouchPixelPoint[] = [
    { x: 0, y: 0 },
    { x: stageSize.width, y: 0 },
    { x: 0, y: stageSize.height },
    { x: stageSize.width, y: stageSize.height },
  ];
  const distances = corners.map((corner) => ({
    corner,
    distance: (corner.x - start.x) ** 2 + (corner.y - start.y) ** 2,
  }));
  const farthestDistance = Math.max(...distances.map((candidate) => candidate.distance));
  const farthest = distances
    .filter((candidate) => Math.abs(candidate.distance - farthestDistance) < DIRECTION_EPSILON)
    .map((candidate) => candidate.corner);

  if (farthest.length === 1) {
    return farthest[0]!;
  }

  return pick(farthest, random);
}

function intersectExpandedStage(
  start: BabyTouchPixelPoint,
  direction: BabyTouchPixelPoint,
  stageSize: BabyTouchStageSize,
  padding: number,
): BabyTouchPixelPoint {
  const minX = -padding;
  const minY = -padding;
  const maxX = stageSize.width + padding;
  const maxY = stageSize.height + padding;
  const intersections: number[] = [];

  if (direction.x > DIRECTION_EPSILON) {
    intersections.push((maxX - start.x) / direction.x);
  } else if (direction.x < -DIRECTION_EPSILON) {
    intersections.push((minX - start.x) / direction.x);
  }

  if (direction.y > DIRECTION_EPSILON) {
    intersections.push((maxY - start.y) / direction.y);
  } else if (direction.y < -DIRECTION_EPSILON) {
    intersections.push((minY - start.y) / direction.y);
  }

  const travelDistance =
    intersections.filter((distance) => distance > 0).sort((a, b) => a - b)[0] ?? 0;

  return {
    x: direction.x * travelDistance,
    y: direction.y * travelDistance,
  };
}

function computeStickerTravel(
  point: BabyTouchPoint,
  settings: BabyTouchSettings,
  stageSize: BabyTouchStageSize,
  scale: number,
  random: () => number,
  reducedMotion: boolean,
): BabyTouchTravelVector {
  if (reducedMotion) {
    return { travelX: 0, travelY: 0 };
  }

  const normalizedStageSize = normalizeStageSize(stageSize);
  const start = {
    x: clamp(point.x, 0, 1) * normalizedStageSize.width,
    y: clamp(point.y, 0, 1) * normalizedStageSize.height,
  };
  const farthestCorner = pickFarthestCorner(start, normalizedStageSize, random);
  const jitterDegrees =
    settings.intensity === "lively" ? LIVELY_JITTER_DEGREES : GENTLE_JITTER_DEGREES;
  const jitter = (random() * 2 - 1) * jitterDegrees;
  const direction = normalizeVector(
    rotateVector(
      {
        x: farthestCorner.x - start.x,
        y: farthestCorner.y - start.y,
      },
      jitter,
    ),
  );
  const baseSize =
    settings.intensity === "lively" ? LIVELY_STICKER_SIZE_PX : GENTLE_STICKER_SIZE_PX;
  const padding = (baseSize * scale) / 2 + STICKER_EXIT_BUFFER_PX;
  const travel = intersectExpandedStage(start, direction, normalizedStageSize, padding);

  return {
    travelX: Math.round(travel.x),
    travelY: Math.round(travel.y),
  };
}

function computeStickerLifetimeMs(travel: BabyTouchTravelVector, reducedMotion: boolean): number {
  if (reducedMotion) {
    return REDUCED_MOTION_LIFETIME_MS;
  }

  const travelDistance = Math.hypot(travel.travelX, travel.travelY);

  return Math.max(1, Math.round((travelDistance / STICKER_TRAVEL_SPEED_PX_PER_SECOND) * 1000));
}

export function createSticker(
  id: number,
  point: BabyTouchPoint,
  stageSize: BabyTouchStageSize,
  settings: BabyTouchSettings,
  random: () => number,
  reducedMotion: boolean,
): BabyTouchSticker {
  const stickerSet = resolveStickerSet(settings.scene);
  const x = clamp(point.x, 0, 1);
  const y = clamp(point.y, 0, 1);
  const kind = pick(stickerSet.kinds, random);
  const hue = Math.round(random() * 330);
  const spin = Math.round((random() - 0.5) * (settings.intensity === "lively" ? 34 : 18));
  const scale = Number(
    (0.92 + random() * (settings.intensity === "lively" ? 0.34 : 0.22)).toFixed(2),
  );
  const mirror = random() > 0.5;
  const travel = computeStickerTravel({ x, y }, settings, stageSize, scale, random, reducedMotion);
  const lifetimeMs = computeStickerLifetimeMs(travel, reducedMotion);

  return {
    id,
    x,
    y,
    ...travel,
    family: stickerSet.family,
    kind,
    hue,
    spin,
    scale,
    mirror,
    lifetimeMs,
  };
}
