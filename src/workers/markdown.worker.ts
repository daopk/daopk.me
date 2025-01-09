import { RpcRelay } from "~/core/ipc/rpc";

export function createMarkdownWorkerApi() {
  return {
    async ready(): Promise<void> {
      await import("~/core/markdown/MarkdownPipeline");
    },

    async render(source: unknown) {
      const { renderMarkdownToHtml } = await import("~/core/markdown/MarkdownPipeline");

      return renderMarkdownToHtml(String(source));
    },
  };
}

if (typeof document === "undefined" && typeof self !== "undefined") {
  new RpcRelay().expose(createMarkdownWorkerApi());
}
