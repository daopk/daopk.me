import { isbot } from "isbot";

export interface AssetBinding {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

/** Minimal slice of the Cloudflare R2 object we rely on. */
export interface R2ObjectBody {
  readonly body: ReadableStream | null;
  readonly httpEtag?: string;
  writeHttpMetadata?(headers: Headers): void;
}

/** Minimal slice of an R2 object's listing metadata (no body). */
export interface R2Object {
  readonly key: string;
  readonly size: number;
  readonly uploaded: Date;
  readonly httpMetadata?: { contentType?: string };
}

/** Minimal slice of the Cloudflare R2 `list()` result we rely on. */
export interface R2Objects {
  readonly objects: readonly R2Object[];
  readonly truncated: boolean;
  readonly cursor?: string;
}

export interface R2ListOptions {
  readonly prefix?: string;
  readonly cursor?: string;
  readonly include?: readonly "httpMetadata"[];
}

/** Minimal slice of the Cloudflare R2 bucket binding we rely on. */
export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
}

/** R2 bucket binding that we additionally enumerate via `list()`. */
export interface R2ListableBucket extends R2Bucket {
  list(options?: R2ListOptions): Promise<R2Objects>;
}

export interface WorkerEnv {
  ASSETS: AssetBinding;
  /** R2 bucket holding the published blog content + prerendered SEO pages. */
  BLOG: R2Bucket;
  /** R2 bucket holding gallery images served verbatim under `/photos/*`. */
  PHOTOS: R2ListableBucket;
}

const BLOG_ROUTE_PATTERN = /^\/blog\/([^/]+)$/;
const BLOG_POST_FILE_PATTERN = /^\/blog\/([a-z0-9-]+)\.md$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/;

// R2 object keys (mirrors the layout produced by scripts/build-blog-bundle.mjs).
const R2_INDEX_KEY = "index.json";
const R2_SITEMAP_KEY = "sitemap.xml";
const R2_SEO_INDEX_KEY = "seo/blog-index.html";

const DEFAULT_CACHE_CONTROL = "public, max-age=0, must-revalidate";

// Photo gallery served verbatim from the PHOTOS bucket under /photos/*.
const PHOTOS_INDEX_PATHNAME = "/photos/index.json";
const PHOTO_FILE_PATTERN = /^\/photos\/([a-z0-9][a-z0-9/_-]*\.(?:jpe?g|png|webp|gif|avif))$/i;
const PHOTO_CACHE_CONTROL = "public, max-age=3600";

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

export function isCrawlerRequest(request: Request): boolean {
  return isbot(request.headers.get("User-Agent"));
}

function blogSlugFromPathname(pathname: string): string | null {
  const slug = BLOG_ROUTE_PATTERN.exec(pathname)?.[1] ?? null;
  return slug !== null && SLUG_PATTERN.test(slug) ? slug : null;
}

function r2Headers(object: R2ObjectBody, contentType: string): Headers {
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", DEFAULT_CACHE_CONTROL);
  if (object.httpEtag !== undefined) {
    headers.set("ETag", object.httpEtag);
  }
  return headers;
}

/** Serve a stored R2 object verbatim, or `null` when the key is missing. */
async function serveR2Asset(
  env: WorkerEnv,
  key: string,
  contentType: string,
  request: Request,
): Promise<Response | null> {
  const object = await env.BLOG.get(key);
  if (object === null) {
    return null;
  }

  const body = request.method === "HEAD" ? null : object.body;
  return new Response(body, { headers: r2Headers(object, contentType) });
}

/** Serve a prerendered SEO page from R2 with crawler caching hints. */
async function serveSeoPage(
  env: WorkerEnv,
  key: string,
  request: Request,
  missingMessage: string,
): Promise<Response> {
  const object = await env.BLOG.get(key);
  if (object === null) {
    return noIndexResponse(missingMessage);
  }

  const headers = r2Headers(object, "text/html;charset=utf-8");
  headers.set("Vary", appendVary(headers.get("Vary"), "User-Agent"));
  const body = request.method === "HEAD" ? null : object.body;
  return new Response(body, { headers });
}

export interface PhotosIndexEntry {
  readonly key: string;
  readonly url: string;
  readonly size: number;
  readonly uploaded: string;
  readonly contentType: string;
}

/** Enumerate the PHOTOS bucket (paginated) into a newest-first gallery index. */
async function buildPhotosIndex(env: WorkerEnv): Promise<PhotosIndexEntry[]> {
  const entries: PhotosIndexEntry[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.PHOTOS.list({ cursor, include: ["httpMetadata"] });
    for (const object of page.objects) {
      entries.push({
        key: object.key,
        url: `/photos/${object.key}`,
        size: object.size,
        uploaded: object.uploaded.toISOString(),
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);

  entries.sort((a, b) => b.uploaded.localeCompare(a.uploaded));
  return entries;
}

/** Serve a stored image verbatim from the PHOTOS bucket, or a 404 when absent. */
async function servePhoto(env: WorkerEnv, key: string, request: Request): Promise<Response> {
  const object = await env.PHOTOS.get(key);
  if (object === null) {
    return noIndexResponse("Photo not found.");
  }

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/octet-stream");
  }
  headers.set("Cache-Control", PHOTO_CACHE_CONTROL);
  if (object.httpEtag !== undefined) {
    headers.set("ETag", object.httpEtag);
  }

  const body = request.method === "HEAD" ? null : object.body;
  return new Response(body, { headers });
}

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // Runtime content consumed by the app (any user agent) lives in R2.
  if (pathname === "/blog/index.json") {
    return (
      (await serveR2Asset(env, R2_INDEX_KEY, "application/json;charset=utf-8", request)) ??
      noIndexResponse("Blog index not found.")
    );
  }

  const postFile = BLOG_POST_FILE_PATTERN.exec(pathname);
  if (postFile !== null) {
    return (
      (await serveR2Asset(
        env,
        `posts/${postFile[1]}.md`,
        "text/markdown;charset=utf-8",
        request,
      )) ?? noIndexResponse("Blog post not found.")
    );
  }

  // Sitemap is published to R2 too; fall back to static assets if absent.
  if (pathname === "/sitemap.xml") {
    return (
      (await serveR2Asset(env, R2_SITEMAP_KEY, "application/xml;charset=utf-8", request)) ??
      env.ASSETS.fetch(request)
    );
  }

  // Photo gallery: a dynamic index built from the bucket listing, plus the
  // image bytes themselves. Both are served same-origin to any user agent.
  if (pathname === PHOTOS_INDEX_PATHNAME) {
    const index = await buildPhotosIndex(env);
    return new Response(JSON.stringify(index), {
      headers: {
        "Cache-Control": DEFAULT_CACHE_CONTROL,
        "Content-Type": "application/json;charset=utf-8",
      },
    });
  }

  const photoKey = PHOTO_FILE_PATTERN.exec(pathname)?.[1] ?? null;
  if (photoKey !== null) {
    return servePhoto(env, photoKey, request);
  }

  // Everything outside /blog is a normal static asset / SPA route.
  if (pathname !== "/blog" && !pathname.startsWith("/blog/")) {
    return env.ASSETS.fetch(request);
  }

  // Humans load the SPA; crawlers get prerendered HTML served from R2.
  if (!isCrawlerRequest(request)) {
    return env.ASSETS.fetch(request);
  }

  if (pathname === "/blog") {
    return serveSeoPage(env, R2_SEO_INDEX_KEY, request, "Blog index not found.");
  }

  const slug = blogSlugFromPathname(pathname);
  if (slug === null) {
    return noIndexResponse("Blog post not found.");
  }

  return serveSeoPage(env, `seo/posts/${slug}.html`, request, "Blog post not found.");
}

export default {
  fetch: handleRequest,
};
