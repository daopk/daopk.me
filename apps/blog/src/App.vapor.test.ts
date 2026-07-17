import { afterEach, describe, expect, it, vi } from "vitest";
import { createComponent, defineVaporComponent, provide, renderEffect } from "vue";
import { mountVaporTest as mount, type VaporTestWrapper } from "~/test/mountVapor";

import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  KernelInjectionKey,
  type AppChromeBackAction,
  type AppChromeController,
  type AppContext,
  type AppPreviewInput,
  type AppPreviewProvider,
  type Kernel,
} from "@daopk/sdk";

import Blog from "./App.vue";

vi.mock("@daopk/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@daopk/sdk")>()),
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
  readonly thumbnail?: {
    readonly url: string;
    readonly width: number;
    readonly height: number;
    readonly alt: string;
  } | null;
}

interface BlogFetchFixture {
  readonly index?: readonly BlogIndexFixture[];
  readonly posts?: Readonly<Record<string, string>>;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

const POST_SLUG_PATTERN = /\/([a-z0-9-]+)\.md$/;

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

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

async function waitForContent(wrapper: VaporTestWrapper, timeoutMs = 1500): Promise<void> {
  await vi.waitFor(
    () => {
      if (!wrapper.find(".blog__content").exists()) {
        throw new Error("content not yet rendered");
      }
    },
    { timeout: timeoutMs, interval: 25 },
  );
}

async function waitForIndex(wrapper: VaporTestWrapper, timeoutMs = 1500): Promise<void> {
  await vi.waitFor(
    () => {
      if (!wrapper.find(".blog__index").exists()) {
        throw new Error("index not yet rendered");
      }
    },
    { timeout: timeoutMs, interval: 25 },
  );
}

async function waitForIndexItems(wrapper: VaporTestWrapper, timeoutMs = 1500): Promise<void> {
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
  const listeners = new Map<string, Set<(payload: Record<string, unknown>) => void>>();

  function emit(channel: string, payload: Record<string, unknown>): void {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  }

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
      emit: vi.fn(emit),
      on: vi.fn((channel: string, listener: (payload: Record<string, unknown>) => void) => {
        const bucket =
          listeners.get(channel) ?? new Set<(payload: Record<string, unknown>) => void>();
        bucket.add(listener);
        listeners.set(channel, bucket);
        return (): void => {
          bucket.delete(listener);
        };
      }),
      once: vi.fn(() => vi.fn()),
      off: vi.fn(),
    },
    previews: {
      register: vi.fn(),
      unregister: vi.fn(),
      list: vi.fn(() => []),
      get: vi.fn(),
      resolve: vi.fn(() => null),
    },
  } as unknown as Kernel;
}

function wrap(
  kernel: Kernel = makeKernel(),
  context: AppContext = blogContext,
  options: { readonly appChrome?: AppChromeController } = {},
) {
  return defineVaporComponent(() => {
    provide(KernelInjectionKey, kernel);
    provide(AppContextInjectionKey, context);
    if (options.appChrome !== undefined) {
      provide(AppChromeInjectionKey, options.appChrome);
    }
    return createComponent(Blog);
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
        {
          slug: "new-post",
          title: "New Post",
          date: "2026-05-30",
          thumbnail: {
            url: "/public/blog/thumbnails/new-post/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
            width: 1024,
            height: 576,
            alt: "New Post thumbnail",
          },
        },
      ],
    });
    const wrapper = mount(wrap(makeKernel(), blogIndexContext));

    await waitForIndexItems(wrapper);

    expect(wrapper.find(".blog__index").text()).toContain("Latest posts");
    expect(wrapper.find(".blog__eyebrow").exists()).toBe(false);
    expect(wrapper.find(".comments").exists()).toBe(false);
    expect(wrapper.findAll(".blog__index-title").map((row) => row.text())).toEqual([
      "New Post",
      "Old Post",
    ]);
    expect(wrapper.find(".blog__index-thumbnail").exists()).toBe(false);
  });

  it("opens an index item in the reader and returns to the index", async () => {
    window.history.replaceState({ preserved: true }, "", "/");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    stubBlogFetch({
      index: [
        {
          slug: "new-post",
          title: "New Post",
          date: "2026-05-30",
          thumbnail: {
            url: "/public/blog/thumbnails/new-post/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp",
            width: 1024,
            height: 576,
            alt: "New Post thumbnail",
          },
        },
      ],
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
    const cover = wrapper.find(".blog__post-cover");
    const coverImage = wrapper.find(".blog__post-cover-image");
    expect(coverImage.attributes("src")).toBe(
      "/public/blog/thumbnails/new-post/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp",
    );
    expect(coverImage.attributes("alt")).toBe("New Post thumbnail");
    expect(coverImage.attributes("width")).toBe("1024");
    expect(coverImage.attributes("height")).toBe("576");
    expect(wrapper.find(".blog__post-shell").element.firstElementChild).toBe(cover.element);
    expect(wrapper.find(".comments").exists()).toBe(false);

    await wrapper.find(".blog__back").trigger("click");
    await waitForIndex(wrapper);

    expect(replaceSpy).toHaveBeenLastCalledWith({ preserved: true }, "", "/blog");
    expect(window.location.pathname).toBe("/blog");
    expect(wrapper.find(".blog__index").text()).toContain("Latest posts");
    expect(wrapper.find(".comments").exists()).toBe(false);
  });

  it("does not render comments when the post is ready", async () => {
    const pendingPost = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.endsWith("/field-notes.md")) {
          return pendingPost.promise;
        }

        return new Response("Not found", { status: 404 });
      }),
    );
    const wrapper = mount(wrap(makeKernel()));

    expect(wrapper.find(".comments").exists()).toBe(false);

    pendingPost.resolve(new Response("# Field Notes\n\nNetwork body", { status: 200 }));
    await waitForContent(wrapper);

    expect(wrapper.find(".comments").exists()).toBe(false);
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
    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "blog",
      handleId: "h-blog-test",
      path: "/home/posts/field-notes.md",
    });
    expect(kernel.events.emit).toHaveBeenCalledWith("app.url.changed", {
      manifestId: "blog",
      handleId: "h-blog-test",
      path: "/blog/field-notes",
    });
    expect(kernel.vfs.readText).toHaveBeenCalledWith("/home/posts/field-notes.md", {
      handleId: "h-blog-test",
    });
    expect(wrapper.find(".blog__post-cover").exists()).toBe(false);
  });

  it("opens whitelisted app protocol links through the shell", async () => {
    stubBlogFetch({
      posts: {
        "field-notes": "[Open video](youtube-player://video/M7lc1UVf-VE)",
      },
    });
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper);

    const link = wrapper.find<HTMLAnchorElement>(".blog__content a");
    expect(link.attributes("href")).toBe("youtube-player://video/M7lc1UVf-VE");

    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "M7lc1UVf-VE", autoplay: true },
    });
  });

  it("opens legacy YouTube URL protocol links through the shell", async () => {
    const youtubeUrl = "https://www.youtube.com/watch?v=u8vJjTH9Igg";
    stubBlogFetch({
      posts: {
        "field-notes": `[Open video](youtube-player://url?url=${youtubeUrl})`,
      },
    });
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper);

    const link = wrapper.find<HTMLAnchorElement>(".blog__content a");
    expect(link.attributes("href")).toBe(`youtube-player://url?url=${youtubeUrl}`);

    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { url: youtubeUrl, autoplay: true },
    });
  });

  it("opens regular YouTube video links through the shell", async () => {
    const youtubeUrl = "https://www.youtube.com/watch?v=u8vJjTH9Igg";
    stubBlogFetch({
      posts: {
        "field-notes": `[Open video](${youtubeUrl})`,
      },
    });
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper);

    const link = wrapper.find<HTMLAnchorElement>(".blog__content a");
    expect(link.attributes("href")).toBe(youtubeUrl);

    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { url: youtubeUrl, autoplay: true },
    });
  });

  it("renders explicit preview directives through app preview providers", async () => {
    const youtubeUrl = "https://www.youtube.com/watch?v=M7lc1UVf-VE";
    stubBlogFetch({
      posts: {
        "field-notes": `Before\n\n::preview{url="${youtubeUrl}"}\n\nAfter`,
      },
    });
    const kernel = makeKernel();
    const PreviewProbe = defineVaporComponent(
      (props: {
        readonly args: { readonly url: string };
        readonly input: AppPreviewInput;
        readonly surface: string;
      }) => {
        const preview = document.createElement("div");
        preview.className = "preview-probe";
        renderEffect(() => {
          preview.textContent = `${props.surface}:${props.args.url}:${props.input.kind}`;
        });
        return preview;
      },
      { props: ["args", "input", "surface"] },
    );
    const provider: AppPreviewProvider = {
      id: "youtube-player:video-preview",
      manifestId: "youtube-player",
      surfaces: ["blog.embed"],
      component: () => Promise.resolve({ default: PreviewProbe }),
      match: () => ({ args: { url: youtubeUrl } }),
    };
    (kernel.previews.resolve as ReturnType<typeof vi.fn>).mockReturnValue({
      provider,
      args: { url: youtubeUrl },
    });
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper, 5000);
    await vi.waitFor(() => {
      if (!wrapper.find(".preview-probe").exists()) {
        throw new Error("preview not yet rendered");
      }
    });

    expect(wrapper.find(".blog__content").text()).toContain("Before");
    expect(wrapper.find(".blog__content").text()).toContain("After");
    expect(wrapper.find(".preview-probe").text()).toBe(`blog.embed:${youtubeUrl}:url`);
    expect(kernel.previews.resolve).toHaveBeenCalledWith(
      { kind: "url", url: youtubeUrl },
      { surface: "blog.embed" },
    );
  });

  it("does not hijack modified clicks on regular YouTube video links", async () => {
    const youtubeUrl = "https://www.youtube.com/watch?v=u8vJjTH9Igg";
    stubBlogFetch({
      posts: {
        "field-notes": `[Open video](${youtubeUrl})`,
      },
    });
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper);

    const link = wrapper.find<HTMLAnchorElement>(".blog__content a");
    const event = new MouseEvent("click", {
      bubbles: true,
      button: 0,
      cancelable: true,
      metaKey: true,
    });
    link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(kernel.events.emit).not.toHaveBeenCalledWith("app.launch.requested", expect.anything());
  });

  it("captures app protocol links before inner content can stop propagation", async () => {
    stubBlogFetch({
      posts: {
        "field-notes": "[Open video](youtube-player://video/M7lc1UVf-VE)",
      },
    });
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper);

    const link = wrapper.find<HTMLAnchorElement>(".blog__content a");
    link.element.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "M7lc1UVf-VE", autoplay: true },
    });
  });

  it("blocks invalid whitelisted app protocol links without launching an app", async () => {
    stubBlogFetch({
      posts: {
        "field-notes": "[Bad video](youtube-player://video/not-a-video-id)",
      },
    });
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper);

    const link = wrapper.find<HTMLAnchorElement>(".blog__content a");
    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(kernel.events.emit).not.toHaveBeenCalledWith("app.launch.requested", expect.anything());
  });

  it("does not hijack regular markdown links", async () => {
    stubBlogFetch({
      posts: {
        "field-notes": "[Regular link](https://example.com)",
      },
    });
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel));

    await waitForContent(wrapper);

    const link = wrapper.find<HTMLAnchorElement>(".blog__content a");
    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(kernel.events.emit).not.toHaveBeenCalledWith("app.launch.requested", expect.anything());
  });

  it("renders a detail thumbnail from index metadata when available", async () => {
    stubBlogFetch({
      index: [
        {
          slug: "field-notes",
          title: "Field Notes",
          date: "2026-05-30",
          thumbnail: {
            url: "/public/blog/thumbnails/field-notes/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.png",
            width: 1024,
            height: 576,
            alt: "Field Notes thumbnail",
          },
        },
      ],
      posts: { "field-notes": "# Field Notes\n\nNetwork body" },
    });
    const wrapper = mount(wrap(makeKernel()));

    await waitForContent(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find(".blog__post-cover").exists()).toBe(true);
    });

    const coverImage = wrapper.find(".blog__post-cover-image");
    expect(coverImage.attributes()).toMatchObject({
      alt: "Field Notes thumbnail",
      height: "576",
      src: "/public/blog/thumbnails/field-notes/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.png",
      width: "1024",
    });
    expect(wrapper.find(".blog__index-thumbnail").exists()).toBe(false);
  });

  it("emits null document path for the index and updates when opening a post", async () => {
    stubBlogFetch({
      index: [{ slug: "new-post", title: "New Post", date: "2026-05-30" }],
      posts: {
        "new-post": "# New Post\n\nNetwork body",
      },
    });
    const kernel = makeKernel();
    const wrapper = mount(wrap(kernel, blogIndexContext));

    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "blog",
      handleId: "h-blog-test",
      path: null,
    });
    expect(kernel.events.emit).toHaveBeenCalledWith("app.url.changed", {
      manifestId: "blog",
      handleId: "h-blog-test",
      path: "/blog",
    });

    await waitForIndexItems(wrapper);
    await wrapper.find(".blog__index-item").trigger("click");
    await waitForContent(wrapper, 5000);

    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "blog",
      handleId: "h-blog-test",
      path: "/home/posts/new-post.md",
    });
    expect(kernel.events.emit).toHaveBeenCalledWith("app.url.changed", {
      manifestId: "blog",
      handleId: "h-blog-test",
      path: "/blog/new-post",
    });

    await wrapper.find(".blog__back").trigger("click");
    await waitForIndex(wrapper);

    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "blog",
      handleId: "h-blog-test",
      path: null,
    });
    expect(kernel.events.emit).toHaveBeenLastCalledWith("app.url.changed", {
      manifestId: "blog",
      handleId: "h-blog-test",
      path: "/blog",
    });
  });

  it("copies the current URL from the desktop post toolbar share action", async () => {
    window.history.replaceState(null, "", "/blog/field-notes?via=toolbar#read");
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    stubBlogFetch({ posts: { "field-notes": "# Field Notes\n\nNetwork body" } });
    const wrapper = mount(wrap(makeKernel()));

    await waitForContent(wrapper);

    expect(wrapper.find(".blog__post-toolbar").exists()).toBe(true);
    expect(wrapper.find(".blog__back svg").exists()).toBe(true);

    await wrapper.find(".blog__share").trigger("click");

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(window.location.href);
      expect(wrapper.find(".blog__share").attributes("aria-label")).toBe("Copied URL");
      expect(wrapper.find(".blog__share-status").text()).toBe("Copied");
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

  it("keeps the post toolbar when desktop app chrome only updates the window", async () => {
    const appChrome: AppChromeController = {
      rendersAppChrome: false,
      setTitle: vi.fn(),
      setBackAction: vi.fn(),
    };
    stubBlogFetch({
      posts: {
        "field-notes": `---
title: "Field Notes"
---
Network body`,
      },
    });
    const wrapper = mount(wrap(makeKernel(), blogContext, { appChrome }));

    await waitForContent(wrapper);

    expect(wrapper.find(".blog__post-toolbar").exists()).toBe(true);
    expect(wrapper.find(".blog__back").exists()).toBe(true);
    expect(wrapper.find(".blog__share").exists()).toBe(true);
    expect(appChrome.setTitle).toHaveBeenLastCalledWith("Field Notes");
  });

  it("renders an in-app 404 for a missing post", async () => {
    stubBlogFetch();
    const wrapper = mount(wrap(makeKernel()));

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Post not found");
      expect(wrapper.text()).toContain("field-notes");
    });
    expect(wrapper.find(".comments").exists()).toBe(false);
  });

  it("propagates injected handleId onto the article in dev", async () => {
    stubBlogFetch({ posts: { "field-notes": "# Field Notes\n\nNetwork body" } });
    const wrapper = mount(wrap());

    await waitForContent(wrapper);

    expect(wrapper.find("article.blog").attributes("data-handle-id")).toBe("h-blog-test");
  });
});
