import { describe, expect, it, vi } from "vitest";

import { debugWarn } from "@daopk/sdk";
import { BlogNetworkError, type BlogContentSource, type BlogIndexEntry } from "@daopk/content";
import { mountVaporComposable } from "~/test/mountVapor";

import { blogIndexPostFromEntry, useBlogIndex } from "./useBlogIndex";

vi.mock("@daopk/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@daopk/sdk")>()),
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

type IndexSource = Pick<BlogContentSource, "readIndexCache" | "fetchIndex">;

function entry(overrides: Partial<BlogIndexEntry> & { slug: string }): BlogIndexEntry {
  return {
    title: null,
    date: null,
    description: null,
    thumbnail: null,
    ...overrides,
  };
}

function mountHarness(source: IndexSource) {
  const mounted = mountVaporComposable(() => useBlogIndex({ source }));

  return {
    state: mounted.result,
    wrapper: mounted.wrapper,
  };
}

describe("blogIndexPostFromEntry", () => {
  it("derives display fields from a manifest entry", () => {
    expect(
      blogIndexPostFromEntry({
        slug: "hello-world",
        title: "Hello World",
        date: "2026-05-30",
        description: "A short summary.",
      }),
    ).toEqual({
      date: "2026-05-30",
      excerpt: "A short summary.",
      formattedDate: "May 30, 2026",
      path: "/home/posts/hello-world.md",
      slug: "hello-world",
      thumbnail: null,
      title: "Hello World",
    });
  });

  it("keeps valid thumbnail metadata for rendering", () => {
    const thumbnail = {
      url: "/public/blog/thumbnails/hello-world/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp",
      width: 1024,
      height: 576,
      alt: "Hello World thumbnail",
    };

    expect(
      blogIndexPostFromEntry({
        slug: "hello-world",
        title: "Hello World",
        date: null,
        description: null,
        thumbnail,
      }).thumbnail,
    ).toBe(thumbnail);
  });

  it("falls back to a slug-derived title and drops invalid dates", () => {
    const post = blogIndexPostFromEntry({
      slug: "no-meta-post",
      title: null,
      date: "2026-99-99",
      description: null,
    });

    expect(post.title).toBe("No Meta Post");
    expect(post.date).toBeNull();
    expect(post.formattedDate).toBeNull();
    expect(post.excerpt).toBe("");
    expect(post.thumbnail).toBeNull();
  });
});

describe("useBlogIndex", () => {
  it("renders fetched posts newest first", async () => {
    const { state } = mountHarness({
      readIndexCache: vi.fn(async () => null),
      fetchIndex: vi.fn(async () => [
        entry({ slug: "old-post", title: "Old Post", date: "2026-05-01" }),
        entry({ slug: "new-post", title: "New Post", date: "2026-05-30" }),
      ]),
    });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("ready");
    });

    expect(state.posts.value.map((post) => post.slug)).toEqual(["new-post", "old-post"]);
  });

  it("shows empty when the manifest has no posts", async () => {
    const { state } = mountHarness({
      readIndexCache: vi.fn(async () => null),
      fetchIndex: vi.fn(async () => []),
    });

    await vi.waitFor(() => {
      expect(state.empty.value).toBe(true);
    });
  });

  it("shows error when there is no cache and the network fails", async () => {
    const { state } = mountHarness({
      readIndexCache: vi.fn(async () => null),
      fetchIndex: vi.fn(async () => {
        throw new BlogNetworkError("offline");
      }),
    });

    await vi.waitFor(() => {
      expect(state.loadFailed.value).toBe(true);
    });

    expect(debugWarn).toHaveBeenCalledWith("[blog] failed to load blog index", expect.anything());
  });

  it("serves the cached index when the network refresh fails", async () => {
    const { state } = mountHarness({
      readIndexCache: vi.fn(async () => [entry({ slug: "cached-post", title: "Cached" })]),
      fetchIndex: vi.fn(async () => {
        throw new BlogNetworkError("offline");
      }),
    });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("ready");
    });

    expect(state.posts.value.map((post) => post.slug)).toEqual(["cached-post"]);
    expect(debugWarn).toHaveBeenCalledWith(
      "[blog] serving cached blog index; refresh failed",
      expect.anything(),
    );
  });

  it("replaces the cached index with fresh network results", async () => {
    const { state } = mountHarness({
      readIndexCache: vi.fn(async () => [entry({ slug: "stale-post", title: "Stale" })]),
      fetchIndex: vi.fn(async () => [
        entry({ slug: "stale-post", title: "Stale" }),
        entry({ slug: "fresh-post", title: "Fresh", date: "2026-06-01" }),
      ]),
    });

    await vi.waitFor(() => {
      expect(state.posts.value).toHaveLength(2);
    });

    expect(state.posts.value.map((post) => post.slug)).toEqual(["fresh-post", "stale-post"]);
  });
});
