import type { IncomingMessage, ServerResponse } from "node:http";

import type { Connect, PluginOption } from "vite";

const FILES_ORIGIN = "https://daopk.me";

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "if-modified-since",
  "if-none-match",
  "range",
] as const;

const OMITTED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function headerValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return null;
}

function forwardedHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = headerValue(req.headers[name]);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  return headers;
}

function copyResponseHeaders(upstream: Response, res: ServerResponse): void {
  upstream.headers.forEach((value, name) => {
    if (!OMITTED_RESPONSE_HEADERS.has(name.toLowerCase())) {
      res.setHeader(name, value);
    }
  });
}

export function filesProxyTargetUrl(
  requestUrl: string | undefined,
  origin = FILES_ORIGIN,
): string | null {
  if (requestUrl === undefined) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(requestUrl, FILES_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.pathname !== "/_worker/files" && !parsed.pathname.startsWith("/_worker/files/")) {
    return null;
  }

  return new URL(`${parsed.pathname}${parsed.search}`, origin).toString();
}

async function proxyFilesRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: string,
): Promise<void> {
  try {
    const upstream = await fetch(targetUrl, {
      headers: forwardedHeaders(req),
      method: req.method === "HEAD" ? "HEAD" : "GET",
    });

    res.statusCode = upstream.status;
    res.statusMessage = upstream.statusText;
    copyResponseHeaders(upstream, res);

    if (req.method === "HEAD" || upstream.status === 304) {
      res.end();
      return;
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Length", String(bytes.byteLength));
    res.end(bytes);
  } catch (error) {
    res.statusCode = 502;
    res.end(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Production serves `/_worker/files/*` from the Worker/R2 bucket. In local Vite
 * dev and preview there is no R2 binding, so proxy the same-origin path to
 * daopk.me.
 */
export function filesContentProxyServer(): PluginOption {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const targetUrl = filesProxyTargetUrl(req.url);
    if (targetUrl === null) {
      next();
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end("Method not allowed");
      return;
    }

    void proxyFilesRequest(req, res, targetUrl);
  };

  return {
    name: "files-content-proxy-server",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
