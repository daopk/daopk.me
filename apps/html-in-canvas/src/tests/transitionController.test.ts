import { describe, expect, it, vi } from "vitest";

import {
  HtmlInCanvasTransitionController,
  type HtmlInCanvasSnapshot,
} from "../engine/transition/transitionController";
import type { HtmlInCanvasCaptureSupport } from "../engine/capture/captureSupport";

const supportedCapture: HtmlInCanvasCaptureSupport = {
  supported: true,
  preferredMode: "html-in-canvas",
  htmlInCanvas: { supported: true, missingFeatures: [] },
  desktopShellSupported: true,
  webGlSupported: true,
  missingFeatures: [],
};

const snapshot: HtmlInCanvasSnapshot = {
  url: "data:image/png;base64,desktop",
  width: 1440,
  height: 900,
  pixelRatio: 2,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe("HtmlInCanvasTransitionController", () => {
  it("ignores start requests while a transition is already busy", async () => {
    const overlayDone = deferred();
    const captureSnapshot = vi.fn(async () => snapshot);
    const runShardOverlay = vi.fn(async () => {
      await overlayDone.promise;
    });
    const controller = new HtmlInCanvasTransitionController({
      reducedMotion: () => false,
      detectSupport: () => supportedCapture,
      captureSnapshot,
      runShardOverlay,
      documentRef: document,
      windowRef: window,
      waitForFrame: async () => undefined,
    });

    const first = controller.start(vi.fn(), { origin: { x: 12, y: 24 } });
    await Promise.resolve();
    const second = controller.start(vi.fn(), { origin: { x: 36, y: 48 } });
    overlayDone.resolve();
    await Promise.all([first, second]);

    expect(captureSnapshot).toHaveBeenCalledTimes(1);
    expect(runShardOverlay).toHaveBeenCalledTimes(1);
    expect(controller.getState().phase).toBe("complete");
  });

  it("aborts the active overlay when disposed", async () => {
    let overlaySignal: AbortSignal | null = null;
    const controller = new HtmlInCanvasTransitionController({
      reducedMotion: () => false,
      detectSupport: () => supportedCapture,
      captureSnapshot: async () => snapshot,
      runShardOverlay: async (_snapshot, revealDesktop, options) => {
        overlaySignal = options.signal;
        await revealDesktop();
        options.setPhase("floating");
        await new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("cancelled")), {
            once: true,
          });
        });
      },
      documentRef: document,
      windowRef: window,
      waitForFrame: async () => undefined,
    });

    const start = controller.start(vi.fn(), { origin: { x: 12, y: 24 } });
    await Promise.resolve();
    await Promise.resolve();

    controller.dispose();
    await start;

    expect(overlaySignal?.aborted).toBe(true);
    expect(controller.getState().phase).toBe("idle");
  });
});
