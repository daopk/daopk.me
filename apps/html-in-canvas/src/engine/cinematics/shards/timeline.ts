import { loadThree, type ThreeLoader } from "../../rendering/three";
import type {
  HtmlInCanvasSnapshot,
  HtmlInCanvasTransitionOrigin,
} from "../../transition/transitionController";
import {
  CAMERA_FOV_DEGREES,
  CRACK_STEP_PROGRESS,
  DEFAULT_CONFIG,
  REDUCED_DURATION_MS,
} from "./config";
import { clamp } from "./math";
import { createHtmlInCanvasShardRenderer } from "./renderer";
import type {
  HtmlInCanvasShardOverlayConfig,
  HtmlInCanvasShardOverlayRunnerOptions,
  HtmlInCanvasShardRenderer,
} from "./types";

let preloadPromise: Promise<void> | null = null;

export async function runHtmlInCanvasShardOverlay(
  snapshot: HtmlInCanvasSnapshot,
  revealDesktop: () => void | Promise<void>,
  options: HtmlInCanvasShardOverlayRunnerOptions,
): Promise<void> {
  const renderer = await (options.createRenderer ?? createHtmlInCanvasShardRenderer)(
    snapshot,
    options,
  );

  try {
    throwIfAborted(options.signal);
    options.setPhase("covering");
    renderer.renderCover();
    await options.waitForFrame();
    throwIfAborted(options.signal);

    if (options.reducedMotion) {
      await revealDesktop();
      await options.waitForFrame();
      throwIfAborted(options.signal);

      options.setPhase("floating");
      await animateRenderer(options, REDUCED_DURATION_MS, (progress) => {
        renderer.renderReduced(progress);
      });
      return;
    }

    const config = resolvedConfig(options);

    await revealDesktop();
    await options.waitForFrame();
    throwIfAborted(options.signal);

    options.setPhase("cracking");
    renderer.renderCrack(0, options.windowRef.performance.now());
    await options.waitForFrame();
    throwIfAborted(options.signal);

    if (options.debugStepCrack === true) {
      await stepCrackRenderer(renderer, options);
    } else {
      await animateRenderer(options, config.crackDurationMs, (progress, timestamp) => {
        renderer.renderCrack(progress, timestamp);
      });
    }

    options.setPhase("floating");
    await animateRenderer(options, config.floatDurationMs, (progress, timestamp) => {
      renderer.renderFloat(progress, timestamp);
    });

    await waitUntilDrop(renderer, options, config.floatWaitTimeoutMs);

    options.setPhase("dropping");
    await animateRenderer(options, config.dropDurationMs, (progress, timestamp) => {
      renderer.renderDrop(progress, timestamp);
    });
  } finally {
    renderer.dispose();
  }
}

export function preloadHtmlInCanvasShardOverlay({
  documentRef = document,
  loadThreeModule = loadThree,
}: {
  readonly documentRef?: Document;
  readonly loadThreeModule?: ThreeLoader;
} = {}): Promise<void> {
  preloadPromise ??= warmHtmlInCanvasShardOverlay(documentRef, loadThreeModule).catch(
    () => undefined,
  );
  return preloadPromise;
}

function animateRenderer(
  options: HtmlInCanvasShardOverlayRunnerOptions,
  durationMs: number,
  render: (progress: number, timestamp: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let frameId: number | null = null;
    let startedAt: number | null = null;

    function cleanup(): void {
      if (frameId !== null) {
        options.windowRef.cancelAnimationFrame(frameId);
        frameId = null;
      }
      options.signal.removeEventListener("abort", abort);
    }

    function abort(): void {
      cleanup();
      reject(new Error("Breaking Glass transition was cancelled."));
    }

    function frame(timestamp: number): void {
      startedAt ??= timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / durationMs);
      render(progress, timestamp);

      if (progress >= 1) {
        cleanup();
        resolve();
        return;
      }

      frameId = options.windowRef.requestAnimationFrame(frame);
    }

    if (options.signal.aborted) {
      abort();
      return;
    }

    options.signal.addEventListener("abort", abort, { once: true });
    frameId = options.windowRef.requestAnimationFrame(frame);
  });
}

function stepCrackRenderer(
  renderer: HtmlInCanvasShardRenderer,
  options: HtmlInCanvasShardOverlayRunnerOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let progress = 0;
    let frameId: number | null = null;
    let resolved = false;

    function cleanup(): void {
      if (frameId !== null) {
        options.windowRef.cancelAnimationFrame(frameId);
        frameId = null;
      }
      options.windowRef.removeEventListener("keydown", keydown, true);
      options.signal.removeEventListener("abort", abort);
    }

    function renderStep(nextProgress: number): void {
      progress = clamp(nextProgress, 0, 1);
      renderer.canvas.dataset.htmlInCanvasCrackProgress = progress.toFixed(3);

      if (frameId !== null) {
        options.windowRef.cancelAnimationFrame(frameId);
      }

      frameId = options.windowRef.requestAnimationFrame((timestamp) => {
        frameId = null;
        renderer.renderCrack(progress, timestamp);
        emitStepCrackDebugEvent(renderer, progress);
      });
    }

    function finish(): void {
      if (resolved) {
        return;
      }
      resolved = true;
      renderer.canvas.dataset.htmlInCanvasCrackProgress = "1.000";
      renderer.renderCrack(1, options.windowRef.performance.now());
      cleanup();
      resolve();
    }

    function abort(): void {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      reject(new Error("Breaking Glass transition was cancelled."));
    }

    function keydown(event: KeyboardEvent): void {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        renderStep(progress + CRACK_STEP_PROGRESS);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        renderStep(progress - CRACK_STEP_PROGRESS);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        finish();
      }
    }

    if (options.signal.aborted) {
      abort();
      return;
    }

    options.windowRef.addEventListener("keydown", keydown, true);
    options.signal.addEventListener("abort", abort, { once: true });
    renderStep(progress);
  });
}

function emitStepCrackDebugEvent(renderer: HtmlInCanvasShardRenderer, progress: number): void {
  renderer.canvas.dispatchEvent(
    new CustomEvent("html-in-canvas:crack-step", {
      detail: { progress },
    }),
  );
  console.info(
    `[Breaking Glass] crack step ${progress.toFixed(3)} ` +
      "(ArrowRight/Space forward, ArrowLeft/Backspace back, Enter continue)",
  );
}

function waitUntilDrop(
  renderer: HtmlInCanvasShardRenderer,
  options: HtmlInCanvasShardOverlayRunnerOptions,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let frameId: number | null = null;
    let timeoutId: number | null = null;
    let resolved = false;

    function cleanup(): void {
      if (frameId !== null) {
        options.windowRef.cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (timeoutId !== null) {
        options.windowRef.clearTimeout(timeoutId);
        timeoutId = null;
      }
      renderer.canvas.removeEventListener("pointerdown", drop, true);
      renderer.canvas.removeEventListener("click", drop, true);
      options.windowRef.removeEventListener("keydown", keydown, true);
      options.signal.removeEventListener("abort", abort);
    }

    function finish(): void {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve();
    }

    function abort(): void {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      reject(new Error("Breaking Glass transition was cancelled."));
    }

    function drop(event: Event): void {
      event.preventDefault();
      event.stopPropagation();
      renderer.setDropOrigin(dropOriginForEvent(renderer.canvas, event));
      finish();
    }

    function timeout(): void {
      renderer.setDropOrigin(centerDropOrigin(renderer.canvas));
      finish();
    }

    function keydown(event: KeyboardEvent): void {
      if (event.key !== " " && event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      renderer.setDropOrigin(centerDropOrigin(renderer.canvas));
      finish();
    }

    function frame(timestamp: number): void {
      renderer.renderWaiting(timestamp);
      if (resolved) {
        return;
      }
      frameId = options.windowRef.requestAnimationFrame(frame);
    }

    if (options.signal.aborted) {
      abort();
      return;
    }

    renderer.canvas.addEventListener("pointerdown", drop, true);
    renderer.canvas.addEventListener("click", drop, true);
    options.windowRef.addEventListener("keydown", keydown, true);
    options.signal.addEventListener("abort", abort, { once: true });
    timeoutId = options.windowRef.setTimeout(timeout, Math.max(0, timeoutMs));
    frameId = options.windowRef.requestAnimationFrame(frame);
  });
}

function dropOriginForEvent(canvas: HTMLCanvasElement, event: Event): HtmlInCanvasTransitionOrigin {
  const rect = canvas.getBoundingClientRect();
  const fallback = centerDropOrigin(canvas);
  const pointerEvent = event as Partial<Pick<MouseEvent, "clientX" | "clientY">>;

  if (
    typeof pointerEvent.clientX !== "number" ||
    typeof pointerEvent.clientY !== "number" ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return fallback;
  }

  return {
    x: clamp(pointerEvent.clientX - rect.left, 0, rect.width),
    y: clamp(pointerEvent.clientY - rect.top, 0, rect.height),
  };
}

function centerDropOrigin(canvas: HTMLCanvasElement): HtmlInCanvasTransitionOrigin {
  const rect = canvas.getBoundingClientRect();

  return {
    x: Math.max(1, rect.width) / 2,
    y: Math.max(1, rect.height) / 2,
  };
}

async function warmHtmlInCanvasShardOverlay(
  documentRef: Document,
  loadThreeModule: ThreeLoader,
): Promise<void> {
  const THREE = await loadThreeModule();
  const canvas = documentRef.createElement("canvas");
  const renderer = new THREE.WebGPURenderer({ canvas, alpha: true, antialias: true });

  try {
    await renderer.init();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.1, 10);

    renderer.setSize(1, 1, false);
    renderer.render(scene, camera);
  } finally {
    renderer.dispose();
  }
}

function resolvedConfig(
  options: HtmlInCanvasShardOverlayRunnerOptions,
): HtmlInCanvasShardOverlayConfig {
  return { ...DEFAULT_CONFIG, ...options.config };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Breaking Glass transition was cancelled.");
  }
}
