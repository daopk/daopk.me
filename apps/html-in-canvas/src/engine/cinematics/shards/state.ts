import type {
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Renderer,
  Scene,
  Texture,
} from "three/webgpu";

import type { HtmlInCanvasPoint } from "./fracture";
import type { HtmlInCanvasVector3 } from "./types";

export type HtmlInCanvasShardVector3 = HtmlInCanvasVector3;

export interface MutableVector3 {
  x: number;
  y: number;
  z: number;
}

export interface ShardState {
  readonly mesh: Mesh;
  readonly frontMaterial: MeshBasicMaterial;
  readonly edgeMaterial: MeshStandardMaterial;
  readonly reflectionMaterial: MeshBasicMaterial;
  readonly activation: number;
  readonly home: HtmlInCanvasShardVector3;
  readonly floatTarget: HtmlInCanvasShardVector3;
  readonly dropTarget: HtmlInCanvasShardVector3;
  readonly dropExitTarget: HtmlInCanvasShardVector3;
  readonly floatRotation: HtmlInCanvasShardVector3;
  readonly dropRotation: HtmlInCanvasShardVector3;
  readonly floatSeed: number;
  readonly motionVelocity: MutableVector3;
  readonly motionRotationVelocity: MutableVector3;
  dropMomentum: MutableVector3;
  dropRotationMomentum: MutableVector3;
  dropDurationProgress: number;
  dropDelayProgress: number;
  dropStart: MutableVector3 | null;
  dropStartRotation: MutableVector3 | null;
  motionLastAt: number | null;
  reflectionBaseOpacity: number;
}

export interface CrackState {
  readonly shard: ShardState;
  readonly localMidpoint: HtmlInCanvasShardVector3;
  readonly core: LineSegments;
  readonly glow: Mesh;
  readonly bloom: Mesh;
  readonly shimmer: LineSegments | null;
  readonly coreMaterial: LineBasicMaterial;
  readonly glowMaterial: MeshBasicMaterial;
  readonly bloomMaterial: MeshBasicMaterial;
  readonly shimmerMaterial: LineBasicMaterial | null;
  readonly activation: number;
  readonly originHeat: number;
  readonly seed: number;
}

export interface PointerWakeState {
  current: MutableVector3 | null;
  target: MutableVector3 | null;
  lastFrameAt: number | null;
  lastMovedAt: number;
  velocity: number;
}

export interface HtmlInCanvasActivationContext {
  readonly source: HtmlInCanvasPoint;
  readonly maxDistance: number;
}

export interface RendererState {
  readonly renderer: Renderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly root: Object3D;
  readonly pointerWake: PointerWakeState;
  readonly texture: Texture;
  readonly backplate: Mesh;
  readonly backplateMaterial: MeshBasicMaterial;
  readonly shards: readonly ShardState[];
  readonly cracks: readonly CrackState[];
  readonly geometries: readonly BufferGeometry[];
  readonly materials: readonly Material[];
}
