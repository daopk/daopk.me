import { beforeEach, describe, expect, it, vi } from "vitest";

import { VfsError } from "~/core/vfs/errors";

import {
  BLOG_INDEX_CACHE_PATH,
  BlogNetworkError,
  createBlogContentSource,
  type BlogContentVfs,
} from "./blogContentSource";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const RAW_BASE = "https://example.test/blog";

interface FakeVfs extends BlogContentVfs {
  readText: ReturnType<typeof vi.fn>;
  writeText: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  store: Map<string, string>;
}

function makeVfs(initial: Record<string, string> = {}): FakeVfs {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    readText: vi.fn(async (path: string) => store.get(path) ?? null),
    writeText: vi.fn(async (path: string, text: string) => {
      store.set(path, text);
      return null;
    }),
    mkdir: vi.fn(async () => null),
  };
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function createSource(vfs: BlogContentVfs, fetchImpl: typeof globalThis.fetch) {
  return createBlogContentSource({ vfs, fetch: fetchImpl, rawBase: RAW_BASE });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createBlogContentSource — index", () => {
  it("fetches, parses, filters invalid slugs, and caches the raw manifest", async () => {
    const raw = JSON.stringify([
      { slug: "post-a", title: "Post A", date: "2026-05-01", description: "Desc A" },
      { slug: "Invalid Slug", title: "Skip me" },
      { slug: "post-b" },
    ]);
    const vfs = makeVfs();
    const fetchImpl = vi.fn(async () => textResponse(raw));
    const source = createSource(vfs, fetchImpl as unknown as typeof globalThis.fetch);

    const entries = await source.fetchIndex();

    expect(fetchImpl).toHaveBeenCalledWith(`${RAW_BASE}/index.json`, expect.any(Object));
    expect(entries).toEqual([
      { slug: "post-a", title: "Post A", date: "2026-05-01", description: "Desc A" },
      { slug: "post-b", title: null, date: null, description: null },
    ]);
    expect(vfs.mkdir).toHaveBeenCalledWith("/home/posts", { recursive: true });
    expect(vfs.writeText).toHaveBeenCalledWith(
      BLOG_INDEX_CACHE_PATH,
      raw,
      expect.objectContaining({ overwrite: true }),
    );
  });

  it("throws BlogNetworkError on a non-OK index response", async () => {
    const vfs = makeVfs();
    const fetchImpl = vi.fn(async () => textResponse("boom", 500));
    const source = createSource(vfs, fetchImpl as unknown as typeof globalThis.fetch);

    await expect(source.fetchIndex()).rejects.toBeInstanceOf(BlogNetworkError);
    expect(vfs.writeText).not.toHaveBeenCalled();
  });

  it("wraps a rejected fetch (offline) as BlogNetworkError", async () => {
    const vfs = makeVfs();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const source = createSource(vfs, fetchImpl as unknown as typeof globalThis.fetch);

    await expect(source.fetchIndex()).rejects.toBeInstanceOf(BlogNetworkError);
  });

  it("returns null from the cache when nothing is stored", async () => {
    const source = createSource(makeVfs(), vi.fn() as unknown as typeof globalThis.fetch);
    await expect(source.readIndexCache()).resolves.toBeNull();
  });

  it("parses a cached manifest", async () => {
    const vfs = makeVfs({
      [BLOG_INDEX_CACHE_PATH]: JSON.stringify([{ slug: "cached-post", title: "Cached" }]),
    });
    const source = createSource(vfs, vi.fn() as unknown as typeof globalThis.fetch);

    const entries = await source.readIndexCache();

    expect(entries?.map((entry) => entry.slug)).toEqual(["cached-post"]);
  });

  it("treats a VFS NOT_FOUND error as an empty cache", async () => {
    const vfs = makeVfs();
    vfs.readText.mockRejectedValueOnce(
      new VfsError("NOT_FOUND", "missing", { path: BLOG_INDEX_CACHE_PATH }),
    );
    const source = createSource(vfs, vi.fn() as unknown as typeof globalThis.fetch);

    await expect(source.readIndexCache()).resolves.toBeNull();
  });
});

describe("createBlogContentSource — posts", () => {
  it("fetches markdown and caches it under the slug path", async () => {
    const vfs = makeVfs();
    const fetchImpl = vi.fn(async () => textResponse("# Hello"));
    const source = createSource(vfs, fetchImpl as unknown as typeof globalThis.fetch);

    const text = await source.fetchPost("post-a");

    expect(fetchImpl).toHaveBeenCalledWith(`${RAW_BASE}/post-a.md`, expect.any(Object));
    expect(text).toBe("# Hello");
    expect(vfs.writeText).toHaveBeenCalledWith(
      "/home/posts/post-a.md",
      "# Hello",
      expect.objectContaining({ overwrite: true }),
    );
  });

  it("returns null on a 404 without caching", async () => {
    const vfs = makeVfs();
    const fetchImpl = vi.fn(async () => textResponse("missing", 404));
    const source = createSource(vfs, fetchImpl as unknown as typeof globalThis.fetch);

    await expect(source.fetchPost("missing-post")).resolves.toBeNull();
    expect(vfs.writeText).not.toHaveBeenCalled();
  });

  it("throws BlogNetworkError on a non-404 failure", async () => {
    const vfs = makeVfs();
    const fetchImpl = vi.fn(async () => textResponse("nope", 503));
    const source = createSource(vfs, fetchImpl as unknown as typeof globalThis.fetch);

    await expect(source.fetchPost("post-a")).rejects.toBeInstanceOf(BlogNetworkError);
  });

  it("returns null for an invalid slug without fetching", async () => {
    const vfs = makeVfs();
    const fetchImpl = vi.fn();
    const source = createSource(vfs, fetchImpl as unknown as typeof globalThis.fetch);

    await expect(source.fetchPost("Invalid Slug")).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads cached markdown and rejects invalid slugs", async () => {
    const vfs = makeVfs({ "/home/posts/post-a.md": "# Cached" });
    const source = createSource(vfs, vi.fn() as unknown as typeof globalThis.fetch);

    await expect(source.readPostCache("post-a")).resolves.toBe("# Cached");
    await expect(source.readPostCache("Invalid Slug")).resolves.toBeNull();
  });

  it("still returns fetched markdown when the cache write fails", async () => {
    const vfs = makeVfs();
    vfs.writeText.mockRejectedValue(new Error("quota exceeded"));
    const fetchImpl = vi.fn(async () => textResponse("# Resilient"));
    const source = createSource(vfs, fetchImpl as unknown as typeof globalThis.fetch);

    await expect(source.fetchPost("post-a")).resolves.toBe("# Resilient");
  });
});
