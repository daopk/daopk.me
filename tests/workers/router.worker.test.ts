import { describe, expect, it, vi } from "vitest";

import {
  handleRequest,
  isCrawlerRequest,
  type R2ObjectBody,
  type SeoWorkerEnv,
} from "../../worker/seo";

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

function makeEnv(objects: Record<string, string> = DEFAULT_OBJECTS): {
  env: SeoWorkerEnv;
  get: ReturnType<typeof vi.fn>;
  assets: ReturnType<typeof vi.fn>;
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

  return {
    env: { ASSETS: { fetch: assets }, BLOG: { get } },
    get,
    assets,
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
