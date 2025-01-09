import { describe, expect, it } from "vitest";

import {
  BROWSER_HOME_URL,
  isEmbeddablePreviewUrl,
  resolveBrowserTarget,
  useBrowser,
} from "./useBrowser";

describe("isEmbeddablePreviewUrl", () => {
  it("allows http and https preview attempts", () => {
    expect(isEmbeddablePreviewUrl("http://localhost:5173/")).toBe(true);
    expect(isEmbeddablePreviewUrl("http://[::1]:5173/")).toBe(true);
    expect(isEmbeddablePreviewUrl("https://example.com/")).toBe(true);
    expect(isEmbeddablePreviewUrl("https://www.google.com/")).toBe(true);
    expect(isEmbeddablePreviewUrl("https://www.youtube.com/embed/IQsLEaj89bg")).toBe(true);
    expect(isEmbeddablePreviewUrl("https://www.youtube-nocookie.com/embed/IQsLEaj89bg")).toBe(true);
  });

  it("blocks non-web protocols from iframe preview", () => {
    expect(isEmbeddablePreviewUrl("file:///tmp/a.txt")).toBe(false);
    expect(isEmbeddablePreviewUrl("javascript:alert(1)")).toBe(false);
    expect(isEmbeddablePreviewUrl("notaurl")).toBe(false);
  });
});

describe("resolveBrowserTarget", () => {
  it("maps blank input to the start page", () => {
    expect(resolveBrowserTarget("   ")).toEqual({
      ok: true,
      target: { kind: "start" },
    });
  });

  it("accepts http and https URLs", () => {
    expect(resolveBrowserTarget("http://example.com")).toEqual({
      ok: true,
      target: { kind: "web", url: "http://example.com/" },
    });
    expect(resolveBrowserTarget("https://example.com/path?q=1")).toEqual({
      ok: true,
      target: { kind: "web", url: "https://example.com/path?q=1" },
    });
  });

  it("prepends https to bare domains", () => {
    expect(resolveBrowserTarget("example.com")).toEqual({
      ok: true,
      target: { kind: "web", url: "https://example.com/" },
    });
    expect(resolveBrowserTarget("127.example.com")).toEqual({
      ok: true,
      target: { kind: "web", url: "https://127.example.com/" },
    });
  });

  it("turns search-like input into a search URL", () => {
    expect(resolveBrowserTarget("vue browser app")).toEqual({
      ok: true,
      target: { kind: "web", url: "https://www.google.com/search?igu=1&q=vue+browser+app" },
    });
    expect(resolveBrowserTarget("daopk")).toEqual({
      ok: true,
      target: { kind: "web", url: "https://www.google.com/search?igu=1&q=daopk" },
    });
  });

  it("accepts host and port inputs without treating the host as a protocol", () => {
    expect(resolveBrowserTarget("localhost:5173")).toEqual({
      ok: true,
      target: { kind: "web", url: "http://localhost:5173/" },
    });
    expect(resolveBrowserTarget("[::1]:5173")).toEqual({
      ok: true,
      target: { kind: "web", url: "http://[::1]:5173/" },
    });
    expect(resolveBrowserTarget("example.com:8080/docs")).toEqual({
      ok: true,
      target: { kind: "web", url: "https://example.com:8080/docs" },
    });
  });

  it("rejects unsupported protocols", () => {
    expect(resolveBrowserTarget("javascript:alert(1)")).toEqual({
      ok: false,
      reason: "Browser can only open http:// and https:// URLs.",
    });
    expect(resolveBrowserTarget("file:///etc/passwd")).toEqual({
      ok: false,
      reason: "Browser can only open http:// and https:// URLs.",
    });
    expect(resolveBrowserTarget("data:text/plain,hello")).toEqual({
      ok: false,
      reason: "Browser can only open http:// and https:// URLs.",
    });
  });
});

describe("useBrowser", () => {
  it("starts on the Google homepage", () => {
    const browser = useBrowser();

    expect(browser.current.value).toEqual({
      kind: "web",
      title: "www.google.com",
      url: BROWSER_HOME_URL,
    });
    expect(browser.iframeSrc.value).toBe(BROWSER_HOME_URL);
    expect(browser.address.value).toBe(BROWSER_HOME_URL);
    expect(browser.message.value).toBe(`Loading ${BROWSER_HOME_URL}`);
  });

  it("opens a launch URL by replacing the initial history entry", () => {
    const browser = useBrowser({ initialUrl: "example.com" });

    expect(browser.current.value).toEqual({
      kind: "web",
      title: "example.com",
      url: "https://example.com/",
    });
    expect(browser.historyLength.value).toBe(1);
    expect(browser.canGoBack.value).toBe(false);
  });

  it("falls back to the Google homepage for invalid launch args", () => {
    const browser = useBrowser({ initialUrl: "javascript:alert(1)" });

    expect(browser.current.value).toEqual({
      kind: "web",
      title: "www.google.com",
      url: BROWSER_HOME_URL,
    });
    expect(browser.iframeSrc.value).toBe(BROWSER_HOME_URL);
  });

  it("navigates, goes home, and traverses session history", () => {
    const browser = useBrowser();

    expect(browser.navigate("example.com")).toBe(true);
    expect(browser.goHome()).toBe(true);

    expect(browser.historyLength.value).toBe(3);
    expect(browser.historyIndex.value).toBe(2);
    expect(browser.current.value).toEqual({
      kind: "web",
      title: "www.google.com",
      url: BROWSER_HOME_URL,
    });

    expect(browser.goBack()).toBe(true);
    expect(browser.iframeSrc.value).toBe("https://example.com/");
    expect(browser.goForward()).toBe(true);
    expect(browser.iframeSrc.value).toBe(BROWSER_HOME_URL);
  });

  it("attempts previews for arbitrary web entries", () => {
    const browser = useBrowser();

    expect(browser.navigate("google.com")).toBe(true);

    expect(browser.current.value).toEqual({
      kind: "web",
      title: "google.com",
      url: "https://google.com/",
    });
    expect(browser.canPreview.value).toBe(true);
    expect(browser.isLoading.value).toBe(true);
    expect(browser.previewBlocked.value).toBe(false);
    expect(browser.iframeSrc.value).toBe("https://google.com/");
    expect(browser.message.value).toBe("Loading https://google.com/");
  });

  it("marks iframe loads as complete", () => {
    const browser = useBrowser();

    expect(browser.navigate("google.com")).toBe(true);
    expect(browser.finishLoad()).toBe(true);

    expect(browser.isLoading.value).toBe(false);
    expect(browser.message.value).toBe("Loaded https://google.com/");
  });

  it("does not mutate history when navigation is rejected", () => {
    const browser = useBrowser();

    expect(browser.navigate("https://example.com")).toBe(true);
    expect(browser.navigate("file:///tmp/a.txt")).toBe(false);

    expect(browser.historyLength.value).toBe(2);
    expect(browser.iframeSrc.value).toBe("https://example.com/");
    expect(browser.message.value).toBe("Browser can only open http:// and https:// URLs.");
  });

  it("reloads instead of duplicating the current URL", () => {
    const browser = useBrowser();

    expect(browser.navigate("example.com")).toBe(true);
    const firstKey = browser.iframeKey.value;

    expect(browser.navigate("https://example.com/")).toBe(true);

    expect(browser.historyLength.value).toBe(2);
    expect(browser.reloadKey.value).toBe(1);
    expect(browser.iframeKey.value).not.toBe(firstKey);
    expect(browser.message.value).toBe("Loading https://example.com/");
  });

  it("marks the current preview as blocked when the iframe reports an error", () => {
    const browser = useBrowser();

    expect(browser.navigate("google.com")).toBe(true);
    browser.markPreviewError();

    expect(browser.reloadKey.value).toBe(0);
    expect(browser.previewBlocked.value).toBe(true);
    expect(browser.iframeSrc.value).toBeNull();
    expect(browser.message.value).toBe("This site could not be embedded. Open externally.");
  });

  it("reloads and retries a preview after an iframe error", () => {
    const browser = useBrowser();

    expect(browser.navigate("google.com")).toBe(true);
    browser.markPreviewError();
    expect(browser.reload()).toBe(true);

    expect(browser.reloadKey.value).toBe(1);
    expect(browser.previewBlocked.value).toBe(false);
    expect(browser.iframeSrc.value).toBe("https://google.com/");
    expect(browser.message.value).toBe("Loading https://google.com/");
  });

  it("treats re-submitting the current arbitrary URL as a reload", () => {
    const browser = useBrowser();

    expect(browser.navigate("google.com")).toBe(true);
    expect(browser.navigate("https://google.com/")).toBe(true);

    expect(browser.reloadKey.value).toBe(1);
    expect(browser.iframeSrc.value).toBe("https://google.com/");
    expect(browser.message.value).toBe("Loading https://google.com/");
  });

  it("exposes browser history menus and jumps to selected entries", () => {
    const browser = useBrowser();

    expect(browser.navigate("example.com")).toBe(true);
    expect(browser.navigate("vue browser app")).toBe(true);
    expect(browser.goHome()).toBe(true);

    expect(browser.backHistory.value.map(({ entry }) => entry.title)).toEqual([
      "Search: vue browser app",
      "example.com",
      "www.google.com",
    ]);
    expect(browser.forwardHistory.value).toEqual([]);

    expect(browser.jumpToHistory(1)).toBe(true);

    expect(browser.current.value).toEqual({
      kind: "web",
      title: "example.com",
      url: "https://example.com/",
    });
    expect(browser.forwardHistory.value.map(({ entry }) => entry.title)).toEqual([
      "Search: vue browser app",
      "www.google.com",
    ]);
  });
});
