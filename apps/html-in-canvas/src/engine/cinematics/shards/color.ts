import type { HtmlInCanvasPoint, HtmlInCanvasShardPolygon } from "./fracture";
import { clamp, distanceBetween } from "./math";
import type { HtmlInCanvasSampledColor } from "./types";

export interface HtmlInCanvasShardColorSampler {
  sample(polygon: HtmlInCanvasShardPolygon): HtmlInCanvasSampledColor;
}

export function createHtmlInCanvasShardColorSampler(
  image: HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
): HtmlInCanvasShardColorSampler {
  const canvas = document.createElement("canvas");
  const sampleWidth = Math.max(1, Math.round(Math.min(112, sourceWidth)));
  const sampleHeight = Math.max(1, Math.round((sampleWidth / sourceWidth) * sourceHeight));
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    return {
      sample() {
        return { r: 0.78, g: 0.9, b: 1 };
      },
    };
  }

  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const scaleX = sampleWidth / sourceWidth;
  const scaleY = sampleHeight / sourceHeight;

  return {
    sample(polygon) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      const minX = Math.max(0, Math.floor(polygon.bounds.minX * scaleX));
      const maxX = Math.min(sampleWidth - 1, Math.ceil(polygon.bounds.maxX * scaleX));
      const minY = Math.max(0, Math.floor(polygon.bounds.minY * scaleY));
      const maxY = Math.min(sampleHeight - 1, Math.ceil(polygon.bounds.maxY * scaleY));
      const stepX = Math.max(1, Math.floor((maxX - minX + 1) / 5));
      const stepY = Math.max(1, Math.floor((maxY - minY + 1) / 5));

      for (let y = minY; y <= maxY; y += stepY) {
        for (let x = minX; x <= maxX; x += stepX) {
          const sourcePoint = { x: (x + 0.5) / scaleX, y: (y + 0.5) / scaleY };
          if (!pointInPolygon(sourcePoint, polygon.points)) {
            continue;
          }

          const offset = (y * sampleWidth + x) * 4;
          r += data[offset] ?? 0;
          g += data[offset + 1] ?? 0;
          b += data[offset + 2] ?? 0;
          count++;
        }
      }

      if (count === 0) {
        const x = clamp(Math.round(polygon.centroid.x * scaleX), 0, sampleWidth - 1);
        const y = clamp(Math.round(polygon.centroid.y * scaleY), 0, sampleHeight - 1);
        const offset = (y * sampleWidth + x) * 4;
        return {
          r: (data[offset] ?? 200) / 255,
          g: (data[offset + 1] ?? 220) / 255,
          b: (data[offset + 2] ?? 255) / 255,
        };
      }

      return { r: r / count / 255, g: g / count / 255, b: b / count / 255 };
    },
  };
}

export function nearestHtmlInCanvasShardNeighborColor(
  index: number,
  polygons: readonly HtmlInCanvasShardPolygon[],
  colors: readonly HtmlInCanvasSampledColor[],
): HtmlInCanvasSampledColor {
  const polygon = polygons[index]!;
  const neighbors = polygons
    .map((candidate, candidateIndex) => ({
      index: candidateIndex,
      distance:
        candidateIndex === index
          ? Number.POSITIVE_INFINITY
          : distanceBetween(polygon.centroid, candidate.centroid),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);
  let r = colors[index]!.r;
  let g = colors[index]!.g;
  let b = colors[index]!.b;
  let count = 1;

  for (const neighbor of neighbors) {
    const color = colors[neighbor.index];
    if (color === undefined) {
      continue;
    }
    r += color.r;
    g += color.g;
    b += color.b;
    count++;
  }

  return { r: r / count, g: g / count, b: b / count };
}

function pointInPolygon(point: HtmlInCanvasPoint, points: readonly HtmlInCanvasPoint[]): boolean {
  let inside = false;

  for (
    let current = 0, previous = points.length - 1;
    current < points.length;
    previous = current++
  ) {
    const a = points[current]!;
    const b = points[previous]!;
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}
