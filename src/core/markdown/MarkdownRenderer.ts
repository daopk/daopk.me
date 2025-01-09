import type { MarkdownRenderResult } from "~/core/markdown/MarkdownPipeline";

export interface MarkdownRenderer {
  readonly ready: Promise<void>;
  render(source: string): Promise<MarkdownRenderResult>;
  dispose(): void;
}
