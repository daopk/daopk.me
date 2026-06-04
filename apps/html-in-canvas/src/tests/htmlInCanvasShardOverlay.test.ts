import { afterEach, describe, expect, it, vi } from "vitest";

import { runHtmlInCanvasShardOverlay } from "../engine/cinematics/shards";
import type { HtmlInCanvasShardRenderer } from "../engine/cinematics/shards/types";
import type { HtmlInCanvasSnapshot } from "../engine/transition/transitionController";

const snapshot: HtmlInCanvasSnapshot = {
  url: "data:image/png;base64,desktop",
  width: 1440,
  height: 900,
  pixelRatio: 2,
};

function installTimerAnimationFrame(stepMs = 50): void {
  let timestamp = 0;
  let nextId = 0;
  const timers = new Map<number, number>();

  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextId;
    const timerId = window.setTimeout(() => {
      timers.delete(id);
      timestamp += stepMs;
      callback(timestamp);
    }, stepMs);
    timers.set(id, timerId);
    return id;
  });

  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    const timerId = timers.get(id);
    if (timerId === undefined) {
      return;
    }
    window.clearTimeout(timerId);
    timers.delete(id);
  });
}

function fakeRenderer(calls: string[]): HtmlInCanvasShardRenderer {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    bottom: snapshot.height,
    height: snapshot.height,
    left: 0,
    right: snapshot.width,
    top: 0,
    width: snapshot.width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  document.body.append(canvas);

  return {
    canvas,
    renderCover: vi.fn(() => calls.push("cover")),
    renderCrack: vi.fn((progress) => calls.push(`crack:${progress.toFixed(2)}`)),
    renderFloat: vi.fn((progress) => calls.push(`float:${progress.toFixed(2)}`)),
    renderWaiting: vi.fn(() => calls.push("waiting")),
    renderDrop: vi.fn((progress) => calls.push(`drop:${progress.toFixed(2)}`)),
    renderReduced: vi.fn((progress) => calls.push(`reduced:${progress.toFixed(2)}`)),
    setDropOrigin: vi.fn(),
    dispose: vi.fn(() => {
      calls.push("dispose");
      canvas.remove();
    }),
  };
}

describe("runHtmlInCanvasShardOverlay", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("renders cover, reveals the desktop, floats, auto-drops, and disposes", async () => {
    vi.useFakeTimers();
    installTimerAnimationFrame();

    const calls: string[] = [];
    const phases: string[] = [];
    const renderer = fakeRenderer(calls);
    const revealDesktop = vi.fn(() => calls.push("reveal"));

    const transition = runHtmlInCanvasShardOverlay(snapshot, revealDesktop, {
      reducedMotion: false,
      documentRef: document,
      windowRef: window,
      signal: new AbortController().signal,
      origin: { x: 420, y: 360 },
      waitForFrame: async () => undefined,
      setPhase(phase) {
        phases.push(phase);
      },
      config: {
        crackDurationMs: 100,
        floatDurationMs: 100,
        floatWaitTimeoutMs: 100,
        dropDurationMs: 100,
      },
      createRenderer: async () => renderer,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await transition;

    expect(revealDesktop).toHaveBeenCalledTimes(1);
    expect(phases).toEqual(["covering", "cracking", "floating", "dropping"]);
    expect(calls[0]).toBe("cover");
    expect(calls).toContain("reveal");
    expect(calls).toContain("waiting");
    expect(renderer.setDropOrigin).toHaveBeenCalledWith({ x: 720, y: 450 });
    expect(calls.some((call) => call.startsWith("drop:"))).toBe(true);
    expect(calls.at(-1)).toBe("dispose");
  });
});
