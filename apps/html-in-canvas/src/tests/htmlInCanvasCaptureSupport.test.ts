import { describe, expect, it, vi } from "vitest";

import { detectHtmlInCanvasCaptureSupport } from "../engine/capture/captureSupport";

function environment(options: {
  readonly desktopShell?: boolean;
  readonly htmlInCanvas?: boolean;
  readonly webGl?: boolean;
}) {
  const canvasPrototype = options.htmlInCanvas
    ? { layoutSubtree: false, requestPaint: () => undefined }
    : {};
  const contextPrototype = options.htmlInCanvas ? { drawElementImage: () => undefined } : {};
  const canvas = {
    getContext: vi.fn((type: string) => (options.webGl && type === "webgl" ? {} : null)),
  };

  return {
    document: {
      createElement: vi.fn(() => canvas),
      querySelector: vi.fn(() => (options.desktopShell ? {} : null)),
    },
    HTMLCanvasElement: {
      prototype: canvasPrototype,
    },
    CanvasRenderingContext2D: {
      prototype: contextPrototype,
    },
  };
}

describe("detectHtmlInCanvasCaptureSupport", () => {
  it("supports the widget transition when desktop capture, WebGL, and capture APIs exist", () => {
    expect(
      detectHtmlInCanvasCaptureSupport(
        environment({ desktopShell: true, htmlInCanvas: true, webGl: true }),
      ),
    ).toMatchObject({
      supported: true,
      preferredMode: "html-in-canvas",
      desktopShellSupported: true,
      webGlSupported: true,
      missingFeatures: [],
    });
  });

  it("reports every missing feature for the fallback window", () => {
    expect(detectHtmlInCanvasCaptureSupport(environment({}))).toMatchObject({
      supported: false,
      preferredMode: null,
      missingFeatures: [
        "desktop shell",
        "WebGL canvas",
        "canvas layoutsubtree",
        "canvas requestPaint()",
        "2D canvas drawElementImage()",
      ],
    });
  });
});
