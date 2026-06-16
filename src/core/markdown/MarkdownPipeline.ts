import { createMarkdownProcessor, hasFencedCode } from "~/core/markdown/MarkdownProcessor";
import type { MarkdownPreviewRequest, MarkdownRenderResult } from "~/core/markdown/MarkdownTypes";

export type { MarkdownPreviewRequest, MarkdownRenderResult } from "~/core/markdown/MarkdownTypes";
export {
  createMarkdownProcessor,
  readFencedCodeLanguages,
  sanitizeMarkdownUrl,
} from "~/core/markdown/MarkdownProcessor";

export async function renderMarkdownToHtml(source: string): Promise<MarkdownRenderResult> {
  const previews: MarkdownPreviewRequest[] = [];
  if (hasFencedCode(source)) {
    const { renderMarkdownWithShiki } = await import("~/core/markdown/ShikiHighlighter");

    return renderResultWithPreviews(await renderMarkdownWithShiki(source, { previews }), previews);
  }

  const file = await createMarkdownProcessor({ previews }).process(source);

  return renderResultWithPreviews({ html: String(file) }, previews);
}

function renderResultWithPreviews(
  result: MarkdownRenderResult,
  previews: readonly MarkdownPreviewRequest[],
): MarkdownRenderResult {
  return previews.length === 0 ? result : { ...result, previews: Object.freeze([...previews]) };
}
