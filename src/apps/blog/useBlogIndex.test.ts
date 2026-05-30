import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import { debugWarn } from "~/core/debug";
import { VfsError, type VfsDirEntry } from "~/core/vfs";

import { parseBlogIndexPost, useBlogIndex, type BlogIndexOptions } from "./useBlogIndex";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function entry(name: string, kind: VfsDirEntry["kind"] = "file"): VfsDirEntry {
  return {
    kind,
    name,
    path: `/home/posts/${name}`,
    readonly: false,
    size: 0,
    updatedAt: 0,
  };
}

function mountHarness(options: Partial<BlogIndexOptions> = {}) {
  let state: ReturnType<typeof useBlogIndex> | undefined;
  const list = options.list ?? vi.fn(async () => []);
  const readText = options.readText ?? vi.fn(async () => null);
  const Harness = defineComponent({
    setup() {
      state = useBlogIndex({
        list,
        readText,
      });

      return () =>
        h("div", {
          "data-status": state?.status.value,
        });
    },
  });

  const wrapper = mount(Harness);

  return {
    list,
    readText,
    get state() {
      if (!state) {
        throw new Error("Harness state was not initialized.");
      }

      return state;
    },
    wrapper,
  };
}

describe("useBlogIndex", () => {
  it("lists valid markdown posts newest first", async () => {
    const sources = new Map([
      [
        "/home/posts/old-post.md",
        `---
title: "Old Post"
date: "2026-05-01"
---
Old body`,
      ],
      [
        "/home/posts/new-post.md",
        `---
title: "New Post"
date: "2026-05-30"
---
New body`,
      ],
      ["/home/posts/no-date.md", "# No Date\n\nFallback body"],
    ]);
    const readText = vi.fn(async (path: string) => sources.get(path) ?? null);
    const { state, list } = mountHarness({
      list: vi.fn(async () => [
        entry("old-post.md"),
        entry("FIELD-NOTES.md"),
        entry("new-post.md"),
        entry("drafts", "directory"),
        entry("no-date.md"),
      ]),
      readText,
    });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("ready");
    });

    expect(list).toHaveBeenCalledWith("/home/posts");
    expect(readText).toHaveBeenCalledWith("/home/posts/old-post.md");
    expect(readText).toHaveBeenCalledWith("/home/posts/new-post.md");
    expect(readText).toHaveBeenCalledWith("/home/posts/no-date.md");
    expect(readText).not.toHaveBeenCalledWith("/home/posts/FIELD-NOTES.md");
    expect(state.posts.value.map((post) => post.slug)).toEqual(["new-post", "old-post", "no-date"]);
  });

  it("uses frontmatter description as the excerpt when available", () => {
    expect(
      parseBlogIndexPost(
        "described-post",
        "/home/posts/described-post.md",
        `---
title: "Described"
description: "A custom summary."
---
# Ignored H1

Body text`,
      ),
    ).toMatchObject({
      excerpt: "A custom summary.",
      title: "Described",
    });
  });

  it("shows empty when there are no valid posts", async () => {
    const { state } = mountHarness({
      list: vi.fn(async () => [entry("FIELD-NOTES.md"), entry("drafts", "directory")]),
    });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("empty");
    });

    expect(state.posts.value).toEqual([]);
  });

  it("treats a missing posts directory as empty", async () => {
    const { state } = mountHarness({
      list: vi.fn(async () => {
        throw new VfsError("NOT_FOUND", "Path not found", { path: "/home/posts" });
      }),
    });

    await vi.waitFor(() => {
      expect(state.empty.value).toBe(true);
    });
  });

  it("sets a generic error for non-404 index failures", async () => {
    const { state } = mountHarness({
      list: vi.fn(async () => {
        throw new VfsError("ADAPTER_UNAVAILABLE", "Adapter down");
      }),
    });

    await vi.waitFor(() => {
      expect(state.loadFailed.value).toBe(true);
    });

    expect(debugWarn).toHaveBeenCalledWith(
      "[blog] failed to load blog index",
      expect.objectContaining({ code: "ADAPTER_UNAVAILABLE" }),
    );
  });
});
