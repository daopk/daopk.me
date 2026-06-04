import { detectHtmlInCanvasSupport, type HtmlInCanvasSupport } from "./htmlInCanvasSupport";
import { DESKTOP_SHELL_SELECTOR } from "./constants";

export type HtmlInCanvasCaptureMode = "html-in-canvas";

export interface HtmlInCanvasCaptureSupport {
  readonly supported: boolean;
  readonly preferredMode: HtmlInCanvasCaptureMode | null;
  readonly htmlInCanvas: HtmlInCanvasSupport;
  readonly desktopShellSupported: boolean;
  readonly webGlSupported: boolean;
  readonly missingFeatures: readonly string[];
}

interface HtmlInCanvasCaptureEnvironment {
  readonly document?: {
    createElement?: (tagName: string) => Element;
    querySelector?: (selectors: string) => Element | null;
  };
  readonly HTMLCanvasElement?: {
    readonly prototype?: object;
  };
  readonly CanvasRenderingContext2D?: {
    readonly prototype?: object;
  };
}

const DESKTOP_SHELL_LABEL = "desktop shell";
const WEBGL_LABEL = "WebGL canvas";

function hasDesktopShell(environment: HtmlInCanvasCaptureEnvironment): boolean {
  return environment.document?.querySelector?.(DESKTOP_SHELL_SELECTOR) != null;
}

function hasWebGlCanvas(environment: HtmlInCanvasCaptureEnvironment): boolean {
  const canvas = environment.document?.createElement?.("canvas");
  const getContext = (canvas as Partial<HTMLCanvasElement> | undefined)?.getContext;
  if (typeof getContext !== "function") {
    return false;
  }

  try {
    return (
      getContext.call(canvas, "webgl", { alpha: true }) !== null ||
      getContext.call(canvas, "experimental-webgl", { alpha: true }) !== null
    );
  } catch {
    return false;
  }
}

export function detectHtmlInCanvasCaptureSupport(
  environment: HtmlInCanvasCaptureEnvironment = globalThis,
): HtmlInCanvasCaptureSupport {
  const htmlInCanvas = detectHtmlInCanvasSupport(environment);
  const desktopShellSupported = hasDesktopShell(environment);
  const webGlSupported = hasWebGlCanvas(environment);
  const missingFeatures: string[] = [];

  if (!desktopShellSupported) {
    missingFeatures.push(DESKTOP_SHELL_LABEL);
  }
  if (!webGlSupported) {
    missingFeatures.push(WEBGL_LABEL);
  }
  missingFeatures.push(...htmlInCanvas.missingFeatures);

  const supported = missingFeatures.length === 0;

  return {
    supported,
    preferredMode: supported ? "html-in-canvas" : null,
    htmlInCanvas,
    desktopShellSupported,
    webGlSupported,
    missingFeatures,
  };
}
