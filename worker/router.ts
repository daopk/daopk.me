import { isbot } from "isbot";

import { noIndexResponse, withCrossOriginIsolation } from "./http";
import type { WorkerEnv } from "./types";

export type { AssetBinding, WorkerEnv } from "./types";

const BLOG_SEO_PATH_PATTERN = /^\/blog(?:\/[a-z0-9-]+)?$/;
const MEDIA_SEO_PATH_PATTERN =
  /^\/(?:vi\/)?(?:movie|tv)\/[0-9]+-[a-z0-9-]+(?:\/season\/[0-9]+(?:\/episode\/[0-9]+)?)?$/;
const MEDIA_SITEMAP_PATTERN = /^\/sitemap-media-(?:en|vi)-[0-9]{4}\.xml$/;

export function isCrawlerRequest(request: Request): boolean {
  return isbot(request.headers.get("User-Agent"));
}

export function isInternalProxyRequest(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  const pathname = new URL(request.url).pathname;
  if (isSitemapPath(pathname)) {
    return true;
  }

  return isCrawlerRequest(request) && isSeoHtmlPath(pathname);
}

async function routeRequest(request: Request, env: WorkerEnv): Promise<Response> {
  if (isInternalProxyRequest(request)) {
    return proxyInternalRequest(request, env);
  }

  return env.ASSETS.fetch(request);
}

async function proxyInternalRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const token = env.INTERNAL_API_TOKEN;
  if (token === undefined || token.length === 0) {
    return noIndexResponse("Internal API token is not configured.", 500);
  }
  if (env.INTERNAL_API_BASE_URL === undefined || env.INTERNAL_API_BASE_URL.length === 0) {
    return noIndexResponse("Internal API base URL is not configured.", 500);
  }

  const incomingUrl = new URL(request.url);
  const baseUrl = env.INTERNAL_API_BASE_URL.replace(/\/+$/, "");
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", request.headers.get("Accept") ?? "*/*");

  const userAgent = request.headers.get("User-Agent");
  if (userAgent !== null) {
    headers.set("User-Agent", userAgent);
  }

  return fetch(`${baseUrl}/internal${incomingUrl.pathname}${incomingUrl.search}`, {
    headers,
    method: request.method,
  });
}

function isSitemapPath(pathname: string): boolean {
  return (
    pathname === "/sitemap.xml" ||
    pathname === "/sitemap-media.xml" ||
    MEDIA_SITEMAP_PATTERN.test(pathname)
  );
}

function isSeoHtmlPath(pathname: string): boolean {
  return BLOG_SEO_PATH_PATTERN.test(pathname) || MEDIA_SEO_PATH_PATTERN.test(pathname);
}

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  return withCrossOriginIsolation(await routeRequest(request, env));
}

export default {
  fetch: handleRequest,
};
