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

/** R2 bucket binding we additionally enumerate via `list()`. */
export interface R2ListableBucket extends R2Bucket {
  list(options?: R2ListOptions): Promise<R2Objects>;
}

/** R2 bucket binding we additionally write to via `put()`. */
export interface R2WritableListableBucket extends R2ListableBucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

export interface WorkerEnv {
  ASSETS: AssetBinding;
  /** R2 bucket holding the published blog content + prerendered SEO pages. */
  BLOG: R2Bucket;
  /** R2 bucket holding gallery images served verbatim under `/_worker/photos/*`. */
  PHOTOS: R2WritableListableBucket;
  /** R2 bucket holding files surfaced as a read-only Finder cloud drive. */
  FILES: R2ListableBucket;
  /**
   * R2 bucket holding independently-published first-party apps: the catalog at
   * `index.json` plus immutable, release-pinned modules at `<id>/<version+build>/*`.
   * Served under `/apps/*` so an app republish never touches the shell bundle.
   */
  APPS: R2Bucket;
}

const BLOG_ROUTE_PATTERN = /^\/blog\/([^/]+)$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const WORKER_PREFIX = "/_worker";
const WORKER_BLOG_INDEX_PATHNAME = `${WORKER_PREFIX}/blog/index.json`;
const WORKER_BLOG_POST_FILE_PATTERN = /^\/_worker\/blog\/([a-z0-9-]+)\.md$/;
const WORKER_BLOG_THUMBNAIL_PATTERN =
  /^\/_worker\/blog\/thumbnails\/([a-z0-9-]+)\/([A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp))$/i;
const LEGACY_BLOG_INDEX_PATHNAME = "/blog/index.json";
const LEGACY_BLOG_POST_FILE_PATTERN = /^\/blog\/([a-z0-9-]+)\.md$/;

// R2 object keys (mirrors the layout produced by scripts/build-blog-bundle.mjs).
const R2_INDEX_KEY = "index.json";
const R2_SITEMAP_KEY = "sitemap.xml";
const R2_SEO_INDEX_KEY = "seo/blog-index.html";

const DEFAULT_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const BLOG_THUMBNAIL_CACHE_CONTROL = "public, max-age=31536000, immutable";
const CROSS_ORIGIN_ISOLATION_HEADERS = {
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Opener-Policy": "same-origin",
};

// First-party apps published independently of the shell. The catalog (mutable,
// revalidated) lives at the APPS bucket root; release-pinned modules are
// immutable. R2 keys are the request path minus the `/apps/` prefix, so
// `/apps/index.json` -> `index.json` and `/apps/notes/1.0.0+123/notes.js` ->
// `notes/1.0.0+123/notes.js` (the layout the per-app CI uploads).
const APPS_CATALOG_PATHNAME = "/apps/index.json";
const APPS_CATALOG_KEY = "index.json";
// `<id>/<version+build>/<file>.{js,css,map}` — mirrors the host loader's ENTRY_PATTERN
// (src/core/apps/firstParty/catalog.ts) but also allows sibling css/sourcemaps.
const APP_MODULE_PATTERN =
  /^\/apps\/([a-z0-9][a-z0-9-]*\/[0-9A-Za-z.+-]+\/[A-Za-z0-9._/-]+\.(?:js|css|map))$/;
const APP_MODULE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// Photo gallery served verbatim from the PHOTOS bucket under /_worker/photos/*.
const PHOTOS_BASE_PATHNAME = `${WORKER_PREFIX}/photos`;
const PHOTOS_INDEX_PATHNAME = `${PHOTOS_BASE_PATHNAME}/index.json`;
const PHOTO_FILE_PATTERN =
  /^\/_worker\/photos\/([a-z0-9][a-z0-9/_-]*\.(?:jpe?g|png|webp|gif|avif))$/i;
const PHOTO_CACHE_CONTROL = "public, max-age=3600";

// On-the-fly thumbnails: each (key, width) is resized once via Cloudflare Image
// Resizing, then persisted under this prefix so later hits are plain R2 reads.
const PHOTO_THUMB_WIDTHS = new Set([400, 800, 1600]);
const PHOTO_THUMB_PREFIX = "thumbnails/";
const PHOTO_THUMB_CACHE_CONTROL = "public, max-age=31536000, immutable";

// Read-only Finder cloud drive from the FILES bucket under /_worker/files/*.
const FILES_INDEX_PATHNAME = `${WORKER_PREFIX}/files/index.json`;
const FILES_RAW_PREFIX = `${WORKER_PREFIX}/files/raw/`;
const FILES_CACHE_CONTROL = "public, max-age=3600";

function appendVary(value: string | null, token: string): string {
  if (value === null || value.trim().length === 0) {
    return token;
  }

  const parts = value.split(",").map((part) => part.trim().toLowerCase());
  return parts.includes(token.toLowerCase()) ? value : `${value}, ${token}`;
}

function encodeR2KeyPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function decodeRouteKey(encoded: string): string | null {
  try {
    const key = decodeURIComponent(encoded);
    if (key.length === 0 || key.startsWith("/") || key.endsWith("/")) {
      return null;
    }
    if (
      key.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
    ) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

function withCrossOriginIsolation(response: Response): Response {
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

function r2Headers(
  object: R2ObjectBody,
  contentType: string,
  cacheControl: string = DEFAULT_CACHE_CONTROL,
): Headers {
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", cacheControl);
  if (object.httpEtag !== undefined) {
    headers.set("ETag", object.httpEtag);
  }
  return headers;
}

/** Serve a stored R2 object verbatim, or `null` when the key is missing. */
async function serveR2Asset(
  bucket: R2Bucket,
  key: string,
  contentType: string,
  request: Request,
  cacheControl: string = DEFAULT_CACHE_CONTROL,
): Promise<Response | null> {
  const object = await bucket.get(key);
  if (object === null) {
    return null;
  }

  const body = request.method === "HEAD" ? null : object.body;
  return new Response(body, { headers: r2Headers(object, contentType, cacheControl) });
}

/** Content type for a first-party app module key (defaults to JS). */
function appModuleContentType(key: string): string {
  if (key.endsWith(".css")) return "text/css;charset=utf-8";
  if (key.endsWith(".map")) return "application/json;charset=utf-8";
  return "text/javascript;charset=utf-8";
}

function blogThumbnailContentType(key: string): string {
  const lowerKey = key.toLowerCase();
  if (lowerKey.endsWith(".png")) return "image/png";
  if (lowerKey.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
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

export interface FilesIndexEntry {
  readonly key: string;
  readonly kind: "file" | "directory";
  readonly size: number;
  readonly uploaded: string;
  readonly url?: string;
  readonly contentType?: string;
}

/** Enumerate the PHOTOS bucket (paginated) into a newest-first gallery index. */
async function buildPhotosIndex(env: WorkerEnv): Promise<PhotosIndexEntry[]> {
  const entries: PhotosIndexEntry[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.PHOTOS.list({ cursor, include: ["httpMetadata"] });
    for (const object of page.objects) {
      // Derived thumbnails live in the same bucket; never list them as photos.
      if (object.key.startsWith(PHOTO_THUMB_PREFIX)) {
        continue;
      }
      // Only surface keys the image route can actually serve. This skips the
      // zero-byte `prefix/` folder markers the R2 dashboard creates and any
      // non-image objects, keeping the index in sync with `servePhoto`.
      if (!PHOTO_FILE_PATTERN.test(`${PHOTOS_BASE_PATHNAME}/${object.key}`)) {
        continue;
      }

      entries.push({
        key: object.key,
        url: `${PHOTOS_BASE_PATHNAME}/${encodeR2KeyPath(object.key)}`,
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

/** Enumerate the FILES bucket into a public, read-only Finder cloud-drive index. */
async function buildFilesIndex(env: WorkerEnv): Promise<FilesIndexEntry[]> {
  const entries: FilesIndexEntry[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.FILES.list({ cursor, include: ["httpMetadata"] });
    for (const object of page.objects) {
      const key = object.key;
      if (key.length === 0) {
        continue;
      }

      const uploaded = object.uploaded.toISOString();
      if (key.endsWith("/")) {
        entries.push({
          key,
          kind: "directory",
          size: 0,
          uploaded,
        });
        continue;
      }

      entries.push({
        key,
        kind: "file",
        size: object.size,
        uploaded,
        url: `${FILES_RAW_PREFIX}${encodeR2KeyPath(key)}`,
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

/** Serve a stored cloud-drive file from the FILES bucket, or a 404 when absent. */
async function serveFile(env: WorkerEnv, key: string, request: Request): Promise<Response> {
  const object = await env.FILES.get(key);
  if (object === null) {
    return noIndexResponse("File not found.");
  }

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/octet-stream");
  }
  headers.set("Cache-Control", FILES_CACHE_CONTROL);
  if (object.httpEtag !== undefined) {
    headers.set("ETag", object.httpEtag);
  }

  const body = request.method === "HEAD" ? null : object.body;
  return new Response(body, { headers });
}

/** `RequestInit` plus the Cloudflare-specific `cf.image` resize controls. */
interface CfImageRequestInit extends RequestInit {
  cf?: {
    image?: {
      width?: number;
      fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
      metadata?: "keep" | "copyright" | "none";
    };
  };
}

/**
 * Serve a width-constrained variant of a stored image. The first request for a
 * given size transforms the original via Cloudflare Image Resizing and writes
 * the result back to R2 under `thumbnails/<width>/`; later requests are plain
 * R2 reads. Falls back to the original bytes when resizing is unavailable.
 */
async function serveResizedPhoto(
  env: WorkerEnv,
  key: string,
  width: number,
  request: Request,
): Promise<Response> {
  const derivedKey = `${PHOTO_THUMB_PREFIX}${width}/${key}`;

  const cached = await env.PHOTOS.get(derivedKey);
  if (cached !== null) {
    const headers = new Headers();
    cached.writeHttpMetadata?.(headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/octet-stream");
    }
    headers.set("Cache-Control", PHOTO_THUMB_CACHE_CONTROL);
    if (cached.httpEtag !== undefined) {
      headers.set("ETag", cached.httpEtag);
    }
    return new Response(request.method === "HEAD" ? null : cached.body, { headers });
  }

  // Transform the original same-origin. The source URL carries no `?w`, so the
  // worker serves the unresized object and there is no resize recursion.
  const init: CfImageRequestInit = {
    cf: { image: { width, fit: "scale-down", metadata: "none" } },
  };
  const resized = await fetch(
    new URL(`${PHOTOS_BASE_PATHNAME}/${encodeR2KeyPath(key)}`, request.url),
    init,
  );
  if (!resized.ok) {
    return servePhoto(env, key, request);
  }

  const contentType = resized.headers.get("Content-Type") ?? "application/octet-stream";
  const bytes = await resized.arrayBuffer();
  await env.PHOTOS.put(derivedKey, bytes, { httpMetadata: { contentType } });

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", PHOTO_THUMB_CACHE_CONTROL);
  return new Response(request.method === "HEAD" ? null : bytes, { headers });
}

async function routeRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // Runtime content consumed by apps (any user agent) lives in R2 behind
  // /_worker/*, keeping human/crawler routes separate from raw content APIs.
  if (pathname === WORKER_BLOG_INDEX_PATHNAME) {
    return (
      (await serveR2Asset(env.BLOG, R2_INDEX_KEY, "application/json;charset=utf-8", request)) ??
      noIndexResponse("Blog index not found.")
    );
  }

  const postFile = WORKER_BLOG_POST_FILE_PATTERN.exec(pathname);
  if (postFile !== null) {
    return (
      (await serveR2Asset(
        env.BLOG,
        `posts/${postFile[1]}.md`,
        "text/markdown;charset=utf-8",
        request,
      )) ?? noIndexResponse("Blog post not found.")
    );
  }

  const thumbnailFile = WORKER_BLOG_THUMBNAIL_PATTERN.exec(pathname);
  if (thumbnailFile !== null) {
    const key = `thumbnails/${thumbnailFile[1]}/${thumbnailFile[2]}`;
    return (
      (await serveR2Asset(
        env.BLOG,
        key,
        blogThumbnailContentType(key),
        request,
        BLOG_THUMBNAIL_CACHE_CONTROL,
      )) ?? noIndexResponse("Blog thumbnail not found.")
    );
  }

  if (pathname === LEGACY_BLOG_INDEX_PATHNAME || LEGACY_BLOG_POST_FILE_PATTERN.test(pathname)) {
    return noIndexResponse("Blog content not found.");
  }

  // Sitemap is published to R2 too; fall back to static assets if absent.
  if (pathname === "/sitemap.xml") {
    return (
      (await serveR2Asset(env.BLOG, R2_SITEMAP_KEY, "application/xml;charset=utf-8", request)) ??
      env.ASSETS.fetch(request)
    );
  }

  // First-party app catalog + immutable, release-pinned modules from the APPS
  // bucket. Must run before the static-asset catch-all so module requests are
  // not answered with the SPA fallback HTML.
  if (pathname === APPS_CATALOG_PATHNAME) {
    return (
      (await serveR2Asset(env.APPS, APPS_CATALOG_KEY, "application/json;charset=utf-8", request)) ??
      noIndexResponse("App catalog not found.")
    );
  }

  const appModuleKey = APP_MODULE_PATTERN.exec(pathname)?.[1] ?? null;
  if (appModuleKey !== null && !appModuleKey.includes("..")) {
    return (
      (await serveR2Asset(
        env.APPS,
        appModuleKey,
        appModuleContentType(appModuleKey),
        request,
        APP_MODULE_CACHE_CONTROL,
      )) ?? noIndexResponse("App module not found.")
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
    // Derived variants are an internal cache; they are never served directly.
    if (photoKey.startsWith(PHOTO_THUMB_PREFIX)) {
      return noIndexResponse("Photo not found.");
    }
    const width = Number(url.searchParams.get("w"));
    if (PHOTO_THUMB_WIDTHS.has(width)) {
      return serveResizedPhoto(env, photoKey, width, request);
    }
    return servePhoto(env, photoKey, request);
  }

  if (pathname === FILES_INDEX_PATHNAME) {
    const index = await buildFilesIndex(env);
    return new Response(JSON.stringify(index), {
      headers: {
        "Cache-Control": DEFAULT_CACHE_CONTROL,
        "Content-Type": "application/json;charset=utf-8",
      },
    });
  }

  if (pathname.startsWith(FILES_RAW_PREFIX)) {
    const key = decodeRouteKey(pathname.slice(FILES_RAW_PREFIX.length));
    if (key === null) {
      return noIndexResponse("File not found.");
    }
    return serveFile(env, key, request);
  }

  if (pathname === WORKER_PREFIX || pathname.startsWith(`${WORKER_PREFIX}/`)) {
    return noIndexResponse("Worker route not found.");
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

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  return withCrossOriginIsolation(await routeRequest(request, env));
}

export default {
  fetch: handleRequest,
};
