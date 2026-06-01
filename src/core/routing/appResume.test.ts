import { describe, expect, it, vi } from "vitest";

import type { KernelEventsFacade } from "~/types/kernel";

import {
  emitAppResume,
  resolveAppResume,
  type AppResumeContext,
  type AppResumeEmission,
} from "./appResume";

function context(overrides: Partial<AppResumeContext> = {}): AppResumeContext {
  return {
    manifestId: "finder",
    source: "api",
    resolveHandleId: () => undefined,
    manifestHasSettings: () => false,
    ...overrides,
  };
}

describe("resolveAppResume", () => {
  it("resolves a finder reveal emission, carrying the optional reveal target", () => {
    const emission = resolveAppResume(
      context({
        manifestId: "finder",
        args: { path: "/portfolio", reveal: "/portfolio/x.md" },
        source: "spotlight",
      }),
    );

    expect(emission).toEqual({
      event: "finder.reveal.requested",
      payload: { path: "/portfolio", reveal: "/portfolio/x.md", source: "spotlight" },
    });
  });

  it("omits reveal when it is not a string", () => {
    const emission = resolveAppResume(context({ manifestId: "finder", args: { path: "/a" } }));

    expect(emission).toEqual({
      event: "finder.reveal.requested",
      payload: { path: "/a", source: "api" },
    });
  });

  it("preserves deeplink source for finder path resumes", () => {
    const emission = resolveAppResume(
      context({ manifestId: "finder", args: { path: "/a" }, source: "deeplink" }),
    );

    expect(emission).toEqual({
      event: "finder.reveal.requested",
      payload: { path: "/a", source: "deeplink" },
    });
  });

  it("returns null for finder without a path", () => {
    expect(resolveAppResume(context({ manifestId: "finder", args: {} }))).toBeNull();
  });

  it("resolves a settings section emission for a valid section", () => {
    const emission = resolveAppResume(
      context({ manifestId: "settings", args: { section: "dock" } }),
    );

    expect(emission).toEqual({
      event: "settings.section.requested",
      payload: { section: "dock" },
    });
  });

  it("returns null for settings with an unknown section", () => {
    expect(
      resolveAppResume(context({ manifestId: "settings", args: { section: "nope" } })),
    ).toBeNull();
  });

  it("resolves an app-settings emission and includes the resolved handle id", () => {
    const emission = resolveAppResume(
      context({
        manifestId: "calendar",
        args: { pane: "settings" },
        manifestHasSettings: () => true,
        resolveHandleId: () => "h-1",
      }),
    );

    expect(emission).toEqual({
      event: "app.settings.requested",
      payload: { manifestId: "calendar", handleId: "h-1" },
    });
  });

  it("omits the handle id when none is resolved", () => {
    const emission = resolveAppResume(
      context({
        manifestId: "calendar",
        args: { pane: "settings" },
        manifestHasSettings: () => true,
        resolveHandleId: () => undefined,
      }),
    );

    expect(emission).toEqual({
      event: "app.settings.requested",
      payload: { manifestId: "calendar" },
    });
  });

  it("returns null for app-settings args when the manifest has no settings", () => {
    expect(
      resolveAppResume(
        context({
          manifestId: "calendar",
          args: { pane: "settings" },
          manifestHasSettings: () => false,
        }),
      ),
    ).toBeNull();
  });

  it("resolves a blog emission for a deeplink even without args", () => {
    const emission = resolveAppResume(
      context({ manifestId: "blog", args: undefined, source: "deeplink" }),
    );

    expect(emission).toEqual({
      event: "blog.open.requested",
      payload: { source: "deeplink" },
    });
  });

  it("resolves a blog emission with slug/path when present", () => {
    const emission = resolveAppResume(
      context({ manifestId: "blog", args: { slug: "hello", path: "/blog/hello" }, source: "menu" }),
    );

    expect(emission).toEqual({
      event: "blog.open.requested",
      payload: { source: "menu", slug: "hello", path: "/blog/hello" },
    });
  });

  it("returns null for a non-deeplink blog launch without args", () => {
    expect(
      resolveAppResume(context({ manifestId: "blog", args: undefined, source: "api" })),
    ).toBeNull();
  });

  it("returns null for an unknown manifest", () => {
    expect(resolveAppResume(context({ manifestId: "unknown", args: { path: "/x" } }))).toBeNull();
  });
});

describe("emitAppResume", () => {
  it("emits the resolved channel and payload on the event bus", () => {
    const emit = vi.fn();
    const events = { emit } as unknown as KernelEventsFacade;
    const emission: AppResumeEmission = {
      event: "app.settings.requested",
      payload: { manifestId: "calendar", handleId: "h-1" },
    };

    emitAppResume(events, emission);

    expect(emit).toHaveBeenCalledWith("app.settings.requested", {
      manifestId: "calendar",
      handleId: "h-1",
    });
  });
});
