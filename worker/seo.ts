import { isbot } from "isbot";

export interface AssetBinding {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface SeoWorkerEnv {
  ASSETS: AssetBinding;
}

const BLOG_ROUTE_PATTERN = /^\/blog\/([^/]+)$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SEO_BLOG_INDEX_ASSET_MARKER = '<meta name="x-daopk-seo-asset" content="blog-index" />';
const SEO_BLOG_POST_ASSET_MARKER = '<meta name="x-daopk-seo-asset" content="blog-post" />';

function appendVary(value: string | null, token: string): string {
  if (value === null || value.trim().length === 0) {
    return token;
  }

  const parts = value.split(",").map((part) => part.trim().toLowerCase());
  return parts.includes(token.toLowerCase()) ? value : `${value}, ${token}`;
}

function noIndexResponse(message: string, status = 404): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/plain;charset=utf-8",
      Vary: "User-Agent",
      "X-Robots-Tag": "noindex",
    },
  });
}

function withCrawlerHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Vary", appendVary(headers.get("Vary"), "User-Agent"));
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function isCrawlerRequest(request: Request): boolean {
  return isbot(request.headers.get("User-Agent"));
}

function blogSlugFromPathname(pathname: string): string | null {
  const slug = BLOG_ROUTE_PATTERN.exec(pathname)?.[1] ?? null;
  return slug !== null && SLUG_PATTERN.test(slug) ? slug : null;
}

function responseFromHtml(html: string | null, response: Response): Response {
  return new Response(html, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

async function fetchSeoPage(
  request: Request,
  env: SeoWorkerEnv,
  pathname: string,
  marker: string,
  missingMessage: string,
): Promise<Response> {
  const assetUrl = new URL(pathname, request.url);
  const assetRequest = new Request(assetUrl, request);
  const response = await env.ASSETS.fetch(
    assetRequest.method === "HEAD" ? new Request(assetRequest, { method: "GET" }) : assetRequest,
  );

  if (response.status === 404) {
    return noIndexResponse(missingMessage);
  }

  const html = await response.text();
  if (!html.includes(marker)) {
    return noIndexResponse(missingMessage);
  }

  return withCrawlerHeaders(responseFromHtml(request.method === "HEAD" ? null : html, response));
}

async function fetchSeoIndex(request: Request, env: SeoWorkerEnv): Promise<Response> {
  return fetchSeoPage(
    request,
    env,
    "/__seo/blog-index",
    SEO_BLOG_INDEX_ASSET_MARKER,
    "Blog index not found.",
  );
}

async function fetchSeoPost(request: Request, env: SeoWorkerEnv, slug: string): Promise<Response> {
  return fetchSeoPage(
    request,
    env,
    `/__seo/blog/${slug}`,
    SEO_BLOG_POST_ASSET_MARKER,
    "Blog post not found.",
  );
}

export async function handleRequest(request: Request, env: SeoWorkerEnv): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/__seo/")) {
    return noIndexResponse("Not found.");
  }

  if (url.pathname !== "/blog" && !url.pathname.startsWith("/blog/")) {
    return env.ASSETS.fetch(request);
  }

  if (!isCrawlerRequest(request)) {
    return env.ASSETS.fetch(request);
  }

  if (url.pathname === "/blog") {
    return fetchSeoIndex(request, env);
  }

  const slug = blogSlugFromPathname(url.pathname);
  if (slug === null) {
    return noIndexResponse("Blog post not found.");
  }

  return fetchSeoPost(request, env, slug);
}

export default {
  fetch: handleRequest,
};
