import { beforeEach, describe, expect, it, vi } from "vitest";

const workerMock = vi.hoisted(() => ({
  canUseMarkdownWorker: vi.fn(),
  createMarkdownWorkerRenderer: vi.fn(),
}));

const debugMock = vi.hoisted(() => ({
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
}));

const mainThreadMock = vi.hoisted(() => ({
  createMainThreadMarkdownRenderer: vi.fn(() => ({
    ready: Promise.resolve(),
    render: vi.fn(async (source: string) => ({ html: `<main>${source}</main>` })),
    dispose: vi.fn(),
  })),
}));

vi.mock("~/core/markdown/MarkdownWorkerAdapter", () => workerMock);

vi.mock("~/core/debug", () => debugMock);

vi.mock("~/core/markdown/MainThreadMarkdownRenderer", () => mainThreadMock);

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
      html: "<main># Fallback</main>",
    });
    expect(mainThreadMock.createMainThreadMarkdownRenderer).toHaveBeenCalledTimes(1);
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
      html: "<main># Recovered</main>",
    });
    expect(workerRenderer.dispose).toHaveBeenCalledTimes(1);
    expect(mainThreadMock.createMainThreadMarkdownRenderer).toHaveBeenCalledTimes(1);
    expect(debugMock.debugWarn).toHaveBeenCalledWith(
      "[markdown]",
      "worker render failed; falling back to main thread",
      expect.objectContaining({ message: "missing worker chunk" }),
    );

    await expect(renderer.render("# Still fallback")).resolves.toEqual({
      html: "<main># Still fallback</main>",
    });
    expect(workerRenderer.render).toHaveBeenCalledTimes(1);
    expect(mainThreadMock.createMainThreadMarkdownRenderer).toHaveBeenCalledTimes(1);

    renderer.dispose();
  });
});
