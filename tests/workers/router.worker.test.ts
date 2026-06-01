import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleRequest,
  isCrawlerRequest,
  type R2ObjectBody,
  type R2Objects,
  type WorkerEnv,
} from "../../worker/router";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const COEP_HEADER = "Cross-Origin-Embedder-Policy";
const COOP_HEADER = "Cross-Origin-Opener-Policy";

const DEFAULT_OBJECTS: Record<string, string> = {
  "index.json": '[{"slug":"building-a-tiny-web-os","title":"Building a Tiny OS in the Browser"}]',
  "posts/building-a-tiny-web-os.md": "# Building a Tiny OS in the Browser\n",
  "seo/blog-index.html": "<main>Latest posts</main>",
  "seo/posts/building-a-tiny-web-os.html": "<article>Building a Tiny OS in the Browser</article>",
  "sitemap.xml": '<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>',
};

const DEFAULT_APPS: Record<string, string> = {
  "index.json": '[{"id":"notes","version":"1.0.0"}]',
  "notes/1.0.0/app.js": "export default {};\n",
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

interface FileFixture {
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

const DEFAULT_FILES: readonly FileFixture[] = [
  {
    key: "docs/spec.pdf",
    body: "%PDF-spec",
    contentType: "application/pdf",
    uploaded: "2026-05-29T09:00:00.000Z",
  },
  {
    key: "notes/readme.md",
    body: "# Cloud Notes\n",
    contentType: "text/markdown;charset=utf-8",
    uploaded: "2026-05-30T09:00:00.000Z",
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

function fileObjectBody(fixture: FileFixture): R2ObjectBody {
  return {
    body: bodyStream(fixture.body),
    httpEtag: '"file-etag"',
    writeHttpMetadata(headers: Headers): void {
      headers.set("Content-Type", fixture.contentType);
    },
  };
}

function makeEnv(
  objects: Record<string, string> = DEFAULT_OBJECTS,
  photos: readonly PhotoFixture[] = DEFAULT_PHOTOS,
  apps: Record<string, string> = DEFAULT_APPS,
  files: readonly FileFixture[] = DEFAULT_FILES,
): {
  env: WorkerEnv;
  get: ReturnType<typeof vi.fn>;
  appsGet: ReturnType<typeof vi.fn>;
  assets: ReturnType<typeof vi.fn>;
  photosGet: ReturnType<typeof vi.fn>;
  photosList: ReturnType<typeof vi.fn>;
  photosPut: ReturnType<typeof vi.fn>;
  filesGet: ReturnType<typeof vi.fn>;
  filesList: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(
    async (key: string): Promise<R2ObjectBody | null> =>
      Object.prototype.hasOwnProperty.call(objects, key) ? r2Object(objects[key] as string) : null,
  );
  const appsGet = vi.fn(
    async (key: string): Promise<R2ObjectBody | null> =>
      Object.prototype.hasOwnProperty.call(apps, key) ? r2Object(apps[key] as string) : null,
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
  const photosPut = vi.fn(async (): Promise<undefined> => undefined);
  const filesGet = vi.fn(async (key: string): Promise<R2ObjectBody | null> => {
    const fixture = files.find((file) => file.key === key);
    return fixture === undefined ? null : fileObjectBody(fixture);
  });
  const filesList = vi.fn(
    async (): Promise<R2Objects> => ({
      objects: files.map((file) => ({
        key: file.key,
        size: file.body.length,
        uploaded: new Date(file.uploaded),
        httpMetadata: { contentType: file.contentType },
      })),
      truncated: false,
    }),
  );

  return {
    env: {
      ASSETS: { fetch: assets },
      BLOG: { get },
      APPS: { get: appsGet },
      PHOTOS: { get: photosGet, list: photosList, put: photosPut },
      FILES: { get: filesGet, list: filesList },
    },
    get,
    appsGet,
    assets,
    photosGet,
    photosList,
    photosPut,
    filesGet,
    filesList,
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

function expectCrossOriginIsolation(response: Response): void {
  expect(response.headers.get(COEP_HEADER)).toBe("credentialless");
  expect(response.headers.get(COOP_HEADER)).toBe("same-origin");
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

    const response = await handleRequest(browser("/_worker/blog/index.json"), env);

    expect(get).toHaveBeenCalledWith("index.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json;charset=utf-8");
    await expect(response.text()).resolves.toContain("building-a-tiny-web-os");
    expect(assets).not.toHaveBeenCalled();
  });

  it("serves a raw post markdown file from R2", async () => {
    const { env, get } = makeEnv();

    const response = await handleRequest(browser("/_worker/blog/building-a-tiny-web-os.md"), env);

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

    const response = await handleRequest(browser("/_worker/blog/index.json"), env);

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("returns noindex 404 when a markdown file is missing", async () => {
    const { env, get } = makeEnv({});

    const response = await handleRequest(browser("/_worker/blog/missing-post.md"), env);

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

  it("does not serve legacy raw blog routes from R2", async () => {
    const { env, get, assets } = makeEnv();

    const indexResponse = await handleRequest(browser("/blog/index.json"), env);
    const postResponse = await handleRequest(browser("/blog/building-a-tiny-web-os.md"), env);

    expect(indexResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
  });

  it("does not serve legacy photo routes from R2", async () => {
    const { env, photosGet, photosList, assets } = makeEnv();
    const request = browser("/photos/ocean.png");

    const response = await handleRequest(request, env);

    expect(photosGet).not.toHaveBeenCalled();
    expect(photosList).not.toHaveBeenCalled();
    expect(assets).toHaveBeenCalledWith(request);
    await expect(response.text()).resolves.toContain('<div id="app"></div>');
  });

  it("passes non-blog requests straight to assets", async () => {
    const { env, get, assets } = makeEnv();
    const request = browser("/about");

    await handleRequest(request, env);

    expect(assets).toHaveBeenCalledWith(request);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("Worker responses — cross-origin isolation", () => {
  it.each([
    ["R2 blog JSON", () => makeEnv(), () => browser("/_worker/blog/index.json")],
    ["R2 markdown", () => makeEnv(), () => browser("/_worker/blog/building-a-tiny-web-os.md")],
    ["R2 SEO HTML", () => makeEnv(), () => crawler("/blog/building-a-tiny-web-os")],
    ["app catalog", () => makeEnv(), () => browser("/apps/index.json")],
    ["app module", () => makeEnv(), () => browser("/apps/notes/1.0.0+123/app.js")],
    ["photo index", () => makeEnv(), () => browser("/_worker/photos/index.json")],
    ["photo bytes", () => makeEnv(), () => browser("/_worker/photos/ocean.png")],
    ["file index", () => makeEnv(), () => browser("/_worker/files/index.json")],
    ["file bytes", () => makeEnv(), () => browser("/_worker/files/raw/docs/spec.pdf")],
    ["noindex 404", () => makeEnv({}), () => browser("/_worker/blog/index.json")],
    ["asset fallback", () => makeEnv(), () => browser("/about")],
    ["sitemap asset fallback", () => makeEnv({}), () => browser("/sitemap.xml")],
  ])("adds isolation headers to %s responses", async (_label, makeScenarioEnv, makeRequest) => {
    const { env } = makeScenarioEnv();

    const response = await handleRequest(makeRequest(), env);

    expectCrossOriginIsolation(response);
  });
});

describe("Photo gallery — dynamic index from R2", () => {
  it("lists the PHOTOS bucket as a newest-first JSON index", async () => {
    const { env, photosList, assets } = makeEnv();

    const response = await handleRequest(browser("/_worker/photos/index.json"), env);

    expect(photosList).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json;charset=utf-8");

    const index = (await response.json()) as Array<{
      key: string;
      url: string;
      contentType: string;
    }>;
    expect(index.map((entry) => entry.key)).toEqual(["ocean.png", "2026/sunset.jpg"]);
    expect(index[0]).toMatchObject({
      url: "/_worker/photos/ocean.png",
      contentType: "image/png",
    });
    expect(assets).not.toHaveBeenCalled();
  });

  it("returns an empty array when the bucket has no objects", async () => {
    const { env } = makeEnv(DEFAULT_OBJECTS, []);

    const response = await handleRequest(browser("/_worker/photos/index.json"), env);

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

    const response = await handleRequest(browser("/_worker/photos/index.json"), env);
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
      APPS: { get: vi.fn(async () => null) },
      PHOTOS: { get: vi.fn(async () => null), list, put: vi.fn(async () => undefined) },
      FILES: {
        get: vi.fn(async () => null),
        list: vi.fn(async () => ({ objects: [], truncated: false })),
      },
    };

    const response = await handleRequest(browser("/_worker/photos/index.json"), env);
    const index = (await response.json()) as Array<{ key: string }>;

    expect(list).toHaveBeenCalledTimes(2);
    expect(index.map((entry) => entry.key)).toEqual(["b.jpg", "a.jpg"]);
  });
});

describe("Files cloud drive — dynamic index from R2", () => {
  it("lists the FILES bucket as a newest-first JSON index", async () => {
    const { env, filesList, assets } = makeEnv();

    const response = await handleRequest(browser("/_worker/files/index.json"), env);

    expect(filesList).toHaveBeenCalledWith({ cursor: undefined, include: ["httpMetadata"] });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json;charset=utf-8");

    const index = (await response.json()) as Array<{
      key: string;
      kind: string;
      url?: string;
      contentType?: string;
    }>;
    expect(index.map((entry) => entry.key)).toEqual(["notes/readme.md", "docs/spec.pdf"]);
    expect(index[0]).toMatchObject({
      kind: "file",
      url: "/_worker/files/raw/notes/readme.md",
      contentType: "text/markdown;charset=utf-8",
    });
    expect(assets).not.toHaveBeenCalled();
  });

  it("surfaces R2 folder markers as directories", async () => {
    const { env } = makeEnv(DEFAULT_OBJECTS, DEFAULT_PHOTOS, DEFAULT_APPS, [
      {
        key: "docs/",
        body: "",
        contentType: "application/octet-stream",
        uploaded: "2026-05-31T13:44:17.720Z",
      },
    ]);

    const response = await handleRequest(browser("/_worker/files/index.json"), env);
    const index = (await response.json()) as Array<{ key: string; kind: string; url?: string }>;

    expect(index).toEqual([expect.objectContaining({ key: "docs/", kind: "directory" })]);
    expect(index[0]?.url).toBeUndefined();
  });

  it("serves stored file bytes with the bucket content type", async () => {
    const { env, filesGet } = makeEnv();

    const response = await handleRequest(browser("/_worker/files/raw/docs/spec.pdf"), env);

    expect(filesGet).toHaveBeenCalledWith("docs/spec.pdf");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    await expect(response.text()).resolves.toBe("%PDF-spec");
  });

  it("serves nested file keys with encoded path segments", async () => {
    const { env, filesGet } = makeEnv(DEFAULT_OBJECTS, DEFAULT_PHOTOS, DEFAULT_APPS, [
      {
        key: "meeting notes/q2 plan.md",
        body: "# Q2\n",
        contentType: "text/markdown;charset=utf-8",
        uploaded: "2026-05-31T13:44:17.720Z",
      },
    ]);

    const indexResponse = await handleRequest(browser("/_worker/files/index.json"), env);
    const index = (await indexResponse.json()) as Array<{ url?: string }>;
    const response = await handleRequest(
      browser("/_worker/files/raw/meeting%20notes/q2%20plan.md"),
      env,
    );

    expect(index[0]?.url).toBe("/_worker/files/raw/meeting%20notes/q2%20plan.md");
    expect(filesGet).toHaveBeenCalledWith("meeting notes/q2 plan.md");
    await expect(response.text()).resolves.toBe("# Q2\n");
  });

  it("returns 404 for missing and unsafe file keys", async () => {
    const { env, filesGet } = makeEnv(DEFAULT_OBJECTS, DEFAULT_PHOTOS, DEFAULT_APPS, []);

    const missing = await handleRequest(browser("/_worker/files/raw/docs/missing.pdf"), env);
    const unsafe = await handleRequest(browser("/_worker/files/raw/%2E%2E/secret.txt"), env);

    expect(missing.status).toBe(404);
    expect(unsafe.status).toBe(404);
    expect(filesGet).toHaveBeenCalledTimes(1);
    expect(filesGet).toHaveBeenCalledWith("docs/missing.pdf");
  });
});

describe("Photo gallery — image bytes from R2", () => {
  it("serves stored image bytes with the bucket content type", async () => {
    const { env, photosGet } = makeEnv();

    const response = await handleRequest(browser("/_worker/photos/ocean.png"), env);

    expect(photosGet).toHaveBeenCalledWith("ocean.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    await expect(response.text()).resolves.toBe("ocean-bytes");
  });

  it("serves nested keys and omits the body for HEAD requests", async () => {
    const { env, photosGet } = makeEnv();
    const headRequest = new Request("https://daopk.me/_worker/photos/2026/sunset.jpg", {
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

    const response = await handleRequest(browser("/_worker/photos/missing.jpg"), env);

    expect(response.status).toBe(404);
  });

  it("returns 404 for non-image worker paths", async () => {
    const { env, assets, photosGet } = makeEnv();
    const request = browser("/_worker/photos/readme.txt");

    const response = await handleRequest(request, env);

    expect(photosGet).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });
});

describe("Photo thumbnails — on-the-fly resize cached in R2", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resizes via Cloudflare image fetch and persists the variant to R2", async () => {
    const fetchMock = vi.fn(
      async () => new Response("resized-png-bytes", { headers: { "Content-Type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { env, photosGet, photosPut } = makeEnv();

    const response = await handleRequest(browser("/_worker/photos/ocean.png?w=400"), env);

    // A cache miss probes the derived key, then transforms the original.
    expect(photosGet).toHaveBeenCalledWith("thumbnails/400/ocean.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [URL, { cf?: { image?: { width?: number } } }];
    expect(String(input)).toContain("/_worker/photos/ocean.png");
    expect(String(input)).not.toContain("w=400");
    expect(init?.cf?.image?.width).toBe(400);

    expect(photosPut).toHaveBeenCalledTimes(1);
    expect(photosPut.mock.calls[0]?.[0]).toBe("thumbnails/400/ocean.png");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    await expect(response.text()).resolves.toBe("resized-png-bytes");
  });

  it("serves a previously cached variant from R2 without transforming again", async () => {
    const fetchMock = vi.fn(async () => new Response("should-not-run"));
    vi.stubGlobal("fetch", fetchMock);

    const { env, photosPut } = makeEnv(DEFAULT_OBJECTS, [
      {
        key: "thumbnails/400/ocean.png",
        body: "cached-thumb",
        contentType: "image/png",
        uploaded: "2026-05-31T12:00:00.000Z",
      },
      {
        key: "ocean.png",
        body: "ocean-bytes",
        contentType: "image/png",
        uploaded: "2026-05-31T12:00:00.000Z",
      },
    ]);

    const response = await handleRequest(browser("/_worker/photos/ocean.png?w=400"), env);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(photosPut).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    await expect(response.text()).resolves.toBe("cached-thumb");
  });

  it("ignores widths outside the allow-list and serves the original", async () => {
    const fetchMock = vi.fn(async () => new Response("nope"));
    vi.stubGlobal("fetch", fetchMock);

    const { env, photosGet, photosPut } = makeEnv();

    const response = await handleRequest(browser("/_worker/photos/ocean.png?w=123"), env);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(photosPut).not.toHaveBeenCalled();
    expect(photosGet).toHaveBeenCalledWith("ocean.png");
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ocean-bytes");
  });

  it("never serves derived thumbnail keys directly", async () => {
    const { env, photosGet } = makeEnv();

    const response = await handleRequest(browser("/_worker/photos/thumbnails/400/ocean.png"), env);

    expect(response.status).toBe(404);
    expect(photosGet).not.toHaveBeenCalled();
  });

  it("omits derived thumbnails from the gallery index", async () => {
    const { env } = makeEnv(DEFAULT_OBJECTS, [
      {
        key: "ocean.png",
        body: "ocean-bytes",
        contentType: "image/png",
        uploaded: "2026-05-31T12:00:00.000Z",
      },
      {
        key: "thumbnails/400/ocean.png",
        body: "cached-thumb",
        contentType: "image/png",
        uploaded: "2026-05-31T12:30:00.000Z",
      },
    ]);

    const response = await handleRequest(browser("/_worker/photos/index.json"), env);
    const index = (await response.json()) as Array<{ key: string }>;

    expect(index.map((entry) => entry.key)).toEqual(["ocean.png"]);
  });
});
