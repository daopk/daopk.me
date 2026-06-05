import type { IncomingMessage, ServerResponse } from "node:http";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

import type { Connect, PluginOption } from "vite";

import { requestUpstreamUrl, type UpstreamHttpResponse } from "./upstreamHttpClient";

/**
 * In production the Worker serves `/_worker/blog/*` from R2. Vite has neither,
 * so this plugin serves the same paths from the local `blog/` folder during
 * `dev` and `preview`. Post markdown stays local, while published thumbnail
 * metadata/images are reused when available so local post detail covers match
 * production without regenerating images.
 */
export interface DevBlogPost {
  slug: string;
  metadata: { title: string | null; date: string | null; description: string | null };
}

interface DevBlogThumbnail {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface DevBlogIndexEntry {
  readonly slug: string;
  readonly title: string | null;
  readonly date: string | null;
  readonly description: string | null;
  readonly thumbnail: DevBlogThumbnail | null;
}

const BLOG_ORIGIN = "https://daopk.me";
const BLOG_THUMBNAIL_PATTERN =
  /^\/_worker\/blog\/thumbnails\/([a-z0-9-]+)\/[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp)$/i;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDevBlogThumbnail(value: unknown, slug: string): value is DevBlogThumbnail {
  if (!isRecord(value)) {
    return false;
  }

  const match = typeof value.url === "string" ? BLOG_THUMBNAIL_PATTERN.exec(value.url) : null;
  return (
    match !== null &&
    match[1] === slug &&
    typeof value.alt === "string" &&
    value.alt.length > 0 &&
    value.width === 1024 &&
    value.height === 576
  );
}

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

function copyResponseHeaders(upstream: UpstreamHttpResponse, res: ServerResponse): void {
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (value === undefined) {
      continue;
    }
    if (!OMITTED_RESPONSE_HEADERS.has(name.toLowerCase())) {
      res.setHeader(name, value);
    }
  }
}

function imageContentType(extension: string): string {
  switch (extension.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export function blogThumbnailProxyTargetUrl(
  requestUrl: string | undefined,
  origin = BLOG_ORIGIN,
): string | null {
  if (requestUrl === undefined) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(requestUrl, BLOG_ORIGIN);
  } catch {
    return null;
  }

  if (!BLOG_THUMBNAIL_PATTERN.test(parsed.pathname)) {
    return null;
  }

  return new URL(`${parsed.pathname}${parsed.search}`, origin).toString();
}

export function buildDevBlogIndex(
  posts: readonly DevBlogPost[],
  thumbnailEntries: readonly unknown[] = [],
): DevBlogIndexEntry[] {
  const thumbnailsBySlug = new Map<string, DevBlogThumbnail>();

  for (const entry of thumbnailEntries) {
    if (!isRecord(entry) || typeof entry.slug !== "string") {
      continue;
    }
    if (isDevBlogThumbnail(entry.thumbnail, entry.slug)) {
      thumbnailsBySlug.set(entry.slug, entry.thumbnail);
    }
  }

  return posts.map((post) => ({
    slug: post.slug,
    title: post.metadata.title,
    date: post.metadata.date,
    description: post.metadata.description,
    thumbnail: thumbnailsBySlug.get(post.slug) ?? null,
  }));
}

async function readJsonArrayIfExists(file: string): Promise<readonly unknown[]> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchPublishedBlogIndex(): Promise<readonly unknown[]> {
  try {
    const response = await requestUpstreamUrl(
      new URL("/_worker/blog/index.json", BLOG_ORIGIN).toString(),
      {
        family: 4,
        headers: { Accept: "application/json" },
        timeoutMs: 1500,
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return [];
    }
    const parsed: unknown = JSON.parse(response.body.toString("utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function thumbnailEntries(distIndexFile: string): Promise<readonly unknown[]> {
  const [publishedEntries, localEntries] = await Promise.all([
    fetchPublishedBlogIndex(),
    readJsonArrayIfExists(distIndexFile),
  ]);

  return [...publishedEntries, ...localEntries];
}

async function proxyBlogThumbnailRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: string,
): Promise<void> {
  try {
    const upstream = await requestUpstreamUrl(targetUrl, {
      family: 4,
      headers: forwardedHeaders(req),
      method: req.method === "HEAD" ? "HEAD" : "GET",
    });

    res.statusCode = upstream.statusCode;
    res.statusMessage = upstream.statusMessage;
    copyResponseHeaders(upstream, res);

    if (req.method === "HEAD" || upstream.statusCode === 304) {
      res.end();
      return;
    }

    res.setHeader("Content-Length", String(upstream.body.byteLength));
    res.end(upstream.body);
  } catch (error) {
    res.statusCode = 502;
    res.end(error instanceof Error ? error.message : String(error));
  }
}

export function blogContentDevServer(): PluginOption {
  const postsDir = fileURLToPath(new URL("../../blog", import.meta.url));
  const blogDistDir = fileURLToPath(new URL("../../blog-dist", import.meta.url));
  const blogLibUrl = new URL("../../scripts/lib/blogPosts.mjs", import.meta.url).href;
  const postFilePattern = /^\/_worker\/blog\/([a-z0-9-]+)\.md$/;

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const pathname = (req.url ?? "").split("?")[0];

    if (pathname === "/_worker/blog/index.json") {
      void (async () => {
        try {
          const { readBlogPosts, comparePostsNewestFirst } = await import(blogLibUrl);
          const posts = (await readBlogPosts(postsDir)).sort(
            comparePostsNewestFirst,
          ) as DevBlogPost[];
          const index = buildDevBlogIndex(
            posts,
            await thumbnailEntries(join(blogDistDir, "index.json")),
          );
          res.setHeader("Content-Type", "application/json;charset=utf-8");
          res.end(JSON.stringify(index));
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      })();
      return;
    }

    const match = postFilePattern.exec(pathname);
    if (match !== null) {
      void (async () => {
        try {
          const markdown = await readFile(join(postsDir, `${match[1]}.md`), "utf8");
          res.setHeader("Content-Type", "text/markdown;charset=utf-8");
          res.end(markdown);
        } catch {
          res.statusCode = 404;
          res.end("Not found");
        }
      })();
      return;
    }

    const thumbnailTargetUrl = blogThumbnailProxyTargetUrl(req.url);
    if (thumbnailTargetUrl !== null) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET, HEAD");
        res.end("Method not allowed");
        return;
      }

      void (async () => {
        const thumbnailPath = pathname.replace("/_worker/blog/", "");
        const extension = thumbnailPath.split(".").at(-1) ?? "";
        try {
          const bytes = await readFile(join(blogDistDir, thumbnailPath));
          res.setHeader("Content-Type", imageContentType(extension));
          res.setHeader("Content-Length", String(bytes.byteLength));
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          res.end(bytes);
        } catch {
          await proxyBlogThumbnailRequest(req, res, thumbnailTargetUrl);
        }
      })();
      return;
    }

    next();
  };

  return {
    name: "blog-content-dev-server",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
