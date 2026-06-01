/**
 * Stable re-export façade for the host's markdown renderer, emitted as the
 * `daopk-markdown-runtime` build entry. The import map in index.html points the
 * bare `@daopk/markdown` specifier at this entry's hashed chunk so first-party
 * apps (blog, editor) reuse the host's ONE markdown pipeline — including its
 * web-worker renderer and the heavy shiki/unified stack it lazy-loads — instead
 * of bundling a second copy.
 *
 * Kept separate from `@daopk/sdk` so that chunk stays lean: the markdown stack
 * only loads for apps that actually render markdown.
 *
 * See `src/runtime/kit.ts` for the build-entry / `preserveEntrySignatures`
 * rationale.
 */
export { createMarkdownRenderer } from "~/core/markdown/createMarkdownRenderer";

export type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";
export type { MarkdownRenderResult } from "~/core/markdown/MarkdownPipeline";
