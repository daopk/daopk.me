import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appFallbackBrowserPath,
  normalizeAppBrowserPath,
  replaceBrowserPath,
} from "./appBrowserPaths";

describe("app browser paths", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("builds fallback app paths from manifest ids", () => {
    expect(appFallbackBrowserPath("finder")).toBe("/apps/finder");
    expect(appFallbackBrowserPath("youtube-player")).toBe("/apps/youtube-player");
    expect(appFallbackBrowserPath("space app")).toBe("/apps/space%20app");
  });

  it("normalizes same-origin app paths and rejects unsafe paths", () => {
    const origin = window.location.origin;

    expect(normalizeAppBrowserPath("/blog/post?via=toolbar#read")).toBe(
      "/blog/post?via=toolbar#read",
    );
    expect(normalizeAppBrowserPath(`${origin}/apps/blog`)).toBe("/apps/blog");
    expect(normalizeAppBrowserPath("blog/post")).toBeNull();
    expect(normalizeAppBrowserPath("//example.test/apps/blog")).toBeNull();
    expect(normalizeAppBrowserPath("https://example.test/apps/blog")).toBeNull();
    expect(normalizeAppBrowserPath("")).toBeNull();
  });

  it("replaces browser paths without pushing history and no-ops when unchanged", () => {
    window.history.replaceState({ preserved: true }, "", "/current?x=1#read");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    replaceBrowserPath("/current?x=1#read");

    expect(replaceSpy).not.toHaveBeenCalled();

    replaceBrowserPath("/next?tab=2#pane");

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith({ preserved: true }, "", "/next?tab=2#pane");
    expect(window.location.pathname).toBe("/next");
    expect(window.location.search).toBe("?tab=2");
    expect(window.location.hash).toBe("#pane");
  });
});
