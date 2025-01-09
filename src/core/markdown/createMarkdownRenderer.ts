import { debugWarn } from "~/core/debug";
import type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";
import {
  canUseMarkdownWorker,
  createMarkdownWorkerRenderer,
} from "~/core/markdown/MarkdownWorkerAdapter";

export async function createMarkdownRenderer(): Promise<MarkdownRenderer> {
  if (canUseMarkdownWorker()) {
    let workerRenderer: ReturnType<typeof createMarkdownWorkerRenderer> | undefined;

    try {
      workerRenderer = createMarkdownWorkerRenderer();
      await workerRenderer.ready;

      return createWorkerRendererWithFallback(workerRenderer);
    } catch (error) {
      workerRenderer?.dispose();
      debugWarn("[markdown]", "worker renderer unavailable; falling back to main thread", error);
    }
  }

  return createFallbackRenderer();
}

function createWorkerRendererWithFallback(workerRenderer: MarkdownRenderer): MarkdownRenderer {
  let disposed = false;
  let fallbackRendererPromise: Promise<MarkdownRenderer> | undefined;

  async function getFallbackRenderer(error: unknown): Promise<MarkdownRenderer> {
    workerRenderer.dispose();
    debugWarn("[markdown]", "worker render failed; falling back to main thread", error);

    fallbackRendererPromise ??= createFallbackRenderer();

    return fallbackRendererPromise;
  }

  return {
    ready: workerRenderer.ready,

    async render(source) {
      if (disposed) {
        return { html: "" };
      }

      if (fallbackRendererPromise) {
        const fallbackRenderer = await fallbackRendererPromise;

        if (disposed) {
          return { html: "" };
        }

        return fallbackRenderer.render(source);
      }

      try {
        return await workerRenderer.render(source);
      } catch (error) {
        if (disposed) {
          return { html: "" };
        }

        const fallbackRenderer = await getFallbackRenderer(error);

        if (disposed) {
          fallbackRenderer.dispose();

          return { html: "" };
        }

        return fallbackRenderer.render(source);
      }
    },

    dispose(): void {
      disposed = true;
      workerRenderer.dispose();
      void fallbackRendererPromise
        ?.then((renderer) => {
          renderer.dispose();
        })
        .catch(() => undefined);
    },
  };
}

async function createFallbackRenderer(): Promise<MarkdownRenderer> {
  const { createMainThreadMarkdownRenderer } =
    await import("~/core/markdown/MainThreadMarkdownRenderer");

  return createMainThreadMarkdownRenderer();
}
