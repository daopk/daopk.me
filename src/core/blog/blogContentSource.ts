import { debugWarn } from "~/core/debug";
import { BLOG_CONTENT_BASE, blogRawIndexUrl, blogRawPostUrl } from "~/core/blog/blogContentConfig";
import { BLOG_POSTS_ROOT, blogPostPathFromSlug, isBlogPostSlug } from "~/core/routing/blogPaths";
import { VfsError } from "~/core/vfs/errors";

export const BLOG_INDEX_CACHE_PATH = `${BLOG_POSTS_ROOT}/index.json`;
export const BLOG_POST_MIME_TYPE = "text/markdown;charset=utf-8";
const BLOG_INDEX_MIME_TYPE = "application/json;charset=utf-8";

/** Minimal post metadata shipped in `blog/index.json`. */
export interface BlogIndexEntry {
  readonly slug: string;
  readonly title: string | null;
  readonly date: string | null;
  readonly description: string | null;
}

/** VFS surface the content source needs for its read-through cache. */
export interface BlogContentVfs {
  readText(path: string): Promise<string | null>;
  writeText(
    path: string,
    text: string,
    options?: { readonly overwrite?: boolean; readonly mimeType?: string },
  ): Promise<unknown>;
  mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<unknown>;
}

export interface BlogContentSourceOptions {
  readonly vfs: BlogContentVfs;
  /** Overridable for tests; defaults to `globalThis.fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** Overridable content base; defaults to {@link BLOG_CONTENT_BASE}. */
  readonly rawBase?: string;
}

export interface BlogContentSource {
  /** Parsed cached index, or `null` when nothing is cached yet. */
  readIndexCache(): Promise<readonly BlogIndexEntry[] | null>;
  /** Fetch the index from the network and refresh the cache. Throws on failure. */
  fetchIndex(): Promise<readonly BlogIndexEntry[]>;
  /** Cached markdown source for a slug, or `null` when not cached. */
  readPostCache(slug: string): Promise<string | null>;
  /** Fetch a post from the network; `null` means 404. Throws on other failures. */
  fetchPost(slug: string): Promise<string | null>;
}

/** Network/transport failure (offline, non-OK status, fetch unavailable). */
export class BlogNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BlogNetworkError";
  }
}

function isVfsNotFound(error: unknown): boolean {
  return (
    error instanceof VfsError && (error.code === "NOT_FOUND" || error.code === "MOUNT_NOT_FOUND")
  );
}

function parseIndexEntries(raw: string): readonly BlogIndexEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(data)) {
    return [];
  }

  const entries: BlogIndexEntry[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const slug = typeof record.slug === "string" ? record.slug : null;
    if (slug === null || !isBlogPostSlug(slug)) {
      continue;
    }

    entries.push({
      slug,
      title: typeof record.title === "string" && record.title.length > 0 ? record.title : null,
      date: typeof record.date === "string" ? record.date : null,
      description:
        typeof record.description === "string" && record.description.length > 0
          ? record.description
          : null,
    });
  }

  return entries;
}

export function createBlogContentSource(options: BlogContentSourceOptions): BlogContentSource {
  const { vfs } = options;
  const fetchImpl =
    options.fetch ??
    (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
  const rawBase = options.rawBase ?? BLOG_CONTENT_BASE;

  let cacheRootReady: Promise<void> | undefined;

  async function ensureCacheRoot(): Promise<void> {
    cacheRootReady ??= (async (): Promise<void> => {
      try {
        await vfs.mkdir(BLOG_POSTS_ROOT, { recursive: true });
      } catch (error) {
        debugWarn("[blog] failed to ensure cache root", error);
      }
    })();

    await cacheRootReady;
  }

  // Cache writes are best-effort: a failed write must never break reading.
  async function writeCache(path: string, text: string, mimeType: string): Promise<void> {
    try {
      await ensureCacheRoot();
      await vfs.writeText(path, text, { overwrite: true, mimeType });
    } catch (error) {
      debugWarn("[blog] failed to write content cache", path, error);
    }
  }

  async function readCacheText(path: string): Promise<string | null> {
    try {
      return await vfs.readText(path);
    } catch (error) {
      if (isVfsNotFound(error)) {
        return null;
      }
      debugWarn("[blog] failed to read content cache", path, error);
      return null;
    }
  }

  async function fetchText(url: string, accept: string): Promise<Response> {
    if (fetchImpl === undefined) {
      throw new BlogNetworkError("fetch is unavailable in this environment");
    }

    try {
      return await fetchImpl(url, { headers: { Accept: accept } });
    } catch (error) {
      throw new BlogNetworkError(`Request failed: ${url}`, { cause: error });
    }
  }

  return {
    async readIndexCache(): Promise<readonly BlogIndexEntry[] | null> {
      const raw = await readCacheText(BLOG_INDEX_CACHE_PATH);
      return raw === null ? null : parseIndexEntries(raw);
    },

    async fetchIndex(): Promise<readonly BlogIndexEntry[]> {
      const response = await fetchText(blogRawIndexUrl(rawBase), "application/json");
      if (!response.ok) {
        throw new BlogNetworkError(`Blog index fetch failed (${response.status})`);
      }

      const raw = await response.text();
      const entries = parseIndexEntries(raw);
      await writeCache(BLOG_INDEX_CACHE_PATH, raw, BLOG_INDEX_MIME_TYPE);
      return entries;
    },

    async readPostCache(slug: string): Promise<string | null> {
      const path = blogPostPathFromSlug(slug);
      return path === null ? null : readCacheText(path);
    },

    async fetchPost(slug: string): Promise<string | null> {
      const path = blogPostPathFromSlug(slug);
      if (path === null) {
        return null;
      }

      const response = await fetchText(blogRawPostUrl(slug, rawBase), "text/markdown, text/plain");
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new BlogNetworkError(`Blog post fetch failed (${response.status})`);
      }

      const text = await response.text();
      await writeCache(path, text, BLOG_POST_MIME_TYPE);
      return text;
    },
  };
}
