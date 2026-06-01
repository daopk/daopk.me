import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import { debugWarn } from "@daopk/sdk";
import { renderMarkdownToHtml, type MarkdownRenderer } from "@daopk/markdown";
import { BlogNetworkError, type BlogContentSource } from "@daopk/content";

import { parseBlogPostSource, useBlogPost, type BlogPostOptions } from "./useBlogPost";

vi.mock("@daopk/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@daopk/sdk")>()),
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

interface Deferred<T> {
  promise: Promise<T>;
  reject(reason?: unknown): void;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}

function renderer(overrides: Partial<MarkdownRenderer> = {}): MarkdownRenderer {
  return {
    ready: Promise.resolve(),
    render: vi.fn(async (source: string) => renderMarkdownToHtml(source)),
    dispose: vi.fn(),
    ...overrides,
  };
}

type PostSource = Pick<BlogContentSource, "readPostCache" | "fetchPost">;

function mountHarness(
  options: Partial<BlogPostOptions> & { source?: Partial<PostSource> } = {},
) {
  let state: ReturnType<typeof useBlogPost> | undefined;
  const source: PostSource = {
    readPostCache: options.source?.readPostCache ?? vi.fn(async () => null),
    fetchPost: options.source?.fetchPost ?? vi.fn(async () => "# Field Notes\n\nNetwork body"),
  };

  const Harness = defineComponent({
    setup() {
      state = useBlogPost({
        args: { slug: "field-notes" },
        createRenderer: async () => renderer(),
        ...options,
        source,
      });

      return () =>
        h("div", {
          "data-status": state?.status.value,
          innerHTML: state?.html.value ?? "",
        });
    },
  });

  const wrapper = mount(Harness);

  return {
    source,
    get state() {
      if (!state) {
        throw new Error("Harness state was not initialized.");
      }
      return state;
    },
    wrapper,
  };
}

describe("useBlogPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders markdown for a valid slug", async () => {
    const { state, source } = mountHarness();

    await vi.waitFor(() => {
      expect(state.status.value).toBe("ready");
    });

    expect(source.fetchPost).toHaveBeenCalledWith("field-notes");
    expect(state.html.value).toContain("<h1");
    expect(state.html.value).toContain("Field Notes");
  });

  it("renders frontmatter title and date without exposing frontmatter", async () => {
    const { state } = mountHarness({
      source: {
        fetchPost: vi.fn(
          async () =>
            `---
title: "Meta Title"
date: "2026-05-30"
---

This is the body.`,
        ),
      },
    });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("ready");
    });

    expect(state.metadata.value).toEqual({
      date: "2026-05-30",
      description: null,
      formattedDate: "May 30, 2026",
      title: "Meta Title",
    });
    expect(state.html.value).toContain("<h1>Meta Title</h1>");
    expect(state.html.value).toContain('<time datetime="2026-05-30">May 30, 2026</time>');
    expect(state.html.value).toContain("This is the body.");
    expect(state.html.value).not.toContain("title:");
    expect(state.html.value).not.toContain("---");
  });

  it("strips a duplicate leading H1 when a frontmatter title is present", async () => {
    const { state } = mountHarness({
      source: {
        fetchPost: vi.fn(
          async () =>
            `---
title: "Meta Title"
date: "2026-05-30"
---
# Duplicate Heading

Body`,
        ),
      },
    });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("ready");
    });

    expect(state.html.value.match(/<h1/g)).toHaveLength(1);
    expect(state.html.value).toContain("<h1>Meta Title</h1>");
    expect(state.html.value).not.toContain("Duplicate Heading");
  });

  it("ignores invalid frontmatter dates", () => {
    expect(
      parseBlogPostSource(`---
title: "Meta Title"
date: "2026-99-99"
---
Body`),
    ).toEqual({
      body: "Body",
      metadata: {
        date: null,
        description: null,
        formattedDate: null,
        title: "Meta Title",
      },
    });
  });

  it("shows not-found for an invalid slug without touching the network", async () => {
    const readPostCache = vi.fn(async () => null);
    const fetchPost = vi.fn(async () => "# No");
    const createRenderer = vi.fn(async () => renderer());
    const { state } = mountHarness({
      args: { slug: "FIELD-NOTES" },
      createRenderer,
      source: { readPostCache, fetchPost },
    });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("not-found");
    });

    expect(readPostCache).not.toHaveBeenCalled();
    expect(fetchPost).not.toHaveBeenCalled();
    expect(createRenderer).not.toHaveBeenCalled();
  });

  it("shows not-found when the remote returns a 404 and nothing is cached", async () => {
    const createRenderer = vi.fn(async () => renderer());
    const { state } = mountHarness({
      createRenderer,
      source: {
        readPostCache: vi.fn(async () => null),
        fetchPost: vi.fn(async () => null),
      },
    });

    await vi.waitFor(() => {
      expect(state.notFound.value).toBe(true);
    });

    expect(createRenderer).not.toHaveBeenCalled();
    expect(state.html.value).toBe("");
  });

  it("renders the cached post and keeps it when the network refresh fails", async () => {
    const { state } = mountHarness({
      source: {
        readPostCache: vi.fn(async () => "# Cached Notes\n\nCached body"),
        fetchPost: vi.fn(async () => {
          throw new BlogNetworkError("offline");
        }),
      },
    });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("ready");
    });

    expect(state.html.value).toContain("Cached Notes");
    expect(debugWarn).toHaveBeenCalledWith(
      "[blog] serving cached blog post; refresh failed",
      expect.anything(),
    );
  });

  it("sets an error when there is no cache and the network fails", async () => {
    const { state } = mountHarness({
      source: {
        readPostCache: vi.fn(async () => null),
        fetchPost: vi.fn(async () => {
          throw new BlogNetworkError("offline");
        }),
      },
    });

    await vi.waitFor(() => {
      expect(state.loadFailed.value).toBe(true);
    });

    expect(debugWarn).toHaveBeenCalledWith(
      "[blog] failed to load or render blog post",
      expect.anything(),
    );
  });

  it("disposes a renderer that resolves after unmount and does not update HTML", async () => {
    const pendingRenderer = deferred<MarkdownRenderer>();
    const lateRenderer = renderer();
    const createRenderer = vi.fn(() => pendingRenderer.promise);
    const { state, wrapper } = mountHarness({
      createRenderer,
      source: {
        readPostCache: vi.fn(async () => null),
        fetchPost: vi.fn(async () => "# Late"),
      },
    });

    await vi.waitFor(() => {
      expect(createRenderer).toHaveBeenCalledTimes(1);
    });

    wrapper.unmount();
    pendingRenderer.resolve(lateRenderer);

    await vi.waitFor(() => {
      expect(lateRenderer.dispose).toHaveBeenCalledTimes(1);
    });

    expect(state.html.value).toBe("");
    expect(debugWarn).not.toHaveBeenCalled();
  });
});
