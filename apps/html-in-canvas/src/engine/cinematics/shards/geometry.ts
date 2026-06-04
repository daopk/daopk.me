import type { BufferGeometry } from "three/webgpu";

import type { ThreeModule } from "../../rendering/three";
import type { HtmlInCanvasPoint, HtmlInCanvasShardPolygon } from "./fracture";
import { CRACK_Z_PX, SHARD_BLEED_PX, SHARD_THICKNESS_PX } from "./config";
import type { HtmlInCanvasVector3 } from "./types";

export function createHtmlInCanvasShardGeometry(
  THREE: ThreeModule,
  polygon: HtmlInCanvasShardPolygon,
  width: number,
  height: number,
): BufferGeometry {
  const points = polygon.points;
  const displayPoints = points.map((point) => bleedHtmlInCanvasShardPoint(point, polygon));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const frontZ = 0;
  const backZ = -SHARD_THICKNESS_PX;

  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    const displayPoint = displayPoints[index]!;
    positions.push(
      displayPoint.x - polygon.centroid.x,
      polygon.centroid.y - displayPoint.y,
      frontZ,
    );
    uvs.push(point.x / width, 1 - point.y / height);
  }

  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    const displayPoint = displayPoints[index]!;
    positions.push(displayPoint.x - polygon.centroid.x, polygon.centroid.y - displayPoint.y, backZ);
    uvs.push(point.x / width, 1 - point.y / height);
  }

  const frontStart = indices.length;
  for (let index = 1; index < points.length - 1; index++) {
    // The source polygon is screen-space y-down; after flipping y into world-space,
    // front triangles need reversed winding so screenshot faces are not culled.
    indices.push(0, index + 1, index);
  }
  const frontCount = indices.length - frontStart;

  const backStart = indices.length;
  const offset = points.length;
  for (let index = 1; index < points.length - 1; index++) {
    indices.push(offset, offset + index, offset + index + 1);
  }
  const backCount = indices.length - backStart;

  const sideStart = indices.length;
  for (let index = 0; index < points.length; index++) {
    const next = (index + 1) % points.length;
    indices.push(index, next, offset + next, index, offset + next, offset + index);
  }
  const sideCount = indices.length - sideStart;
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(frontStart, frontCount, 0);
  geometry.addGroup(backStart, backCount, 1);
  geometry.addGroup(sideStart, sideCount, 1);
  geometry.addGroup(frontStart, frontCount, 2);
  geometry.computeVertexNormals();

  return geometry;
}

export function localHtmlInCanvasShardCrackPoint(
  point: HtmlInCanvasPoint,
  polygon: HtmlInCanvasShardPolygon,
): { readonly x: number; readonly y: number; readonly z: number } {
  return {
    x: point.x - polygon.centroid.x,
    y: polygon.centroid.y - point.y,
    z: CRACK_Z_PX,
  };
}

export function createHtmlInCanvasCrackRibbonGeometry(
  THREE: ThreeModule,
  start: HtmlInCanvasVector3,
  end: HtmlInCanvasVector3,
  width: number,
  z: number,
): BufferGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = (-dy / length) * width * 0.5;
  const ny = (dx / length) * width * 0.5;
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        start.x + nx,
        start.y + ny,
        z,
        end.x + nx,
        end.y + ny,
        z,
        end.x - nx,
        end.y - ny,
        z,
        start.x - nx,
        start.y - ny,
        z,
      ],
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  return geometry;
}

function bleedHtmlInCanvasShardPoint(
  point: HtmlInCanvasPoint,
  polygon: HtmlInCanvasShardPolygon,
): HtmlInCanvasPoint {
  const dx = point.x - polygon.centroid.x;
  const dy = point.y - polygon.centroid.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.001) {
    return point;
  }

  return {
    x: point.x + (dx / length) * SHARD_BLEED_PX,
    y: point.y + (dy / length) * SHARD_BLEED_PX,
  };
}
