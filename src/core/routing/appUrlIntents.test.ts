import { defineComponent, type Component } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consumeInitialAppUrlIntent,
  hasRegisteredAppUrlIntent,
  parseAppUrlIntent,
  resetInitialAppUrlIntentLatch,
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

  it("parses `/blog/:slug` as the hidden Blog app launch intent", () => {
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
    expect(parseAppUrlIntent("/blog")).toEqual({ kind: "none" });
    expect(parseAppUrlIntent("/blog/a/b")).toEqual({ kind: "none" });
    expect(parseAppUrlIntent("/blog/hello%2Fworld")).toEqual({ kind: "none" });
    expect(parseAppUrlIntent("/blog/%E0%A4%A")).toEqual({ kind: "none" });
    expect(parseAppUrlIntent("/")).toEqual({ kind: "none" });
  });

  it("emits an app launch request for a registered app deep link", () => {
    const { kernel, eventsEmit } = makeKernel(["about", "terminal", "settings"]);

    expect(consumeInitialAppUrlIntent(kernel, "/apps/settings?tab=background")).toBe(true);

    expect(eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "settings",
      source: "deeplink",
      args: { section: "background" },
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
    expect(hasRegisteredAppUrlIntent(kernel, "/blog/field-notes")).toBe(true);
    expect(consumeInitialAppUrlIntent(kernel, "/apps/about")).toBe(true);

    expect(eventsEmit).toHaveBeenCalledTimes(1);
    expect(eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "about",
      source: "deeplink",
    });
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
