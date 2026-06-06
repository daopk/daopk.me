export const DEFAULT_CACHE_CONTROL = "public, max-age=0, must-revalidate";

const CROSS_ORIGIN_ISOLATION_HEADERS = {
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export function withCrossOriginIsolation(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CROSS_ORIGIN_ISOLATION_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function noIndexResponse(message: string, status = 404): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": DEFAULT_CACHE_CONTROL,
      "Content-Type": "text/plain;charset=utf-8",
      Vary: "User-Agent",
      "X-Robots-Tag": "noindex",
    },
  });
}
