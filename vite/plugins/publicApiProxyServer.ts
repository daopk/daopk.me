import type { IncomingMessage, ServerResponse } from "node:http";

import type { Connect, PluginOption } from "vite";

const PUBLIC_API_ORIGIN = "https://daopk.me";
const PUBLIC_API_PATH_PREFIX = "/_api";

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
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

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function allowsRequestBody(method: string | undefined): boolean {
  return method !== undefined && method !== "GET" && method !== "HEAD";
}

function bodyInitFromBuffer(buffer: Buffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes.buffer;
}

export function publicApiProxyTargetUrl(
  requestUrl: string | undefined,
  origin = PUBLIC_API_ORIGIN,
): string | null {
  if (requestUrl === undefined) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(requestUrl, origin);
  } catch {
    return null;
  }

  if (
    parsed.pathname !== PUBLIC_API_PATH_PREFIX &&
    !parsed.pathname.startsWith(`${PUBLIC_API_PATH_PREFIX}/`)
  ) {
    return null;
  }

  return new URL(`${parsed.pathname}${parsed.search}`, origin).toString();
}

async function proxyPublicApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: string,
): Promise<void> {
  try {
    const method = req.method ?? "GET";
    const body = allowsRequestBody(method) ? bodyInitFromBuffer(await readBody(req)) : undefined;
    const upstream = await fetch(targetUrl, {
      body,
      headers: forwardedHeaders(req),
      method,
    });

    res.statusCode = upstream.status;
    res.statusMessage = upstream.statusText;
    copyResponseHeaders(upstream, res);

    if (method === "HEAD" || upstream.status === 304) {
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
 * Local dev/preview keeps the browser on 127.0.0.1:5173 while serving the
 * canonical same-origin API path from production daopk.me.
 */
export function publicApiProxyServer(): PluginOption {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const targetUrl = publicApiProxyTargetUrl(req.url);
    if (targetUrl === null) {
      next();
      return;
    }

    void proxyPublicApiRequest(req, res, targetUrl);
  };

  return {
    name: "public-api-proxy-server",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
