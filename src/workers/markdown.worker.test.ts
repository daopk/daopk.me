import { describe, expect, it } from "vitest";

import { RPC_ENVELOPE_VERSION, unwrapRpcEnvelope, wrapRpcMethod } from "~/core/ipc/rpc";
import { createMarkdownWorkerApi } from "~/workers/markdown.worker";

describe("markdown.worker API", () => {
  it("renders clone-safe markdown input through the worker API shape", async () => {
    const api = createMarkdownWorkerApi();

    await expect(api.render("# Worker Markdown")).resolves.toEqual({
      html: expect.stringContaining("<h1>Worker Markdown</h1>"),
    });
  }, 15_000);

  it("preserves the pipeline sanitization rules", async () => {
    const api = createMarkdownWorkerApi();
    const result = await api.render("[x](javascript:alert(1))\n\n<script>alert(1)</script>");

    expect(result.html).toContain('href="#"');
    expect(result.html).not.toMatch(/<script|javascript:/i);
  });

  it("renders fenced code and keeps hostile code content escaped", async () => {
    const api = createMarkdownWorkerApi();
    const result = await api.render(
      "```ts\nconst answer = 42;\n```\n\n```html\n<script>alert(1)</script>\n```",
    );

    expect(result.html).toContain("shiki");
    expect(result.html).toContain("answer");
    expect(result.html).toContain("&#x3C;script");
    expect(result.html).not.toMatch(/<script/i);
  });

  it("matches RpcRelay's versioned envelope contract when wrapped", async () => {
    const api = createMarkdownWorkerApi();
    const ready = wrapRpcMethod(api.ready);
    const render = wrapRpcMethod(api.render);

    await expect(ready()).resolves.toEqual({
      version: RPC_ENVELOPE_VERSION,
      ok: true,
    });

    await expect(render("plain")).resolves.toMatchObject({
      version: RPC_ENVELOPE_VERSION,
      ok: true,
      value: { html: expect.stringContaining("<p>plain</p>") },
    });

    const envelope = await render("plain");
    expect(unwrapRpcEnvelope(envelope).html).toContain("<p>plain</p>");
  });
});
