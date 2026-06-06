import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleRequest,
  isCrawlerRequest,
  isInternalProxyRequest,
  type WorkerEnv,
} from "../../worker/router";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const COEP_HEADER = "Cross-Origin-Embedder-Policy";
const COOP_HEADER = "Cross-Origin-Opener-Policy";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeEnv(): { assets: ReturnType<typeof vi.fn>; env: WorkerEnv } {
  const assets = vi.fn(
    async (): Promise<Response> =>
      new Response('<div id="app"></div>', {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      }),
  );

  return {
    assets,
    env: {
      ASSETS: { fetch: assets },
      INTERNAL_API_BASE_URL: "https://api.daopk.test",
      INTERNAL_API_TOKEN: "test-token",
    },
  };
}

function crawler(path: string, method = "GET"): Request {
  return new Request(`https://daopk.me${path}`, {
    headers: { "User-Agent": "Googlebot/2.1" },
    method,
  });
}

function browser(path: string, method = "GET"): Request {
  return new Request(`https://daopk.me${path}`, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
    method,
  });
}

function expectCrossOriginIsolation(response: Response): void {
  expect(response.headers.get(COEP_HEADER)).toBe("credentialless");
  expect(response.headers.get(COOP_HEADER)).toBe("same-origin");
}

function stubInternalFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async (): Promise<Response> =>
      new Response("<main>SEO HTML</main>", {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("thin SEO worker", () => {
  it("detects crawler requests from the user agent", () => {
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

  it("proxies crawler SEO paths to the internal API with bearer auth", async () => {
    const fetchMock = stubInternalFetch();
    const { env, assets } = makeEnv();

    const response = await handleRequest(crawler("/movie/550-fight-club"), env);

    expect(assets).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expectCrossOriginIsolation(response);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers?: HeadersInit; method?: string },
    ];
    expect(url).toBe("https://api.daopk.test/internal/movie/550-fight-club");
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-token");
  });

  it("proxies sitemap paths regardless of user agent", async () => {
    const fetchMock = stubInternalFetch();
    const { env, assets } = makeEnv();

    const response = await handleRequest(browser("/sitemap-media-en-0001.xml", "HEAD"), env);

    expect(assets).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers?: HeadersInit; method?: string },
    ];
    expect(url).toBe("https://api.daopk.test/internal/sitemap-media-en-0001.xml");
    expect(init.method).toBe("HEAD");
  });

  it("serves SPA assets for browser SEO paths and unknown routes", async () => {
    const fetchMock = stubInternalFetch();
    const { env, assets } = makeEnv();
    const request = browser("/blog/building-a-tiny-web-os");

    const response = await handleRequest(request, env);

    expect(assets).toHaveBeenCalledWith(request);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expectCrossOriginIsolation(response);
    await expect(response.text()).resolves.toContain('<div id="app"></div>');
  });

  it("does not proxy non-SEO bot runtime or asset paths", async () => {
    const fetchMock = stubInternalFetch();
    const { env, assets } = makeEnv();
    const request = crawler("/public/photos/index.json");

    await handleRequest(request, env);

    expect(assets).toHaveBeenCalledWith(request);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes the proxy predicate for route coverage", () => {
    expect(isInternalProxyRequest(crawler("/vi/tv/123-good-show/season/1/episode/2"))).toBe(true);
    expect(isInternalProxyRequest(browser("/sitemap.xml"))).toBe(true);
    expect(isInternalProxyRequest(crawler("/assets/index.js"))).toBe(false);
    expect(
      isInternalProxyRequest(
        new Request("https://daopk.me/movie/550-fight-club", { method: "POST" }),
      ),
    ).toBe(false);
  });

  it("returns noindex 500 when the internal token is missing", async () => {
    const { env } = makeEnv();
    const response = await handleRequest(crawler("/movie/550-fight-club"), {
      ...env,
      INTERNAL_API_TOKEN: "",
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expectCrossOriginIsolation(response);
  });
});
