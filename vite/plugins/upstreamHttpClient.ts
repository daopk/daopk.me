import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
} from "node:http";
import { request as httpsRequest } from "node:https";

export interface UpstreamHttpResponse {
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

export interface UpstreamHttpRequestOptions {
  readonly method?: "GET" | "HEAD";
  readonly headers?: Headers | Record<string, string>;
  readonly timeoutMs?: number;
  readonly family?: 4 | 6;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function requestHeaders(
  headers: Headers | Record<string, string> | undefined,
): OutgoingHttpHeaders | undefined {
  if (headers === undefined) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  return headers;
}

export function requestUpstreamUrl(
  targetUrl: string,
  options: UpstreamHttpRequestOptions = {},
): Promise<UpstreamHttpResponse> {
  const parsed = new URL(targetUrl);
  const request =
    parsed.protocol === "http:" ? httpRequest : parsed.protocol === "https:" ? httpsRequest : null;

  if (request === null) {
    return Promise.reject(new Error(`Unsupported upstream protocol: ${parsed.protocol}`));
  }

  return new Promise((resolve, reject) => {
    const req = request(
      {
        family: options.family,
        headers: requestHeaders(options.headers),
        hostname: parsed.hostname,
        method: options.method ?? "GET",
        path: `${parsed.pathname}${parsed.search}`,
        port: parsed.port.length > 0 ? Number(parsed.port) : undefined,
        protocol: parsed.protocol,
      },
      (upstream) => {
        const chunks: Buffer[] = [];

        upstream.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        upstream.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: upstream.headers,
            statusCode: upstream.statusCode ?? 502,
            statusMessage: upstream.statusMessage ?? "",
          });
        });
        upstream.on("error", reject);
      },
    );

    req.setTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => {
      req.destroy(new Error(`Upstream request timed out: ${targetUrl}`));
    });
    req.on("error", reject);
    req.end();
  });
}
