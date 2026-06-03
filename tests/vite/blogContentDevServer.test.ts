import { describe, expect, it } from "vitest";

import {
  blogThumbnailProxyTargetUrl,
  buildDevBlogIndex,
  type DevBlogPost,
} from "../../vite/plugins/blogContentDevServer";

const posts: DevBlogPost[] = [
  {
    slug: "post-a",
    metadata: {
      date: "2026-05-30",
      description: "A post.",
      title: "Post A",
    },
  },
  {
    slug: "post-b",
    metadata: {
      date: null,
      description: null,
      title: "Post B",
    },
  },
];

describe("blogThumbnailProxyTargetUrl", () => {
  it("maps blog thumbnail requests to the production origin", () => {
    expect(
      blogThumbnailProxyTargetUrl(
        "/_worker/blog/thumbnails/post-a/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
      ),
    ).toBe(
      "https://daopk.me/_worker/blog/thumbnails/post-a/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
    );
    expect(
      blogThumbnailProxyTargetUrl(
        "/_worker/blog/thumbnails/post-a/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp?v=1",
      ),
    ).toBe(
      "https://daopk.me/_worker/blog/thumbnails/post-a/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp?v=1",
    );
  });

  it("leaves non-thumbnail routes alone", () => {
    expect(blogThumbnailProxyTargetUrl("/_worker/blog/index.json")).toBeNull();
    expect(blogThumbnailProxyTargetUrl("/_worker/blog/post-a.md")).toBeNull();
    expect(blogThumbnailProxyTargetUrl("/_worker/blog/thumbnails/post-a/nope.png")).toBeNull();
    expect(blogThumbnailProxyTargetUrl("/_worker/photos/thumbnails/post-a/image.png")).toBeNull();
    expect(blogThumbnailProxyTargetUrl("http://[::1")).toBeNull();
  });
});

describe("buildDevBlogIndex", () => {
  it("merges matching published thumbnail metadata into local markdown posts", () => {
    expect(
      buildDevBlogIndex(posts, [
        {
          slug: "post-a",
          thumbnail: {
            alt: "Post A thumbnail",
            height: 576,
            url: "/_worker/blog/thumbnails/post-a/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
            width: 1024,
          },
        },
      ]),
    ).toEqual([
      {
        date: "2026-05-30",
        description: "A post.",
        slug: "post-a",
        thumbnail: {
          alt: "Post A thumbnail",
          height: 576,
          url: "/_worker/blog/thumbnails/post-a/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
          width: 1024,
        },
        title: "Post A",
      },
      {
        date: null,
        description: null,
        slug: "post-b",
        thumbnail: null,
        title: "Post B",
      },
    ]);
  });

  it("ignores malformed or mismatched thumbnail metadata", () => {
    expect(
      buildDevBlogIndex(posts, [
        {
          slug: "post-a",
          thumbnail: {
            alt: "Wrong slug",
            height: 576,
            url: "/_worker/blog/thumbnails/post-b/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
            width: 1024,
          },
        },
        {
          slug: "post-b",
          thumbnail: {
            alt: "Wrong size",
            height: 100,
            url: "/_worker/blog/thumbnails/post-b/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp",
            width: 1024,
          },
        },
      ]).map((entry) => entry.thumbnail),
    ).toEqual([null, null]);
  });
});
