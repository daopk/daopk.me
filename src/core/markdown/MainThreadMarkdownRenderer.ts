import type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";
import { renderMarkdownToHtml } from "~/core/markdown/MarkdownPipeline";

export function createMainThreadMarkdownRenderer(): MarkdownRenderer {
  let disposed = false;

  return {
    ready: Promise.resolve(),

    async render(source) {
      if (disposed) {
        return { html: "" };
      }

      return renderMarkdownToHtml(source);
    },

    dispose(): void {
      disposed = true;
    },
  };
}
