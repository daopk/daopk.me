import { createServer, type RequestListener, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { requestUpstreamUrl } from "../../vite/plugins/upstreamHttpClient";

let server: Server | undefined;

async function localServer(handler: RequestListener): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP server address.");
  }

  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (server === undefined) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  server = undefined;
});

describe("requestUpstreamUrl", () => {
  it("returns upstream status, headers, and body while forwarding selected headers", async () => {
    const seen: Array<{
      accept: string | undefined;
      method: string | undefined;
      url: string | undefined;
    }> = [];
    const origin = await localServer((req, res) => {
      seen.push({
        accept: req.headers.accept,
        method: req.method,
        url: req.url,
      });
      res.writeHead(202, { "Content-Type": "application/json", "X-Upstream-Test": "ok" });
      res.end(JSON.stringify({ ok: true }));
    });

    const response = await requestUpstreamUrl(`${origin}/data?x=1`, {
      family: 4,
      headers: { Accept: "application/json" },
    });

    expect(seen).toEqual([{ accept: "application/json", method: "GET", url: "/data?x=1" }]);
    expect(response.statusCode).toBe(202);
    expect(response.headers["x-upstream-test"]).toBe("ok");
    expect(response.body.toString("utf8")).toBe('{"ok":true}');
  });

  it("supports HEAD requests", async () => {
    const origin = await localServer((req, res) => {
      res.writeHead(req.method === "HEAD" ? 204 : 405, { "X-Upstream-Test": "head" });
      res.end("body");
    });

    const response = await requestUpstreamUrl(`${origin}/asset`, {
      family: 4,
      method: "HEAD",
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["x-upstream-test"]).toBe("head");
    expect(response.body.byteLength).toBe(0);
  });
});
