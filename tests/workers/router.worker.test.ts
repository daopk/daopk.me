import { describe, expect, it, vi } from "vitest";

import {
  handleRequest,
  isCrawlerRequest,
  type R2ObjectBody,
  type R2Objects,
  type WorkerEnv,
} from "../../worker/router";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const DEFAULT_OBJECTS: Record<string, string> = {
  "index.json": '[{"slug":"building-a-tiny-web-os","title":"Building a Tiny OS in the Browser"}]',
  "posts/building-a-tiny-web-os.md": "# Building a Tiny OS in the Browser\n",
  "seo/blog-index.html": "<main>Latest posts</main>",
  "seo/posts/building-a-tiny-web-os.html": "<article>Building a Tiny OS in the Browser</article>",
  "sitemap.xml": '<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>',
};

function bodyStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function r2Object(text: string): R2ObjectBody {
  return { body: bodyStream(text), httpEtag: '"test-etag"' };
}

interface PhotoFixture {
  readonly key: string;
  readonly body: string;
  readonly contentType: string;
  readonly uploaded: string;
}

const DEFAULT_PHOTOS: readonly PhotoFixture[] = [
  {
    key: "2026/sunset.jpg",
    body: "sunset-bytes",
    contentType: "image/jpeg",
    uploaded: "2026-05-30T10:00:00.000Z",
  },
  {
    key: "ocean.png",
    body: "ocean-bytes",
    contentType: "image/png",
    uploaded: "2026-05-31T12:00:00.000Z",
  },
];

function photoObjectBody(fixture: PhotoFixture): R2ObjectBody {
  return {
    body: bodyStream(fixture.body),
    httpEtag: '"photo-etag"',
    writeHttpMetadata(headers: Headers): void {
      headers.set("Content-Type", fixture.contentType);
    },
  };
}

function makeEnv(
  objects: Record<string, string> = DEFAULT_OBJECTS,
  photos: readonly PhotoFixture[] = DEFAULT_PHOTOS,
): {
  env: WorkerEnv;
  get: ReturnType<typeof vi.fn>;
  assets: ReturnType<typeof vi.fn>;
  photosGet: ReturnType<typeof vi.fn>;
  photosList: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(
    async (key: string): Promise<R2ObjectBody | null> =>
      Object.prototype.hasOwnProperty.call(objects, key) ? r2Object(objects[key] as string) : null,
  );
  const assets = vi.fn(
    async (): Promise<Response> =>
      new Response('<div id="app"></div>', {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      }),
  );
  const photosGet = vi.fn(async (key: string): Promise<R2ObjectBody | null> => {
    const fixture = photos.find((photo) => photo.key === key);
    return fixture === undefined ? null : photoObjectBody(fixture);
  });
  const photosList = vi.fn(
    async (): Promise<R2Objects> => ({
      objects: photos.map((photo) => ({
        key: photo.key,
        size: photo.body.length,
        uploaded: new Date(photo.uploaded),
        httpMetadata: { contentType: photo.contentType },
      })),
      truncated: false,
    }),
  );

  return {
    env: {
      ASSETS: { fetch: assets },
      BLOG: { get },
      PHOTOS: { get: photosGet, list: photosList },
    },
    get,
    assets,
    photosGet,
    photosList,
  };
}

function crawler(path: string, method = "GET"): Request {
  return new Request(`https://daopk.me${path}`, {
    headers: { "User-Agent": "Googlebot/2.1" },
    method,
  });
}

function browser(path: string): Request {
  return new Request(`https://daopk.me${path}`, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
  });
}

describe("SEO Worker — crawler detection", () => {
  it("detects search and preview crawler requests from the user agent", () => {
    expect(isCrawlerRequest(crawler("/blog/building-a-tiny-web-os"))).toBe(true);
    expect(
      isCrawlerRequest(
        new Request("https://daopk.me/blog", {
          headers: { "User-Agent": "facebookexternalhit/1.1" },
        }),
      ),
    ).toBe(true);
    expect(isCrawlerRequest(browser("/blog/building-a-tiny-web-os"))).toBe(false);
  });
});

describe("SEO Worker — runtime content from R2", () => {
  it("serves index.json from R2 to any user agent", async () => {
    const { env, get, assets } = makeEnv();

    const response = await handleRequest(browser("/blog/index.json"), env);

    expect(get).toHaveBeenCalledWith("index.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json;charset=utf-8");
    await expect(response.text()).resolves.toContain("building-a-tiny-web-os");
    expect(assets).not.toHaveBeenCalled();
  });

  it("serves a raw post markdown file from R2", async () => {
    const { env, get } = makeEnv();

    const response = await handleRequest(browser("/blog/building-a-tiny-web-os.md"), env);

    expect(get).toHaveBeenCalledWith("posts/building-a-tiny-web-os.md");
    expect(response.headers.get("Content-Type")).toBe("text/markdown;charset=utf-8");
    await expect(response.text()).resolves.toContain("# Building a Tiny OS in the Browser");
  });

  it("serves the sitemap from R2", async () => {
    const { env, get } = makeEnv();

    const response = await handleRequest(browser("/sitemap.xml"), env);

    expect(get).toHaveBeenCalledWith("sitemap.xml");
    expect(response.headers.get("Content-Type")).toBe("application/xml;charset=utf-8");
    await expect(response.text()).resolves.toContain("<urlset");
  });

  it("falls back to assets for the sitemap when R2 has none", async () => {
    const { env, assets } = makeEnv({});
    const request = browser("/sitemap.xml");

    const response = await handleRequest(request, env);

    expect(assets).toHaveBeenCalledWith(request);
    await expect(response.text()).resolves.toContain('<div id="app"></div>');
  });

  it("returns noindex 404 when the index is not yet published", async () => {
    const { env } = makeEnv({});

    const response = await handleRequest(browser("/blog/index.json"), env);

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("returns noindex 404 when a markdown file is missing", async () => {
    const { env, get } = makeEnv({});

    const response = await handleRequest(browser("/blog/missing-post.md"), env);

    expect(get).toHaveBeenCalledWith("posts/missing-post.md");
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });
});

describe("SEO Worker — prerendered pages for crawlers", () => {
  it("serves the prerendered blog index to crawlers", async () => {
    const { env, get } = makeEnv();

    const response = await handleRequest(crawler("/blog"), env);

    expect(get).toHaveBeenCalledWith("seo/blog-index.html");
    await expect(response.text()).resolves.toContain("Latest posts");
    expect(response.headers.get("Vary")).toBe("User-Agent");
    expect(response.headers.get("Content-Type")).toBe("text/html;charset=utf-8");
  });

  it("serves a prerendered post to crawlers", async () => {
    const { env, get } = makeEnv();

    const response = await handleRequest(crawler("/blog/building-a-tiny-web-os"), env);

    expect(get).toHaveBeenCalledWith("seo/posts/building-a-tiny-web-os.html");
    await expect(response.text()).resolves.toContain("Building a Tiny OS in the Browser");
    expect(response.headers.get("Vary")).toBe("User-Agent");
  });

  it("serves prerendered headers to crawler HEAD requests", async () => {
    const { env, get } = makeEnv();

    const response = await handleRequest(crawler("/blog/building-a-tiny-web-os", "HEAD"), env);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("");
    expect(get).toHaveBeenCalledWith("seo/posts/building-a-tiny-web-os.html");
  });

  it("returns noindex 404 for crawler posts missing from R2", async () => {
    const { env } = makeEnv();

    const response = await handleRequest(crawler("/blog/unknown-post"), env);

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    await expect(response.text()).resolves.toBe("Blog post not found.");
  });

  it("returns noindex 404 for invalid crawler slugs without touching R2", async () => {
    const { env, get } = makeEnv();

    const response = await handleRequest(crawler("/blog/FIELD-NOTES"), env);

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(get).not.toHaveBeenCalled();
  });
});

describe("SEO Worker — humans and other routes", () => {
  it("passes human blog post requests through to SPA assets", async () => {
    const { env, get, assets } = makeEnv();
    const request = browser("/blog/building-a-tiny-web-os");

    const response = await handleRequest(request, env);

    expect(assets).toHaveBeenCalledWith(request);
    expect(get).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toContain('<div id="app"></div>');
  });

  it("passes human blog index requests through to SPA assets", async () => {
    const { env, assets } = makeEnv();
    const request = browser("/blog");

    await handleRequest(request, env);

    expect(assets).toHaveBeenCalledWith(request);
  });

  it("passes non-blog requests straight to assets", async () => {
    const { env, get, assets } = makeEnv();
    const request = browser("/about");

    await handleRequest(request, env);

    expect(assets).toHaveBeenCalledWith(request);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("Photo gallery — dynamic index from R2", () => {
  it("lists the PHOTOS bucket as a newest-first JSON index", async () => {
    const { env, photosList, assets } = makeEnv();

    const response = await handleRequest(browser("/photos/index.json"), env);

    expect(photosList).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json;charset=utf-8");

    const index = (await response.json()) as Array<{
      key: string;
      url: string;
      contentType: string;
    }>;
    expect(index.map((entry) => entry.key)).toEqual(["ocean.png", "2026/sunset.jpg"]);
    expect(index[0]).toMatchObject({ url: "/photos/ocean.png", contentType: "image/png" });
    expect(assets).not.toHaveBeenCalled();
  });

  it("returns an empty array when the bucket has no objects", async () => {
    const { env } = makeEnv(DEFAULT_OBJECTS, []);

    const response = await handleRequest(browser("/photos/index.json"), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("excludes folder markers and non-image objects from the index", async () => {
    const { env } = makeEnv(DEFAULT_OBJECTS, [
      {
        key: "2026/japan.jpg",
        body: "japan-bytes",
        contentType: "image/jpeg",
        uploaded: "2026-05-31T13:45:14.164Z",
      },
      {
        key: "2026/",
        body: "",
        contentType: "application/octet-stream",
        uploaded: "2026-05-31T13:44:17.720Z",
      },
      {
        key: "notes.txt",
        body: "hello",
        contentType: "text/plain",
        uploaded: "2026-05-31T10:00:00.000Z",
      },
    ]);

    const response = await handleRequest(browser("/photos/index.json"), env);
    const index = (await response.json()) as Array<{ key: string }>;

    expect(index.map((entry) => entry.key)).toEqual(["2026/japan.jpg"]);
  });

  it("follows the list cursor across pages", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        objects: [
          {
            key: "a.jpg",
            size: 1,
            uploaded: new Date("2026-01-01T00:00:00.000Z"),
            httpMetadata: { contentType: "image/jpeg" },
          },
        ],
        truncated: true,
        cursor: "page-2",
      })
      .mockResolvedValueOnce({
        objects: [
          {
            key: "b.jpg",
            size: 1,
            uploaded: new Date("2026-02-01T00:00:00.000Z"),
            httpMetadata: { contentType: "image/jpeg" },
          },
        ],
        truncated: false,
      });
    const env: WorkerEnv = {
      ASSETS: { fetch: vi.fn(async () => new Response("")) },
      BLOG: { get: vi.fn(async () => null) },
      PHOTOS: { get: vi.fn(async () => null), list },
    };

    const response = await handleRequest(browser("/photos/index.json"), env);
    const index = (await response.json()) as Array<{ key: string }>;

    expect(list).toHaveBeenCalledTimes(2);
    expect(index.map((entry) => entry.key)).toEqual(["b.jpg", "a.jpg"]);
  });
});

describe("Photo gallery — image bytes from R2", () => {
  it("serves stored image bytes with the bucket content type", async () => {
    const { env, photosGet } = makeEnv();

    const response = await handleRequest(browser("/photos/ocean.png"), env);

    expect(photosGet).toHaveBeenCalledWith("ocean.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    await expect(response.text()).resolves.toBe("ocean-bytes");
  });

  it("serves nested keys and omits the body for HEAD requests", async () => {
    const { env, photosGet } = makeEnv();
    const headRequest = new Request("https://daopk.me/photos/2026/sunset.jpg", {
      method: "HEAD",
      headers: { "User-Agent": BROWSER_USER_AGENT },
    });

    const response = await handleRequest(headRequest, env);

    expect(photosGet).toHaveBeenCalledWith("2026/sunset.jpg");
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("");
  });

  it("returns 404 for a missing photo", async () => {
    const { env } = makeEnv(DEFAULT_OBJECTS, []);

    const response = await handleRequest(browser("/photos/missing.jpg"), env);

    expect(response.status).toBe(404);
  });

  it("ignores non-image paths and falls through to assets", async () => {
    const { env, assets, photosGet } = makeEnv();
    const request = browser("/photos/readme.txt");

    const response = await handleRequest(request, env);

    expect(photosGet).not.toHaveBeenCalled();
    expect(assets).toHaveBeenCalledWith(request);
    await expect(response.text()).resolves.toContain('<div id="app"></div>');
  });
});
