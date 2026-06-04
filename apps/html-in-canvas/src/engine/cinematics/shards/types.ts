import type { ThreeLoader } from "../../rendering/three";
import type {
  HtmlInCanvasSnapshot,
  HtmlInCanvasTransitionOrigin,
  HtmlInCanvasTransitionPhase,
} from "../../transition/transitionController";
import type { HtmlInCanvasPoint } from "./fracture";

export interface HtmlInCanvasShardOverlayConfig {
  readonly seed: number;
  readonly targetShardCount?: number;
  readonly maxShardCount: number;
  readonly crackDurationMs: number;
  readonly floatDurationMs: number;
  readonly floatWaitTimeoutMs: number;
  readonly dropDurationMs: number;
  readonly maxPixelRatio: number;
  readonly minShardAreaRatio: number;
}

export interface HtmlInCanvasShardOverlayRunnerOptions {
  readonly reducedMotion: boolean;
  readonly debugStepCrack?: boolean;
  readonly documentRef: Document;
  readonly windowRef: Window;
  readonly waitForFrame: () => Promise<void>;
  readonly setPhase: (phase: HtmlInCanvasTransitionPhase) => void;
  readonly signal: AbortSignal;
  readonly origin: HtmlInCanvasTransitionOrigin;
  readonly loadThreeModule?: ThreeLoader;
  readonly config?: Partial<HtmlInCanvasShardOverlayConfig>;
  readonly createRenderer?: HtmlInCanvasShardRendererFactory;
}

export interface HtmlInCanvasShardRenderer {
  readonly canvas: HTMLCanvasElement;
  renderCover(): void;
  renderCrack(progress: number, timestamp: number): void;
  renderFloat(progress: number, timestamp: number): void;
  renderWaiting(timestamp: number): void;
  renderDrop(progress: number, timestamp: number): void;
  renderReduced(progress: number): void;
  setDropOrigin(origin: HtmlInCanvasTransitionOrigin): void;
  dispose(): void;
}

type HtmlInCanvasShardRendererFactory = (
  snapshot: HtmlInCanvasSnapshot,
  options: HtmlInCanvasShardOverlayRunnerOptions,
) => Promise<HtmlInCanvasShardRenderer>;

export interface HtmlInCanvasVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface HtmlInCanvasSampledColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface HtmlInCanvasCrackVisualInput {
  readonly activation: number;
  readonly originHeat: number;
  readonly seed: number;
  readonly progress: number;
  readonly timestamp: number;
  readonly waiting: boolean;
}

export interface HtmlInCanvasCrackVisualState {
  readonly coreOpacity: number;
  readonly glowOpacity: number;
  readonly bloomOpacity: number;
  readonly shimmerOpacity: number;
}

export interface HtmlInCanvasShardFloatInput {
  readonly activation: number;
  readonly progress: number;
}

export interface HtmlInCanvasOverlayViewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface HtmlInCanvasPointerWake {
  readonly position: HtmlInCanvasVector3;
  readonly intensity: number;
  readonly velocity: number;
}

export interface HtmlInCanvasShardPointerReactionInput {
  readonly shardPosition: HtmlInCanvasVector3;
  readonly pointer: HtmlInCanvasPointerWake | null;
}

export interface HtmlInCanvasShardPointerReaction {
  readonly position: HtmlInCanvasVector3;
  readonly rotation: HtmlInCanvasVector3;
  readonly glowBoost: number;
}

export interface HtmlInCanvasCrackPointerWakeInput {
  readonly crackPosition: HtmlInCanvasVector3;
  readonly pointer: HtmlInCanvasPointerWake | null;
}

export interface HtmlInCanvasShardReflectionColorInput {
  readonly ownColor: HtmlInCanvasSampledColor;
  readonly neighborColor: HtmlInCanvasSampledColor;
  readonly point: HtmlInCanvasPoint;
  readonly width: number;
  readonly height: number;
}

export interface HtmlInCanvasShardDropMotionInput {
  readonly start: HtmlInCanvasVector3;
  readonly target: HtmlInCanvasVector3;
  readonly momentum: HtmlInCanvasVector3;
  readonly progress: number;
}

export interface HtmlInCanvasShardDropProgressInput {
  readonly delay: number;
  readonly duration?: number;
  readonly progress: number;
}

export interface HtmlInCanvasShardDropTailProgressInput {
  readonly delay: number;
  readonly duration: number;
  readonly progress: number;
}

export interface HtmlInCanvasShardDropMaxDelayInput {
  readonly dropDurationMs: number;
}
