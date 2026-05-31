import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";

import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  type AppChromeBackAction,
  type AppChromeController,
  type AppContext,
} from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import Blog from "./App.vue";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

interface BlogIndexFixture {
  readonly slug: string;
  readonly title?: string | null;
  readonly date?: string | null;
  readonly description?: string | null;
}

interface BlogFetchFixture {
  readonly index?: readonly BlogIndexFixture[];
  readonly posts?: Readonly<Record<string, string>>;
}

const POST_SLUG_PATTERN = /\/([a-z0-9-]+)\.md$/;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function stubBlogFetch(fixture: BlogFetchFixture = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = requestUrl(input);

    if (url.endsWith("/index.json")) {
      if (fixture.index === undefined) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(JSON.stringify(fixture.index), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const match = POST_SLUG_PATTERN.exec(url);
    if (match) {
      const body = fixture.posts?.[match[1]!];
      return body === undefined
        ? new Response("Not found", { status: 404 })
        : new Response(body, { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

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

function makeKernel() {
  return {
    vfs: {
      stat: vi.fn(async () => null),
      list: vi.fn(async () => []),
      read: vi.fn(async () => null),
      readText: vi.fn(async () => null),
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

function wrap(
  kernel: Kernel = makeKernel(),
  context: AppContext = blogContext,
  options: { readonly appChrome?: AppChromeController } = {},
) {
  return defineComponent({
    provide: () => {
      const provide: Record<symbol, unknown> = {
        [KernelInjectionKey as symbol]: kernel,
        [AppContextInjectionKey as symbol]: context,
      };

      if (options.appChrome !== undefined) {
        provide[AppChromeInjectionKey as symbol] = options.appChrome;
      }

      return provide;
    },
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
    stubBlogFetch({
      index: [
        { slug: "old-post", title: "Old Post", date: "2026-05-01" },
        { slug: "new-post", title: "New Post", date: "2026-05-30" },
      ],
    });
    const wrapper = mount(wrap(makeKernel(), blogIndexContext));

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
    stubBlogFetch({
      index: [{ slug: "new-post", title: "New Post", date: "2026-05-30" }],
      posts: {
        "new-post": `---
title: "New Post"
date: "2026-05-30"
---
New body`,
      },
    });
    const wrapper = mount(wrap(makeKernel(), blogIndexContext));

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
    stubBlogFetch({
      posts: {
        "event-post": `---
title: "Event Post"
date: "2026-05-30"
---
Event body`,
      },
    });
    const kernel = makeKernel();
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
    stubBlogFetch();
    const kernel = makeKernel();
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

  it("renders the fetched post from launch args and probes the VFS cache", async () => {
    stubBlogFetch({ posts: { "field-notes": "# Field Notes\n\nNetwork body" } });
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper);

    expect(wrapper.html()).toContain("Field Notes");
    expect(kernel.vfs.readText).toHaveBeenCalledWith("/home/posts/field-notes.md", {
      handleId: "h-blog-test",
    });
  });

  it("hides the in-content back link when mobile app chrome provides back navigation", async () => {
    let backAction: AppChromeBackAction | null = null;
    const appChrome: AppChromeController = {
      setTitle: vi.fn(),
      setBackAction: vi.fn((action) => {
        backAction = action;
      }),
    };
    stubBlogFetch({
      index: [],
      posts: { "field-notes": "# Field Notes\n\nNetwork body" },
    });
    const wrapper = mount(wrap(makeKernel(), blogContext, { appChrome }));

    await waitForContent(wrapper);

    expect(wrapper.find(".blog__back").exists()).toBe(false);
    expect(backAction?.ariaLabel).toBe("Back to Blog");

    backAction?.handler();
    await waitForIndex(wrapper);

    expect(wrapper.find(".blog__index").text()).toContain("Latest posts");
  });

  it("renders an in-app 404 for a missing post", async () => {
    stubBlogFetch();
    const wrapper = mount(wrap(makeKernel()));

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Post not found");
      expect(wrapper.text()).toContain("field-notes");
    });
  });

  it("propagates injected handleId onto the article in dev", async () => {
    stubBlogFetch({ posts: { "field-notes": "# Field Notes\n\nNetwork body" } });
    const wrapper = mount(wrap());

    await waitForContent(wrapper);

    expect(wrapper.find("article.blog").attributes("data-handle-id")).toBe("h-blog-test");
  });
});
