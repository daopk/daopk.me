import { beforeEach, describe, expect, it, vi } from "vitest";

const workerMock = vi.hoisted(() => ({
  canUseMarkdownWorker: vi.fn(),
  createMarkdownWorkerRenderer: vi.fn(),
}));

const debugMock = vi.hoisted(() => ({
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
}));

vi.mock("~/core/markdown/MarkdownWorkerAdapter", () => workerMock);

vi.mock("~/core/debug", () => debugMock);

import { createMarkdownRenderer } from "~/core/markdown/createMarkdownRenderer";

describe("createMarkdownRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerMock.canUseMarkdownWorker.mockReturnValue(true);
  });

  it("renders through the worker after the readiness handshake succeeds", async () => {
    const workerRenderer = {
      ready: Promise.resolve(),
      render: vi.fn(async () => ({ html: "<p>Worker</p>" })),
      dispose: vi.fn(),
    };

    workerMock.createMarkdownWorkerRenderer.mockReturnValue(workerRenderer);

    const renderer = await createMarkdownRenderer();

    await expect(renderer.render("# Worker")).resolves.toEqual({ html: "<p>Worker</p>" });
    expect(workerRenderer.render).toHaveBeenCalledWith("# Worker");
    expect(workerRenderer.dispose).not.toHaveBeenCalled();

    renderer.dispose();
    expect(workerRenderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes an unready worker and falls back to the main-thread renderer", async () => {
    const workerRenderer = {
      ready: Promise.reject(new Error("silent worker")),
      render: vi.fn(async () => ({ html: "" })),
      dispose: vi.fn(),
    };

    workerMock.createMarkdownWorkerRenderer.mockReturnValue(workerRenderer);

    const renderer = await createMarkdownRenderer();

    expect(workerRenderer.dispose).toHaveBeenCalledTimes(1);
    await expect(renderer.render("# Fallback")).resolves.toEqual({
      html: expect.stringContaining("<h1>Fallback</h1>"),
    });
    expect(debugMock.debugWarn).toHaveBeenCalledWith(
      "[markdown]",
      "worker renderer unavailable; falling back to main thread",
      expect.objectContaining({ message: "silent worker" }),
    );

    renderer.dispose();
  });

  it("falls back to the main-thread renderer when worker render fails after ready", async () => {
    const workerRenderer = {
      ready: Promise.resolve(),
      render: vi.fn(async () => {
        throw new Error("missing worker chunk");
      }),
      dispose: vi.fn(),
    };

    workerMock.createMarkdownWorkerRenderer.mockReturnValue(workerRenderer);

    const renderer = await createMarkdownRenderer();

    await expect(renderer.render("# Recovered")).resolves.toEqual({
      html: expect.stringContaining("<h1>Recovered</h1>"),
    });
    expect(workerRenderer.dispose).toHaveBeenCalledTimes(1);
    expect(debugMock.debugWarn).toHaveBeenCalledWith(
      "[markdown]",
      "worker render failed; falling back to main thread",
      expect.objectContaining({ message: "missing worker chunk" }),
    );

    await expect(renderer.render("# Still fallback")).resolves.toEqual({
      html: expect.stringContaining("<h1>Still fallback</h1>"),
    });
    expect(workerRenderer.render).toHaveBeenCalledTimes(1);

    renderer.dispose();
  });
});
