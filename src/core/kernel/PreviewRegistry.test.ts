import { describe, expect, it, vi } from "vitest";

import { PreviewRegistry } from "./PreviewRegistry";
import type { AppPreviewInput, AppPreviewProvider } from "~/types/preview";

const urlInput: AppPreviewInput = Object.freeze({
  kind: "url",
  url: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
});

function makeProvider(id: string, overrides: Partial<AppPreviewProvider> = {}): AppPreviewProvider {
  return {
    id,
    manifestId: id.split(":")[0] ?? id,
    surfaces: ["blog.embed"],
    component: () => Promise.resolve({ default: {} as never }),
    match: () => ({ args: { ok: true } }),
    ...overrides,
  };
}

describe("PreviewRegistry", () => {
  it("adds providers and exposes them via has/get/list", () => {
    const registry = new PreviewRegistry();
    registry.register(makeProvider("youtube-player:video"));

    expect(registry.has("youtube-player:video")).toBe(true);
    expect(registry.get("youtube-player:video")?.id).toBe("youtube-player:video");
    expect(registry.list().map((provider) => provider.id)).toEqual(["youtube-player:video"]);
  });

  it("UPSERTs providers without reshuffling the original tie-break slot", () => {
    const registry = new PreviewRegistry();
    registry.register(makeProvider("a"));
    registry.register(makeProvider("b"));
    const replacement = makeProvider("a", { title: "replacement" });

    registry.register(replacement);

    expect(registry.get("a")).toBe(replacement);
    expect(registry.list().map((provider) => provider.id)).toEqual(["a", "b"]);
  });

  it("sorts by priority descending and tie-breaks by registration order", () => {
    const registry = new PreviewRegistry();
    registry.register(makeProvider("low", { priority: 10 }));
    registry.register(makeProvider("implicit"));
    registry.register(makeProvider("high", { priority: 200 }));

    expect(registry.list().map((provider) => provider.id)).toEqual(["high", "implicit", "low"]);
  });

  it("filters by supported surface", () => {
    const registry = new PreviewRegistry();
    registry.register(makeProvider("blog", { surfaces: ["blog.embed"] }));
    registry.register(makeProvider("finder", { surfaces: ["finder.panel"] }));
    registry.register(makeProvider("both", { surfaces: ["blog.embed", "finder.panel"] }));

    expect(registry.list({ surface: "blog.embed" }).map((provider) => provider.id)).toEqual([
      "blog",
      "both",
    ]);
    expect(registry.list({ surface: "finder.panel" }).map((provider) => provider.id)).toEqual([
      "finder",
      "both",
    ]);
  });

  it("returns a frozen list", () => {
    const registry = new PreviewRegistry();
    registry.register(makeProvider("a"));
    const list = registry.list();

    expect(Object.isFrozen(list)).toBe(true);
    expect(() => {
      (list as AppPreviewProvider[]).push(makeProvider("smuggled"));
    }).toThrow(TypeError);
  });

  it("resolves the first matching provider on the requested surface", () => {
    const registry = new PreviewRegistry();
    const lowMatch = vi.fn(() => ({ args: { provider: "low" } }));
    const highMiss = vi.fn(() => null);
    const highMatch = vi.fn(() => ({ args: { provider: "high" } }));
    registry.register(
      makeProvider("low", {
        priority: 10,
        match: lowMatch,
      }),
    );
    registry.register(
      makeProvider("miss", {
        priority: 200,
        match: highMiss,
      }),
    );
    registry.register(
      makeProvider("high", {
        priority: 150,
        match: highMatch,
      }),
    );

    const resolution = registry.resolve(urlInput, { surface: "blog.embed" });

    expect(resolution?.provider.id).toBe("high");
    expect(resolution?.args).toEqual({ provider: "high" });
    expect(highMiss).toHaveBeenCalledWith(urlInput, "blog.embed");
    expect(highMatch).toHaveBeenCalledWith(urlInput, "blog.embed");
    expect(lowMatch).not.toHaveBeenCalled();
  });

  it("returns null when no provider matches the input or surface", () => {
    const registry = new PreviewRegistry();
    registry.register(makeProvider("finder-only", { surfaces: ["finder.panel"] }));
    registry.register(makeProvider("blog-miss", { match: () => null }));

    expect(registry.resolve(urlInput, { surface: "blog.embed" })).toBeNull();
    expect(registry.resolve(urlInput, { surface: "finder.panel" })).toBeTruthy();
  });

  it("identity-checks disposers", () => {
    const registry = new PreviewRegistry();
    const original = makeProvider("preview");
    const dispose = registry.register(original);
    const replacement = makeProvider("preview", { title: "replacement" });

    registry.register(replacement);
    dispose();

    expect(registry.get("preview")).toBe(replacement);
  });
});
