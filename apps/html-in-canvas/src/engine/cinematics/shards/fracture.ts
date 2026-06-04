export interface HtmlInCanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface HtmlInCanvasShardPolygon {
  readonly id: string;
  readonly points: readonly HtmlInCanvasPoint[];
  readonly centroid: HtmlInCanvasPoint;
  readonly area: number;
  readonly bounds: HtmlInCanvasPolygonBounds;
  readonly seed: number;
}

interface HtmlInCanvasPolygonBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface HtmlInCanvasFractureOptions {
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
  readonly targetShardCount?: number;
  readonly maxShardCount?: number;
  readonly minShardAreaRatio?: number;
}

interface MutablePolygon {
  readonly points: readonly HtmlInCanvasPoint[];
  readonly area: number;
  readonly bounds: HtmlInCanvasPolygonBounds;
  readonly centroid: HtmlInCanvasPoint;
}

interface SplitLine {
  readonly origin: HtmlInCanvasPoint;
  readonly normal: HtmlInCanvasPoint;
}

const DEFAULT_SEED = 0x7a11_c0de;
const DEFAULT_MAX_SHARD_COUNT = 140;
const MIN_SPLIT_BALANCE = 0.18;
const MAX_SPLIT_ATTEMPTS = 40;
const MAX_GLOBAL_ATTEMPTS_MULTIPLIER = 18;
const EPSILON = 0.001;

export function defaultHtmlInCanvasShardCount(width: number, height: number): number {
  return clamp(Math.round((width * height) / 16_000), 48, DEFAULT_MAX_SHARD_COUNT);
}

export function createHtmlInCanvasShardPolygons({
  width,
  height,
  seed = DEFAULT_SEED,
  targetShardCount = defaultHtmlInCanvasShardCount(width, height),
  maxShardCount = DEFAULT_MAX_SHARD_COUNT,
  minShardAreaRatio = 0.0016,
}: HtmlInCanvasFractureOptions): readonly HtmlInCanvasShardPolygon[] {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const viewportArea = safeWidth * safeHeight;
  const minimumShardArea = Math.max(24, viewportArea * minShardAreaRatio);
  const desiredCount = clamp(Math.round(targetShardCount), 1, maxShardCount);
  const random = createSeededRandom(seed);
  const polygons: MutablePolygon[] = [
    normalizePolygon([
      { x: 0, y: 0 },
      { x: safeWidth, y: 0 },
      { x: safeWidth, y: safeHeight },
      { x: 0, y: safeHeight },
    ]),
  ];
  const maxGlobalAttempts = Math.max(
    MAX_SPLIT_ATTEMPTS,
    desiredCount * MAX_GLOBAL_ATTEMPTS_MULTIPLIER,
  );
  let attempts = 0;

  while (polygons.length < desiredCount && attempts < maxGlobalAttempts) {
    attempts++;
    const index = choosePolygonIndex(polygons, random);
    const polygon = polygons[index];
    if (polygon === undefined || polygon.area < minimumShardArea * 2.25) {
      continue;
    }

    const split = splitPolygon(polygon, random, minimumShardArea);
    if (split === null) {
      continue;
    }

    polygons.splice(index, 1, split[0], split[1]);
  }

  return polygons.map((polygon, index) => ({
    id: `shard-${index}`,
    points: polygon.points,
    centroid: polygon.centroid,
    area: polygon.area,
    bounds: polygon.bounds,
    seed: random(),
  }));
}

function polygonCentroid(points: readonly HtmlInCanvasPoint[]): HtmlInCanvasPoint {
  let crossSum = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const cross = current.x * next.y - next.x * current.y;
    crossSum += cross;
    x += (current.x + next.x) * cross;
    y += (current.y + next.y) * cross;
  }

  if (Math.abs(crossSum) < EPSILON) {
    const fallback = points.reduce(
      (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
      { x: 0, y: 0 },
    );
    return {
      x: fallback.x / Math.max(1, points.length),
      y: fallback.y / Math.max(1, points.length),
    };
  }

  const factor = 1 / (3 * crossSum);
  return { x: x * factor, y: y * factor };
}

function polygonBounds(points: readonly HtmlInCanvasPoint[]): HtmlInCanvasPolygonBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

function splitPolygon(
  polygon: MutablePolygon,
  random: () => number,
  minimumShardArea: number,
): readonly [MutablePolygon, MutablePolygon] | null {
  for (let attempt = 0; attempt < MAX_SPLIT_ATTEMPTS; attempt++) {
    const line = createSplitLine(polygon, random);
    const positive = clipPolygon(polygon.points, line, 1);
    const negative = clipPolygon(polygon.points, line, -1);

    if (positive.length < 3 || negative.length < 3) {
      continue;
    }

    const first = normalizePolygon(positive);
    const second = normalizePolygon(negative);
    const smallerArea = Math.min(first.area, second.area);
    const balance = smallerArea / polygon.area;

    if (smallerArea < minimumShardArea || balance < MIN_SPLIT_BALANCE) {
      continue;
    }

    return [first, second];
  }

  return null;
}

function createSplitLine(polygon: MutablePolygon, random: () => number): SplitLine {
  const angle = random() * Math.PI;
  const boundsWidth = Math.max(1, polygon.bounds.maxX - polygon.bounds.minX);
  const boundsHeight = Math.max(1, polygon.bounds.maxY - polygon.bounds.minY);
  const jitter = (random() - 0.5) * Math.min(boundsWidth, boundsHeight) * 0.42;

  return {
    origin: {
      x: polygon.centroid.x + Math.cos(angle + Math.PI / 2) * jitter,
      y: polygon.centroid.y + Math.sin(angle + Math.PI / 2) * jitter,
    },
    normal: {
      x: Math.cos(angle),
      y: Math.sin(angle),
    },
  };
}

function clipPolygon(
  points: readonly HtmlInCanvasPoint[],
  line: SplitLine,
  side: 1 | -1,
): readonly HtmlInCanvasPoint[] {
  const clipped: HtmlInCanvasPoint[] = [];

  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const currentDistance = signedDistance(current, line) * side;
    const nextDistance = signedDistance(next, line) * side;
    const currentInside = currentDistance >= -EPSILON;
    const nextInside = nextDistance >= -EPSILON;

    if (currentInside && nextInside) {
      clipped.push(next);
      continue;
    }

    if (currentInside && !nextInside) {
      clipped.push(intersectionPoint(current, next, currentDistance, nextDistance));
      continue;
    }

    if (!currentInside && nextInside) {
      clipped.push(intersectionPoint(current, next, currentDistance, nextDistance), next);
    }
  }

  return dedupeAdjacentPoints(clipped);
}

function intersectionPoint(
  current: HtmlInCanvasPoint,
  next: HtmlInCanvasPoint,
  currentDistance: number,
  nextDistance: number,
): HtmlInCanvasPoint {
  const denominator = currentDistance - nextDistance;
  const t = Math.abs(denominator) < EPSILON ? 0.5 : currentDistance / denominator;

  return {
    x: current.x + (next.x - current.x) * t,
    y: current.y + (next.y - current.y) * t,
  };
}

function signedDistance(point: HtmlInCanvasPoint, line: SplitLine): number {
  return (point.x - line.origin.x) * line.normal.x + (point.y - line.origin.y) * line.normal.y;
}

function choosePolygonIndex(polygons: readonly MutablePolygon[], random: () => number): number {
  const totalWeight = polygons.reduce((sum, polygon) => sum + polygon.area * polygon.area, 0);
  let cursor = random() * totalWeight;

  for (let index = 0; index < polygons.length; index++) {
    const weight = polygons[index]!.area * polygons[index]!.area;
    cursor -= weight;
    if (cursor <= 0) {
      return index;
    }
  }

  return polygons.length - 1;
}

function normalizePolygon(points: readonly HtmlInCanvasPoint[]): MutablePolygon {
  const cleanPoints = dedupeAdjacentPoints(points);
  const signedArea = signedPolygonArea(cleanPoints);
  const normalizedPoints = signedArea < 0 ? [...cleanPoints].reverse() : cleanPoints;

  return {
    points: normalizedPoints,
    area: Math.abs(signedArea),
    bounds: polygonBounds(normalizedPoints),
    centroid: polygonCentroid(normalizedPoints),
  };
}

function signedPolygonArea(points: readonly HtmlInCanvasPoint[]): number {
  let sum = 0;

  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    sum += current.x * next.y - next.x * current.y;
  }

  return sum / 2;
}

function dedupeAdjacentPoints(points: readonly HtmlInCanvasPoint[]): readonly HtmlInCanvasPoint[] {
  const deduped: HtmlInCanvasPoint[] = [];

  for (const point of points) {
    const previous = deduped.at(-1);
    if (
      previous !== undefined &&
      Math.abs(previous.x - point.x) < EPSILON &&
      Math.abs(previous.y - point.y) < EPSILON
    ) {
      continue;
    }
    deduped.push(point);
  }

  const first = deduped[0];
  const last = deduped.at(-1);
  if (
    first !== undefined &&
    last !== undefined &&
    deduped.length > 1 &&
    Math.abs(first.x - last.x) < EPSILON &&
    Math.abs(first.y - last.y) < EPSILON
  ) {
    deduped.pop();
  }

  return deduped;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
