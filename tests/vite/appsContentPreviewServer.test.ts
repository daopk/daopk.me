import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import type { Connect } from "vite";

import {
  appsContentPreviewServer,
  buildFirstPartyPreviewCatalog,
} from "../../vite/plugins/appsContentPreviewServer";

const appsRoot = resolve("apps");

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
  nextCalled: boolean;
}

/** Pull the middleware registered on a given plugin server hook. */
function captureMiddleware(hook: "configureServer" | "configurePreviewServer") {
  let captured: Connect.NextHandleFunction | undefined;
  const fakeServer = {
    middlewares: {
      use: (fn: Connect.NextHandleFunction) => {
        captured = fn;
      },
    },
  };
  const plugin = appsContentPreviewServer(appsRoot) as Record<string, unknown>;
  (plugin[hook] as (server: unknown) => void)(fakeServer);
  if (captured === undefined) {
    throw new Error(`plugin did not register a ${hook} middleware`);
  }
  return captured;
}

/** Run a middleware against a fake req/res, resolving once it ends or calls next. */
function runMiddleware(
  middleware: Connect.NextHandleFunction,
  url: string,
): Promise<CapturedResponse> {
  return new Promise((resolvePromise) => {
    const result: CapturedResponse = { statusCode: 200, headers: {}, nextCalled: false };
    const res = {
      statusCode: 200,
      setHeader(key: string, value: string) {
        result.headers[key.toLowerCase()] = value;
      },
      end(body?: unknown) {
        result.statusCode = this.statusCode;
        result.body = body;
        resolvePromise(result);
      },
    };
    const next = () => {
      result.nextCalled = true;
      resolvePromise(result);
    };
    middleware({ url } as Connect.IncomingMessage, res as never, next);
  });
}

describe("buildFirstPartyPreviewCatalog", () => {
  it("synthesizes the preview catalog from first-party app package versions", async () => {
    const catalog = await buildFirstPartyPreviewCatalog(appsRoot);
    const ids = catalog.apps.map((app) => app.id);

    expect(catalog.version).toBe(1);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    expect(ids).not.toContain("_shared");
    expect(ids).not.toContain("html-in-canvas");

    expect(catalog.apps.find((app) => app.id === "notes")).toEqual(
      expect.objectContaining({
        id: "notes",
        version: "1.0.1",
        build: 0,
        entry: "/apps/notes/1.0.1+0/notes.js",
        manifest: expect.objectContaining({ id: "notes", name: "Notes" }),
      }),
    );

    for (const app of catalog.apps) {
      expect(app.build).toBe(0);
      expect(app.entry).toBe(`/apps/${app.id}/${app.version}+0/${app.id}.js`);
      expect(app.manifest).toEqual(expect.objectContaining({ id: app.id }));
    }
  });
});

describe("appsContentPreviewServer dev asset middleware", () => {
  it("serves an app-owned icon from public/ at its release-pinned URL with the png content type", async () => {
    const middleware = captureMiddleware("configureServer");

    const result = await runMiddleware(middleware, "/apps/notes/1.0.1+0/icon.png");

    expect(result.nextCalled).toBe(false);
    expect(result.headers["content-type"]).toBe("image/png");
    expect(Buffer.isBuffer(result.body) ? result.body.subarray(0, 8).toString("hex") : "").toBe(
      "89504e470d0a1a0a",
    );
  });

  it("falls through to Vite for non-image paths so app source is never shadowed", async () => {
    const middleware = captureMiddleware("configureServer");

    const result = await runMiddleware(middleware, "/apps/notes/src/main.ts");

    expect(result.nextCalled).toBe(true);
    expect(result.body).toBeUndefined();
  });

  it("falls through to Vite when the requested asset does not exist", async () => {
    const middleware = captureMiddleware("configureServer");

    const result = await runMiddleware(middleware, "/apps/notes/1.0.1+0/missing-icon.png");

    expect(result.nextCalled).toBe(true);
  });
});
