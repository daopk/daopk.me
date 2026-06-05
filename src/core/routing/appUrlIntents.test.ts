import { defineComponent, type Component } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consumeInitialAppUrlIntent,
  hasAutoGuestLoginUrlIntent,
  hasRegisteredAppUrlIntent,
  isFirstPartyAppProtocolUrl,
  parseAppProtocolIntent,
  parseAppUrlIntent,
  parseYouTubePlayerUrlIntent,
  resetInitialAppUrlIntentLatch,
  youtubePlayerVideoIdFromArgs,
} from "./appUrlIntents";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

const debugWarnSpy = vi.fn();

vi.mock("~/core/debug", () => ({
  debugWarn: (...args: unknown[]): void => debugWarnSpy(...args),
  debugLog: vi.fn(),
}));

const StubIcon = defineComponent({ template: "<svg />" });

function manifest(id: string): AppManifest {
  return {
    id,
    name: id,
    icon: StubIcon as Component,
    category: "system",
    component: () => Promise.resolve({ default: defineComponent({ template: "<div />" }) }),
  };
}

function makeKernel(ids: string[]): {
  kernel: Kernel;
  eventsEmit: ReturnType<typeof vi.fn>;
  appsList: ReturnType<typeof vi.fn>;
} {
  const eventsEmit = vi.fn();
  const appsList = vi.fn(() => ids.map((id) => manifest(id)));

  return {
    eventsEmit,
    appsList,
    kernel: {
      apps: {
        list: appsList,
      },
      events: {
        emit: eventsEmit,
      },
    } as unknown as Kernel,
  };
}

describe("app URL intents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetInitialAppUrlIntentLatch();
    debugWarnSpy.mockReset();
    vi.clearAllMocks();
  });

  it("parses `/apps/:manifestId` as an app launch intent", () => {
    expect(parseAppUrlIntent("/apps/about")).toEqual({
      kind: "app",
      manifestId: "about",
    });

    expect(parseAppUrlIntent("https://daopk.me/apps/terminal")).toEqual({
      kind: "app",
      manifestId: "terminal",
    });
  });

  it("maps Settings `tab` and `section` query aliases to launch args", () => {
    expect(parseAppUrlIntent("/apps/settings?tab=background")).toEqual({
      kind: "app",
      manifestId: "settings",
      args: { section: "background" },
    });

    expect(parseAppUrlIntent("/apps/settings?section=privacy")).toEqual({
      kind: "app",
      manifestId: "settings",
      args: { section: "privacy" },
    });

    expect(parseAppUrlIntent("/apps/settings?section=dock")).toEqual({
      kind: "app",
      manifestId: "settings",
      args: { section: "dock" },
    });
  });

  it("maps generic app settings panes to launch args", () => {
    expect(parseAppUrlIntent("/apps/calendar?pane=settings")).toEqual({
      kind: "app",
      manifestId: "calendar",
      args: { pane: "settings" },
    });

    expect(parseAppUrlIntent("/apps/calendar?pane=details")).toEqual({
      kind: "app",
      manifestId: "calendar",
    });
  });

  it("maps Finder path query to launch args", () => {
    expect(parseAppUrlIntent("/apps/finder?path=/home/docs")).toEqual({
      kind: "app",
      manifestId: "finder",
      args: { path: "/home/docs" },
    });

    expect(parseAppUrlIntent("/apps/finder?path=%2Fhome%2Fdocs%2Fnote.txt")).toEqual({
      kind: "app",
      manifestId: "finder",
      args: { path: "/home/docs/note.txt" },
    });
  });

  it("does not expose Finder reveal query args", () => {
    expect(parseAppUrlIntent("/apps/finder?path=/home/docs&reveal=/home/docs/note.txt")).toEqual({
      kind: "app",
      manifestId: "finder",
      args: { path: "/home/docs" },
    });
  });

  it("ignores invalid Finder path query values", () => {
    expect(parseAppUrlIntent("/apps/finder?path=relative")).toEqual({
      kind: "app",
      manifestId: "finder",
    });

    expect(parseAppUrlIntent("/apps/finder?path=")).toEqual({
      kind: "app",
      manifestId: "finder",
    });
  });

  it("maps YouTube Player query values to launch args", () => {
    expect(parseAppUrlIntent("/apps/youtube-player?videoId=IQsLEaj89bg")).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { videoId: "IQsLEaj89bg" },
    });

    expect(
      parseAppUrlIntent(
        "/apps/youtube-player?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DIQsLEaj89bg",
      ),
    ).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { url: "https://www.youtube.com/watch?v=IQsLEaj89bg" },
    });

    expect(parseAppUrlIntent("/apps/youtube-player?videoId=IQsLEaj89bg&autoplay=1")).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { videoId: "IQsLEaj89bg", autoplay: true },
    });
  });

  it.each([
    ["watch URL", "https://www.youtube.com/watch?v=IQsLEaj89bg"],
    ["short URL", "https://youtu.be/IQsLEaj89bg"],
    ["embed URL", "https://www.youtube.com/embed/IQsLEaj89bg"],
    ["shorts URL", "https://www.youtube.com/shorts/IQsLEaj89bg"],
    ["live URL", "https://www.youtube.com/live/IQsLEaj89bg"],
    ["mobile URL", "https://m.youtube.com/watch?v=IQsLEaj89bg"],
    ["music URL", "https://music.youtube.com/watch?v=IQsLEaj89bg"],
  ])("parses YouTube Player URL intents from %s", (_label, url) => {
    expect(parseYouTubePlayerUrlIntent(url)).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { url },
    });
  });

  it("can mark YouTube Player URL intents as autoplay requests", () => {
    const url = "https://www.youtube.com/watch?v=IQsLEaj89bg";

    expect(parseYouTubePlayerUrlIntent(url, { autoplay: true })).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { url, autoplay: true },
    });
  });

  it.each([
    ["non-YouTube host", "https://example.com/watch?v=IQsLEaj89bg"],
    ["invalid video id", "https://www.youtube.com/watch?v=not-a-video-id"],
    ["unsupported protocol", "ftp://www.youtube.com/watch?v=IQsLEaj89bg"],
    ["missing protocol", "youtube.com/watch?v=IQsLEaj89bg"],
  ])("rejects YouTube Player URL intents for %s", (_label, url) => {
    expect(parseYouTubePlayerUrlIntent(url)).toEqual({ kind: "none" });
  });

  it("parses whitelisted YouTube Player protocol video links", () => {
    expect(parseAppProtocolIntent("youtube-player://video/M7lc1UVf-VE")).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { videoId: "M7lc1UVf-VE" },
    });

    expect(parseAppUrlIntent("youtube-player://video/M7lc1UVf-VE")).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { videoId: "M7lc1UVf-VE" },
    });

    expect(parseAppProtocolIntent("youtube-player://video/M7lc1UVf-VE?autoplay=1")).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { videoId: "M7lc1UVf-VE", autoplay: true },
    });
  });

  it("parses whitelisted YouTube Player protocol URL links", () => {
    const youtubeUrl = "https://www.youtube.com/watch?v=M7lc1UVf-VE";

    expect(
      parseAppProtocolIntent(`youtube-player://url?url=${encodeURIComponent(youtubeUrl)}`),
    ).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { url: youtubeUrl },
    });

    expect(
      parseAppProtocolIntent(
        `youtube-player://url?url=${encodeURIComponent(youtubeUrl)}&autoplay=true`,
      ),
    ).toEqual({
      kind: "app",
      manifestId: "youtube-player",
      args: { url: youtubeUrl, autoplay: true },
    });
  });

  it("normalizes YouTube Player launch args to a video id", () => {
    expect(youtubePlayerVideoIdFromArgs({ videoId: " fY6h5FBTZM8 " })).toBe("fY6h5FBTZM8");
    expect(
      youtubePlayerVideoIdFromArgs({
        url: "https://www.youtube.com/watch?v=fY6h5FBTZM8",
      }),
    ).toBe("fY6h5FBTZM8");
    expect(youtubePlayerVideoIdFromArgs({ url: "https://example.com" })).toBeNull();
    expect(youtubePlayerVideoIdFromArgs(undefined)).toBeNull();
  });

  it("rejects unknown or invalid app protocol links", () => {
    expect(isFirstPartyAppProtocolUrl("youtube-player://video/M7lc1UVf-VE")).toBe(true);
    expect(isFirstPartyAppProtocolUrl("notes://video/M7lc1UVf-VE")).toBe(false);
    expect(parseAppProtocolIntent("notes://video/M7lc1UVf-VE")).toEqual({ kind: "none" });
    expect(parseAppProtocolIntent("youtube-player://watch?v=M7lc1UVf-VE")).toEqual({
      kind: "none",
    });
    expect(parseAppProtocolIntent("youtube-player://video/not-a-video-id")).toEqual({
      kind: "none",
    });
    expect(parseAppProtocolIntent("youtube-player://url")).toEqual({ kind: "none" });
    expect(parseAppProtocolIntent("youtube-player://url?url=https%3A%2F%2Fexample.com")).toEqual({
      kind: "none",
    });
  });

  it("parses `/blog` as the Blog app index launch intent", () => {
    expect(parseAppUrlIntent("/blog")).toEqual({
      kind: "app",
      manifestId: "blog",
    });
  });

  it("parses `/blog/:slug` as the Blog app post launch intent", () => {
    expect(parseAppUrlIntent("/blog/field-notes")).toEqual({
      kind: "app",
      manifestId: "blog",
      args: {
        slug: "field-notes",
        path: "/home/posts/field-notes.md",
      },
    });

    expect(parseAppUrlIntent("https://daopk.me/blog/does-not-exist")).toEqual({
      kind: "app",
      manifestId: "blog",
      args: {
        slug: "does-not-exist",
        path: "/home/posts/does-not-exist.md",
      },
    });
  });

  it("keeps unsafe but decodable blog slugs inside Blog 404 instead of building VFS paths", () => {
    expect(parseAppUrlIntent("/blog/FIELD-NOTES")).toEqual({
      kind: "app",
      manifestId: "blog",
      args: { slug: "FIELD-NOTES" },
    });
  });

  it("ignores unclaimed and malformed routes", () => {
    expect(parseAppUrlIntent("/blogs/xin-chao")).toEqual({ kind: "none" });
    expect(parseAppUrlIntent("/blog/a/b")).toEqual({ kind: "none" });
    expect(parseAppUrlIntent("/blog/hello%2Fworld")).toEqual({ kind: "none" });
    expect(parseAppUrlIntent("/blog/%E0%A4%A")).toEqual({ kind: "none" });
    expect(parseAppUrlIntent("/")).toEqual({ kind: "none" });
  });

  it("emits an app launch request for a registered app deep link", () => {
    const { kernel, eventsEmit } = makeKernel(["about", "terminal", "settings", "calendar"]);

    expect(consumeInitialAppUrlIntent(kernel, "/apps/settings?tab=background")).toBe(true);

    expect(eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "settings",
      source: "deeplink",
      args: { section: "background" },
    });
  });

  it("emits a generic app settings pane launch request", () => {
    const { kernel, eventsEmit } = makeKernel(["calendar"]);

    expect(consumeInitialAppUrlIntent(kernel, "/apps/calendar?pane=settings")).toBe(true);

    expect(eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "calendar",
      source: "deeplink",
      args: { pane: "settings" },
    });
  });

  it("emits a Finder launch request for a URL path", () => {
    const { kernel, eventsEmit } = makeKernel(["finder"]);

    expect(consumeInitialAppUrlIntent(kernel, "/apps/finder?path=%2Fhome%2Fdocs")).toBe(true);

    expect(eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "finder",
      source: "deeplink",
      args: { path: "/home/docs" },
    });
  });

  it("emits a Blog launch request for a registered public post route", () => {
    const { kernel, eventsEmit } = makeKernel(["blog"]);

    expect(consumeInitialAppUrlIntent(kernel, "/blog/field-notes")).toBe(true);

    expect(eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "blog",
      source: "deeplink",
      args: {
        slug: "field-notes",
        path: "/home/posts/field-notes.md",
      },
    });
  });

  it("emits a Blog launch request for the registered public index route", () => {
    const { kernel, eventsEmit } = makeKernel(["blog"]);

    expect(consumeInitialAppUrlIntent(kernel, "/blog")).toBe(true);

    expect(eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "blog",
      source: "deeplink",
    });
  });

  it("fails softly for an unknown app deep link", () => {
    const { kernel, eventsEmit } = makeKernel(["about"]);

    expect(consumeInitialAppUrlIntent(kernel, "/apps/not-real")).toBe(false);

    expect(eventsEmit).not.toHaveBeenCalled();
    expect(debugWarnSpy).toHaveBeenCalledWith("[url-intent]", "unknown app deep link", "not-real");
  });

  it("does not validate manifests for non-app routes", () => {
    const { kernel, eventsEmit, appsList } = makeKernel(["about"]);

    expect(consumeInitialAppUrlIntent(kernel, "/blogs/xin-chao")).toBe(false);

    expect(appsList).not.toHaveBeenCalled();
    expect(eventsEmit).not.toHaveBeenCalled();
  });

  it("detects registered app and Blog URL intents without consuming them", () => {
    const { kernel, eventsEmit } = makeKernel(["about", "blog"]);

    expect(hasRegisteredAppUrlIntent(kernel, "/apps/about")).toBe(true);
    expect(hasRegisteredAppUrlIntent(kernel, "/blog")).toBe(true);
    expect(hasRegisteredAppUrlIntent(kernel, "/blog/field-notes")).toBe(true);
    expect(consumeInitialAppUrlIntent(kernel, "/apps/about")).toBe(true);

    expect(eventsEmit).toHaveBeenCalledTimes(1);
    expect(eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "about",
      source: "deeplink",
    });
  });

  it("detects known auto guest login URL intents before all apps are registered", () => {
    const { kernel, eventsEmit } = makeKernel([]);

    expect(hasAutoGuestLoginUrlIntent(kernel, "/blog")).toBe(true);
    expect(hasAutoGuestLoginUrlIntent(kernel, "/blog/field-notes")).toBe(true);
    expect(hasAutoGuestLoginUrlIntent(kernel, "/apps/calendar")).toBe(true);

    expect(eventsEmit).not.toHaveBeenCalled();
  });

  it("detects registered non-built-in app URL intents for auto guest login", () => {
    const { kernel, eventsEmit } = makeKernel(["custom-tool"]);

    expect(hasAutoGuestLoginUrlIntent(kernel, "/apps/custom-tool")).toBe(true);

    expect(eventsEmit).not.toHaveBeenCalled();
  });

  it("rejects unknown, malformed, and homepage URL intents for auto guest login", () => {
    const { kernel, eventsEmit } = makeKernel([]);

    expect(hasAutoGuestLoginUrlIntent(kernel, "/apps/not-real")).toBe(false);
    expect(hasAutoGuestLoginUrlIntent(kernel, "/blog/a/b")).toBe(false);
    expect(hasAutoGuestLoginUrlIntent(kernel, "/")).toBe(false);

    expect(eventsEmit).not.toHaveBeenCalled();
  });

  it("rejects unknown, malformed, and homepage URL intents without emitting", () => {
    const { kernel, eventsEmit } = makeKernel(["about", "blog"]);

    expect(hasRegisteredAppUrlIntent(kernel, "/apps/not-real")).toBe(false);
    expect(hasRegisteredAppUrlIntent(kernel, "/blog/a/b")).toBe(false);
    expect(hasRegisteredAppUrlIntent(kernel, "/")).toBe(false);

    expect(eventsEmit).not.toHaveBeenCalled();
    expect(debugWarnSpy).not.toHaveBeenCalled();
  });

  it("consumes the initial Blog URL once without mutating browser history", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const { kernel, eventsEmit } = makeKernel(["blog"]);

    expect(consumeInitialAppUrlIntent(kernel, "/blog/field-notes")).toBe(true);
    expect(consumeInitialAppUrlIntent(kernel, "/blog/field-notes")).toBe(false);

    expect(eventsEmit).toHaveBeenCalledTimes(1);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("consumes the initial URL only once per latch cycle", () => {
    const { kernel, eventsEmit } = makeKernel(["about"]);

    expect(consumeInitialAppUrlIntent(kernel, "/apps/about")).toBe(true);
    expect(consumeInitialAppUrlIntent(kernel, "/apps/about")).toBe(false);

    expect(eventsEmit).toHaveBeenCalledTimes(1);
  });
});
