import { describe, expect, it, vi } from "vitest";

import { wrapRpcMethod } from "~/core/ipc/rpc";
import { renderMarkdownToHtml, type MarkdownRenderResult } from "~/core/markdown/MarkdownPipeline";
import {
  createMarkdownWorkerRenderer,
  type MarkdownWorkerApi,
  type MarkdownWorkerClient,
} from "~/core/markdown/MarkdownWorkerAdapter";

function createFakeClient() {
  const terminate = vi.fn();
  const api: MarkdownWorkerApi = {
    ready: wrapRpcMethod(() => undefined),
    render: wrapRpcMethod((source: string) => renderMarkdownToHtml(source)),
  } satisfies MarkdownWorkerApi;

  return {
    client: { api, terminate } satisfies MarkdownWorkerClient,
    terminate,
  };
}

describe("MarkdownWorkerAdapter", () => {
  it("waits for ready and renders through the worker queue", async () => {
    const { client } = createFakeClient();
    const renderer = createMarkdownWorkerRenderer({
      createClient: () => client,
    });

    await expect(renderer.ready).resolves.toBeUndefined();
    await expect(renderer.render("# Hello")).resolves.toEqual({
      html: expect.stringContaining("<h1>Hello</h1>"),
    });

    renderer.dispose();
  });

  it("rejects ready when the worker never responds", async () => {
    const terminate = vi.fn();
    const client: MarkdownWorkerClient = {
      api: {
        ready: () => new Promise<never>(() => undefined),
        render: wrapRpcMethod(async (): Promise<MarkdownRenderResult> => ({ html: "" })),
      },
      terminate,
    };
    const renderer = createMarkdownWorkerRenderer({
      createClient: () => client,
      readyTimeoutMs: 1,
    });

    await expect(renderer.ready).rejects.toMatchObject({ name: "JobTimeoutError" });

    renderer.dispose();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("disposes idempotently and returns empty HTML after dispose", async () => {
    const { client, terminate } = createFakeClient();
    const renderer = createMarkdownWorkerRenderer({
      createClient: () => client,
    });

    renderer.dispose();
    renderer.dispose();

    expect(terminate).toHaveBeenCalledTimes(1);
    await expect(renderer.render("# Hidden")).resolves.toEqual({ html: "" });
  });
});
