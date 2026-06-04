import type { HtmlInCanvasSnapshot } from "../transition/transitionController";
import { DESKTOP_SHELL_SELECTOR } from "./constants";

interface CanvasWithHtmlSubtree extends HTMLCanvasElement {
  layoutSubtree?: boolean;
  layoutsubtree?: boolean;
  requestPaint?: () => void;
}

interface CanvasRenderingContext2DWithElementImage extends CanvasRenderingContext2D {
  drawElementImage(element: Element, dx: number, dy: number, dWidth: number, dHeight: number): void;
}

interface CaptureDesktopSnapshotOptions {
  readonly documentRef?: Document;
  readonly windowRef?: Window;
  readonly waitForFrame?: () => Promise<void>;
}

const CAPTURE_LAYOUT_STABLE_FRAME_COUNT = 4;
const CAPTURE_LAYOUT_MAX_FRAMES = 36;
const FULLSCREEN_SCREEN_TOLERANCE_PX = 8;

interface CaptureLayoutMetrics {
  readonly sourceHeight: number;
  readonly sourceWidth: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}

interface CaptureViewportMetrics {
  readonly height: number;
  readonly pixelRatio: number;
  readonly width: number;
}

export async function captureDesktopSnapshot({
  documentRef = document,
  windowRef = window,
  waitForFrame = () => nextAnimationFrame(windowRef),
}: CaptureDesktopSnapshotOptions = {}): Promise<HtmlInCanvasSnapshot> {
  const source = documentRef.querySelector<HTMLElement>(DESKTOP_SHELL_SELECTOR);
  if (source === null) {
    throw new Error("Desktop shell is unavailable.");
  }

  await waitForStableCaptureLayout(source, documentRef, windowRef, waitForFrame);

  const { width, height, pixelRatio } = readCaptureViewportMetrics(documentRef, windowRef);
  const canvas = documentRef.createElement("canvas") as CanvasWithHtmlSubtree;
  const clone = documentRef.createElement("div");
  const sourceClone = source.cloneNode(true) as HTMLElement;

  canvas.setAttribute("layoutsubtree", "");
  if ("layoutSubtree" in canvas) {
    canvas.layoutSubtree = true;
  }
  if ("layoutsubtree" in canvas) {
    canvas.layoutsubtree = true;
  }

  canvas.width = Math.ceil(width * pixelRatio);
  canvas.height = Math.ceil(height * pixelRatio);
  canvas.style.cssText = [
    "background: transparent",
    `block-size: ${height}px`,
    "inset: 0",
    `inline-size: ${width}px`,
    "overflow: hidden",
    "pointer-events: none",
    "position: fixed",
    "z-index: -1",
  ].join(";");

  sourceClone.style.inset = "0";
  sourceClone.style.blockSize = `${height}px`;
  sourceClone.style.boxSizing = "border-box";
  sourceClone.style.inlineSize = `${width}px`;
  sourceClone.style.overflow = "hidden";
  sourceClone.style.pointerEvents = "none";
  sourceClone.style.position = "absolute";
  sourceClone.style.transform = "none";

  clone.setAttribute("aria-hidden", "true");
  clone.style.cssText = [
    `block-size: ${height}px`,
    "contain: layout paint style",
    `inline-size: ${width}px`,
    "overflow: hidden",
    "position: relative",
  ].join(";");
  clone.append(sourceClone);
  canvas.append(clone);
  documentRef.body.append(canvas);

  try {
    await waitForFrame();
    canvas.requestPaint?.();
    await waitForFrame();

    const context = canvas.getContext("2d") as CanvasRenderingContext2DWithElementImage | null;
    if (context === null || typeof context.drawElementImage !== "function") {
      throw new Error("2D canvas drawElementImage() is unavailable.");
    }

    context.reset();
    context.scale(pixelRatio, pixelRatio);
    context.drawElementImage(clone, 0, 0, width, height);

    return {
      url: await canvasToSnapshotUrl(canvas),
      width,
      height,
      pixelRatio,
    };
  } finally {
    canvas.remove();
  }
}

async function waitForStableCaptureLayout(
  source: HTMLElement,
  documentRef: Document,
  windowRef: Window,
  waitForFrame: () => Promise<void>,
): Promise<void> {
  let previous = readCaptureLayoutMetrics(source, documentRef, windowRef);
  let stableFrames = 0;

  for (let frame = 0; frame < CAPTURE_LAYOUT_MAX_FRAMES; frame++) {
    await waitForFrame();

    const next = readCaptureLayoutMetrics(source, documentRef, windowRef);
    if (captureLayoutReady(next, documentRef, windowRef) && sameCaptureLayout(next, previous)) {
      stableFrames++;
    } else {
      stableFrames = 0;
    }

    if (stableFrames >= CAPTURE_LAYOUT_STABLE_FRAME_COUNT) {
      return;
    }

    previous = next;
  }
}

function readCaptureLayoutMetrics(
  source: HTMLElement,
  documentRef: Document,
  windowRef: Window,
): CaptureLayoutMetrics {
  const viewport = readCaptureViewportMetrics(documentRef, windowRef);
  const rect = source.getBoundingClientRect();
  const sourceWidth = Math.floor(rect.width || source.offsetWidth || viewport.width);
  const sourceHeight = Math.floor(rect.height || source.offsetHeight || viewport.height);

  return {
    sourceHeight: Math.max(1, sourceHeight),
    sourceWidth: Math.max(1, sourceWidth),
    viewportHeight: viewport.height,
    viewportWidth: viewport.width,
  };
}

function readCaptureViewportMetrics(
  documentRef: Document,
  windowRef: Window,
): CaptureViewportMetrics {
  const width = Math.max(
    1,
    Math.floor(windowRef.innerWidth || documentRef.documentElement.clientWidth || 1),
  );
  const height = Math.max(
    1,
    Math.floor(windowRef.innerHeight || documentRef.documentElement.clientHeight || 1),
  );

  return {
    width,
    height,
    pixelRatio: Math.max(1, Math.min(windowRef.devicePixelRatio || 1, 2)),
  };
}

function captureLayoutReady(
  metrics: CaptureLayoutMetrics,
  documentRef: Document,
  windowRef: Window,
): boolean {
  if (
    metrics.sourceWidth < metrics.viewportWidth - 1 ||
    metrics.sourceHeight < metrics.viewportHeight - 1
  ) {
    return false;
  }

  if (documentRef.fullscreenElement == null) {
    return true;
  }

  return viewportLooksFullscreen(metrics, windowRef);
}

function viewportLooksFullscreen(metrics: CaptureLayoutMetrics, windowRef: Window): boolean {
  const screen = windowRef.screen;

  return (
    screenSizeMatchesViewport(metrics, screen.width, screen.height) ||
    screenSizeMatchesViewport(metrics, screen.availWidth, screen.availHeight)
  );
}

function screenSizeMatchesViewport(
  metrics: CaptureLayoutMetrics,
  screenWidth: number,
  screenHeight: number,
): boolean {
  if (screenWidth <= 0 || screenHeight <= 0) {
    return true;
  }

  const viewportLong = Math.max(metrics.viewportWidth, metrics.viewportHeight);
  const viewportShort = Math.min(metrics.viewportWidth, metrics.viewportHeight);
  const screenLong = Math.max(screenWidth, screenHeight);
  const screenShort = Math.min(screenWidth, screenHeight);

  return (
    viewportLong >= screenLong - FULLSCREEN_SCREEN_TOLERANCE_PX &&
    viewportShort >= screenShort - FULLSCREEN_SCREEN_TOLERANCE_PX
  );
}

function sameCaptureLayout(a: CaptureLayoutMetrics, b: CaptureLayoutMetrics): boolean {
  return (
    a.sourceHeight === b.sourceHeight &&
    a.sourceWidth === b.sourceWidth &&
    a.viewportHeight === b.viewportHeight &&
    a.viewportWidth === b.viewportWidth
  );
}

async function canvasToSnapshotUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await canvasToPngBlob(canvas);
  if (blob !== null && typeof globalThis.URL.createObjectURL === "function") {
    return globalThis.URL.createObjectURL(blob);
  }

  return canvas.toDataURL("image/png");
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob !== "function") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function nextAnimationFrame(windowRef: Window): Promise<void> {
  return new Promise((resolve) => {
    windowRef.requestAnimationFrame(() => resolve());
  });
}
