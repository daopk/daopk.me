import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

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

function blogOpenListener(
  kernel: Kernel,
): (payload: KernelEventPayloads["blog.open.requested"]) => void {
  const eventsOn = kernel.events.on as unknown as {
    mock: {
      calls: [string, (payload: KernelEventPayloads["blog.open.requested"]) => void][];
    };
  };
  const call = eventsOn.mock.calls.find(([event]) => event === "blog.open.requested");

  if (!call) {
    throw new Error("Blog open listener was not registered.");
  }

  return call[1];
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
    expect(wrapper.find(".blog__eyebrow").exists()).toBe(false);
    expect(wrapper.findAll(".blog__index-title").map((row) => row.text())).toEqual([
      "New Post",
      "Old Post",
    ]);
  });

  it("opens an index item in the reader and returns to the index", async () => {
    window.history.replaceState({ preserved: true }, "", "/");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
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

    expect(replaceSpy).toHaveBeenCalledWith({ preserved: true }, "", "/blog/new-post");
    expect(window.location.pathname).toBe("/blog/new-post");
    expect(wrapper.find(".blog__content").text()).toContain("New Post");
    expect(wrapper.find(".blog__content").text()).toContain("New body");

    await wrapper.find(".blog__back").trigger("click");
    await waitForIndex(wrapper);

    expect(replaceSpy).toHaveBeenLastCalledWith({ preserved: true }, "", "/blog");
    expect(window.location.pathname).toBe("/blog");
    expect(wrapper.find(".blog__index").text()).toContain("Latest posts");
  });

  it("replaces the URL for blog.open.requested events with valid slugs", async () => {
    window.history.replaceState({ preserved: "event" }, "", "/apps/blog");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const kernel = makeKernel({
      "/home/posts/event-post.md": `---
title: "Event Post"
date: "2026-05-30"
---
Event body`,
    });
    const wrapper = mount(wrap(kernel, blogIndexContext));

    blogOpenListener(kernel)({
      source: "deeplink",
      slug: "event-post",
      path: "/home/posts/event-post.md",
    });
    await waitForContent(wrapper, 5000);

    expect(replaceSpy).toHaveBeenCalledWith({ preserved: "event" }, "", "/blog/event-post");
    expect(window.location.pathname).toBe("/blog/event-post");
    expect(wrapper.find(".blog__content").text()).toContain("Event Post");
  });

  it("does not create post URLs for unsafe or missing blog slugs", async () => {
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const kernel = makeKernel(null);
    mount(wrap(kernel, blogIndexContext));
    const openBlog = blogOpenListener(kernel);

    openBlog({ source: "deeplink", slug: "FIELD-NOTES" });

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");

    openBlog({ source: "deeplink" });

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenLastCalledWith(null, "", "/blog");
    expect(replaceSpy).not.toHaveBeenCalledWith(expect.anything(), "", "/blog/undefined");
    expect(window.location.pathname).toBe("/blog");
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
