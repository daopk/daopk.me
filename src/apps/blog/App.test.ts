import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";

import { AppContextInjectionKey, type AppContext } from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import { VfsError } from "~/core/vfs/errors";

import Blog from "./App.vue";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

async function waitForContent(wrapper: VueWrapper, timeoutMs = 1500): Promise<void> {
  await vi.waitFor(
    () => {
      if (!wrapper.find(".blog__content").exists()) {
        throw new Error("content not yet rendered");
      }
    },
    { timeout: timeoutMs, interval: 25 },
  );
}

async function waitForIndex(wrapper: VueWrapper, timeoutMs = 1500): Promise<void> {
  await vi.waitFor(
    () => {
      if (!wrapper.find(".blog__index").exists()) {
        throw new Error("index not yet rendered");
      }
    },
    { timeout: timeoutMs, interval: 25 },
  );
}

async function waitForIndexItems(wrapper: VueWrapper, timeoutMs = 1500): Promise<void> {
  await vi.waitFor(
    () => {
      if (wrapper.findAll(".blog__index-title").length === 0) {
        throw new Error("index items not yet rendered");
      }
    },
    { timeout: timeoutMs, interval: 25 },
  );
}

const blogContext: AppContext = Object.freeze({
  manifestId: "blog",
  handleId: "h-blog-test",
  args: Object.freeze({
    slug: "field-notes",
    path: "/home/posts/field-notes.md",
  }),
});

const blogIndexContext: AppContext = Object.freeze({
  manifestId: "blog",
  handleId: "h-blog-test",
  args: Object.freeze({}),
});

type BlogKernelSource = string | null | Readonly<Record<string, string | null>>;

function entriesFromSourceMap(source: Readonly<Record<string, string | null>>) {
  return Object.keys(source).map((path) => ({
    kind: "file" as const,
    name: path.split("/").pop() ?? path,
    path,
    readonly: false,
    size: source[path]?.length ?? 0,
    updatedAt: 0,
  }));
}

function makeKernel(source: BlogKernelSource = "# Field Notes\n\nBlog body") {
  return {
    vfs: {
      stat: vi.fn(async () => null),
      list: vi.fn(async () =>
        typeof source === "object" && source !== null ? entriesFromSourceMap(source) : [],
      ),
      read: vi.fn(async () => null),
      readText: vi.fn(async (path: string) => {
        if (source === null) {
          throw new VfsError("NOT_FOUND", `Path not found: ${path}`, { path });
        }
        if (typeof source === "object") {
          const value = source[path];
          if (value === undefined || value === null) {
            throw new VfsError("NOT_FOUND", `Path not found: ${path}`, { path });
          }
          return value;
        }
        return source;
      }),
      write: vi.fn(async () => null),
      writeText: vi.fn(async () => null),
      mkdir: vi.fn(async () => null),
      remove: vi.fn(async () => false),
    },
    events: {
      on: vi.fn(() => vi.fn()),
    },
  } as unknown as Kernel;
}

function wrap(kernel: Kernel = makeKernel(), context: AppContext = blogContext) {
  return defineComponent({
    provide: () => ({
      [KernelInjectionKey as unknown as symbol]: kernel,
      [AppContextInjectionKey as unknown as symbol]: context,
    }),
    render() {
      return h(Blog);
    },
  });
}

describe("Blog app", () => {
  it("renders the latest-post index when launched without a slug", async () => {
    const wrapper = mount(
      wrap(
        makeKernel({
          "/home/posts/old-post.md": `---
title: "Old Post"
date: "2026-05-01"
---
Old body`,
          "/home/posts/new-post.md": `---
title: "New Post"
date: "2026-05-30"
---
New body`,
        }),
        blogIndexContext,
      ),
    );

    await waitForIndexItems(wrapper);

    expect(wrapper.find(".blog__index").text()).toContain("Latest posts");
    expect(wrapper.findAll(".blog__index-title").map((row) => row.text())).toEqual([
      "New Post",
      "Old Post",
    ]);
  });

  it("opens an index item in the reader and returns to the index", async () => {
    const wrapper = mount(
      wrap(
        makeKernel({
          "/home/posts/new-post.md": `---
title: "New Post"
date: "2026-05-30"
---
New body`,
        }),
        blogIndexContext,
      ),
    );

    await waitForIndexItems(wrapper);
    await wrapper.find(".blog__index-item").trigger("click");
    await waitForContent(wrapper, 5000);

    expect(wrapper.find(".blog__content").text()).toContain("New Post");
    expect(wrapper.find(".blog__content").text()).toContain("New body");

    await wrapper.find(".blog__back").trigger("click");
    await waitForIndex(wrapper);
    expect(wrapper.find(".blog__index").text()).toContain("Latest posts");
  });

  it("renders the seeded VFS post from launch args", async () => {
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper);

    expect(wrapper.html()).toContain("Field Notes");
    expect(kernel.vfs.readText).toHaveBeenCalledWith("/home/posts/field-notes.md", {
      handleId: "h-blog-test",
    });
  });

  it("renders an in-app 404 for a missing post", async () => {
    const wrapper = mount(wrap(makeKernel(null)));

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Post not found");
      expect(wrapper.text()).toContain("field-notes");
    });
  });

  it("propagates injected handleId onto the article in dev", async () => {
    const wrapper = mount(wrap());

    await waitForContent(wrapper);

    expect(wrapper.find("article.blog").attributes("data-handle-id")).toBe("h-blog-test");
  });
});
