import { describe, expect, it, vi } from "vitest";

import { handleRequest, isCrawlerRequest, type SeoWorkerEnv } from "../../worker/seo";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const SEO_BLOG_INDEX_ASSET_MARKER = '<meta name="x-daopk-seo-asset" content="blog-index" />';
const SEO_BLOG_POST_ASSET_MARKER = '<meta name="x-daopk-seo-asset" content="blog-post" />';

function textResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      ...init.headers,
    },
    status: init.status ?? 200,
    statusText: init.statusText,
  });
}

function makeEnv(): {
  env: SeoWorkerEnv;
  fetch: ReturnType<typeof vi.fn<[Request | string, RequestInit?], Promise<Response>>>;
} {
  const fetch = vi.fn(async (input: Request | string) => {
    const url = typeof input === "string" ? new URL(input, "https://daopk.me") : new URL(input.url);

    if (url.pathname === "/__seo/blog-index") {
      return textResponse(`${SEO_BLOG_INDEX_ASSET_MARKER}<main>Latest posts</main>`);
    }

    if (url.pathname === "/__seo/blog/building-a-tiny-web-os") {
      return textResponse(
        `${SEO_BLOG_POST_ASSET_MARKER}<article>Building a Tiny OS in the Browser</article>`,
      );
    }

    if (url.pathname.startsWith("/__seo/blog/")) {
      return textResponse('<div id="app"></div>');
    }

    return textResponse('<div id="app"></div>');
  });

  return {
    env: {
      ASSETS: { fetch },
    },
    fetch,
  };
}

describe("SEO Worker", () => {
  it("detects search and preview crawler requests from the user agent", () => {
    expect(
      isCrawlerRequest(
        new Request("https://daopk.me/blog/building-a-tiny-web-os", {
          headers: { "User-Agent": "Googlebot/2.1" },
        }),
      ),
    ).toBe(true);
    expect(
      isCrawlerRequest(
        new Request("https://daopk.me/blog/building-a-tiny-web-os", {
          headers: { "User-Agent": "facebookexternalhit/1.1" },
        }),
      ),
    ).toBe(true);
    expect(
      isCrawlerRequest(
        new Request("https://daopk.me/blog/building-a-tiny-web-os", {
          headers: { "User-Agent": "curl/8.7.1" },
        }),
      ),
    ).toBe(true);
    expect(
      isCrawlerRequest(
        new Request("https://daopk.me/blog/building-a-tiny-web-os", {
          headers: { "User-Agent": BROWSER_USER_AGENT },
        }),
      ),
    ).toBe(false);
  });

  it("serves generated article HTML to crawlers", async () => {
    const { env, fetch } = makeEnv();
    const request = new Request("https://daopk.me/blog/building-a-tiny-web-os", {
      headers: { "User-Agent": "Googlebot/2.1" },
    });

    const response = await handleRequest(request, env);

    await expect(response.text()).resolves.toContain("Building a Tiny OS in the Browser");
    expect(response.headers.get("Vary")).toBe("User-Agent");
    expect(fetch).toHaveBeenCalledTimes(1);
    const firstCall = fetch.mock.calls[0];
    if (!firstCall) {
      throw new Error("Expected ASSETS.fetch to be called.");
    }

    const assetRequest = firstCall[0];
    expect(assetRequest).toBeInstanceOf(Request);
    expect(new URL((assetRequest as Request).url).pathname).toBe(
      "/__seo/blog/building-a-tiny-web-os",
    );
  });

  it("serves generated article headers to crawler HEAD requests", async () => {
    const { env, fetch } = makeEnv();
    const request = new Request("https://daopk.me/blog/building-a-tiny-web-os", {
      headers: { "User-Agent": "Googlebot/2.1" },
      method: "HEAD",
    });

    const response = await handleRequest(request, env);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("");
    expect(fetch).toHaveBeenCalledTimes(1);
    const firstCall = fetch.mock.calls[0];
    if (!firstCall) {
      throw new Error("Expected ASSETS.fetch to be called.");
    }

    const assetRequest = firstCall[0];
    expect(assetRequest).toBeInstanceOf(Request);
    expect((assetRequest as Request).method).toBe("GET");
    expect(new URL((assetRequest as Request).url).pathname).toBe(
      "/__seo/blog/building-a-tiny-web-os",
    );
  });

  it("serves generated blog index HTML to crawlers", async () => {
    const { env, fetch } = makeEnv();
    const request = new Request("https://daopk.me/blog", {
      headers: { "User-Agent": "Googlebot/2.1" },
    });

    const response = await handleRequest(request, env);

    await expect(response.text()).resolves.toContain("Latest posts");
    expect(response.headers.get("Vary")).toBe("User-Agent");
    expect(fetch).toHaveBeenCalledTimes(1);
    const firstCall = fetch.mock.calls[0];
    if (!firstCall) {
      throw new Error("Expected ASSETS.fetch to be called.");
    }

    const assetRequest = firstCall[0];
    expect(assetRequest).toBeInstanceOf(Request);
    expect(new URL((assetRequest as Request).url).pathname).toBe("/__seo/blog-index");
  });

  it("passes normal browser blog requests through to SPA assets", async () => {
    const { env, fetch } = makeEnv();
    const request = new Request("https://daopk.me/blog/building-a-tiny-web-os", {
      headers: { "User-Agent": BROWSER_USER_AGENT },
    });

    const response = await handleRequest(request, env);

    await expect(response.text()).resolves.toContain('<div id="app"></div>');
    expect(fetch).toHaveBeenCalledWith(request);
  });

  it("passes normal browser blog index requests through to SPA assets", async () => {
    const { env, fetch } = makeEnv();
    const request = new Request("https://daopk.me/blog", {
      headers: { "User-Agent": BROWSER_USER_AGENT },
    });

    const response = await handleRequest(request, env);

    await expect(response.text()).resolves.toContain('<div id="app"></div>');
    expect(fetch).toHaveBeenCalledWith(request);
  });

  it("returns noindex 404 for missing generated posts requested by crawlers", async () => {
    const { env } = makeEnv();
    const request = new Request("https://daopk.me/blog/missing-post", {
      headers: { "User-Agent": "Googlebot/2.1" },
    });

    const response = await handleRequest(request, env);

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    await expect(response.text()).resolves.toBe("Blog post not found.");
  });

  it("returns noindex 404 for invalid crawler blog slugs", async () => {
    const { env, fetch } = makeEnv();
    const request = new Request("https://daopk.me/blog/FIELD-NOTES", {
      headers: { "User-Agent": "Googlebot/2.1" },
    });

    const response = await handleRequest(request, env);

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("hides generated SEO assets from direct requests", async () => {
    const { env, fetch } = makeEnv();
    const request = new Request("https://daopk.me/__seo/blog/building-a-tiny-web-os.html");

    const response = await handleRequest(request, env);

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(fetch).not.toHaveBeenCalled();
  });
});
