export interface MarkdownRenderResult {
  html: string;
  previews?: readonly MarkdownPreviewRequest[];
}

export interface MarkdownPreviewRequest {
  readonly id: string;
  readonly url: string;
}
