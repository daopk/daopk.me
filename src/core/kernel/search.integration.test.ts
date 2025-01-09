/**
 * Integration coverage for `kernel.search.query`.
 *
 * Exercises the kernel singleton — built-in commands registered during
 * `kernel.init` must be queryable, and registry events flowing through
 * the live `EventBus` must drive incremental adapter updates without
 * any explicit rebuild from the caller.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, markRaw, type Component } from "vue";

import "fake-indexeddb/auto";

import type { AppManifest } from "~/types/app";

import { kernel } from "./index";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon: Component = markRaw(defineComponent({ template: "<svg />" }));

function app(overrides: Partial<AppManifest> & { id: string }): AppManifest {
  return {
    name: overrides.name ?? overrides.id,
    icon: StubIcon,
    category: "system",
    component: () => Promise.resolve({ default: StubIcon }),
    ...overrides,
  };
}

describe("kernel.search (integration)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
  });

  it("resolves to [] for an empty query", async () => {
    await expect(kernel.search.query("")).resolves.toEqual([]);
    await expect(kernel.search.query("   ")).resolves.toEqual([]);
  });

  it("indexes built-in commands at init (theme:toggle, finder:open, ...)", async () => {
    const themeHits = await kernel.search.query("theme");
    expect(themeHits.some((h) => h.kind === "command" && h.id === "theme:toggle")).toBe(true);

    const finderHits = await kernel.search.query("finder");
    expect(finderHits.some((h) => h.kind === "command" && h.id === "finder:open")).toBe(true);
  });

  it("matches `keywords` aliases (e.g. 'dark' resolves theme:toggle)", async () => {
    const hits = await kernel.search.query("dark");
    expect(hits.some((h) => h.id === "theme:toggle")).toBe(true);
  });

  it("multi-word queries use OR semantics (no zero-hit when tokens land in different fields)", async () => {
    const hits = await kernel.search.query("theme dark");
    expect(hits.some((h) => h.id === "theme:toggle")).toBe(true);
  });

  it("re-indexes incrementally when an app is registered AFTER init", async () => {
    await expect(kernel.search.query("fieldnotes")).resolves.toEqual([]);

    kernel.apps.register(app({ id: "fieldnotes", name: "Fieldnotes", category: "productivity" }));

    const hits = await kernel.search.query("fieldnotes");
    expect(hits.some((h) => h.kind === "app" && h.id === "fieldnotes")).toBe(true);

    kernel.apps.unregister("fieldnotes");
    const afterRemove = await kernel.search.query("fieldnotes");
    expect(afterRemove.every((h) => h.id !== "fieldnotes")).toBe(true);
  });

  it("re-indexes incrementally when a command is registered AFTER init", async () => {
    const dispose = kernel.commands.register({
      id: "fs:hibernate",
      title: "Hibernate System",
      scope: "global",
      run: () => undefined,
    });

    const hits = await kernel.search.query("hibernate");
    expect(hits.some((h) => h.id === "fs:hibernate")).toBe(true);

    dispose();
    const afterDispose = await kernel.search.query("hibernate");
    expect(afterDispose.every((h) => h.id !== "fs:hibernate")).toBe(true);
  });

  it("apps.unregister(unknown) is a no-op (no event fires, index unchanged)", async () => {
    const before = await kernel.search.query("theme");
    const eventSpy = vi.fn();
    const off = kernel.events.on("app.unregistered", eventSpy);

    kernel.apps.unregister("never-registered-app-id");

    expect(eventSpy).not.toHaveBeenCalled();
    const after = await kernel.search.query("theme");
    expect(after.length).toBe(before.length);

    off();
  });

  it("respects the kind filter end-to-end", async () => {
    const onlyApps = await kernel.search.query("theme", { kind: "app" });
    expect(onlyApps.every((h) => h.kind === "app")).toBe(true);

    const onlyCommands = await kernel.search.query("theme", { kind: "command" });
    expect(onlyCommands.every((h) => h.kind === "command")).toBe(true);
    expect(onlyApps.length).toBe(0);
  });

  it("updates VFS search results after write and remove events", async () => {
    kernel.apps.register(app({ id: "search-vfs-writer", category: "system" }));
    const handle = await kernel.apps.launch("search-vfs-writer");
    const path = `/home/search-${Date.now()}.md`;

    await kernel.vfs.writeText(path, "# Searchable Note\n\norchid body token", {
      handleId: handle.id,
      mimeType: "text/markdown",
    });

    await vi.waitFor(async () => {
      const hits = await kernel.search.query("orchid", { kind: "vfs" });
      expect(hits.some((h) => h.id === path)).toBe(true);
    });

    await kernel.vfs.remove(path, { handleId: handle.id });

    await vi.waitFor(async () => {
      const hits = await kernel.search.query("orchid", { kind: "vfs" });
      expect(hits.every((h) => h.id !== path)).toBe(true);
    });
  });

  it("resolves to [] after dispose (adapter torn down)", async () => {
    kernel.dispose();
    await expect(kernel.search.query("theme")).resolves.toEqual([]);
  });
});
