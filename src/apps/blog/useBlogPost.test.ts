import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import { debugWarn } from "~/core/debug";
import { renderMarkdownToHtml } from "~/core/markdown/MarkdownPipeline";
import type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";
import { VfsError } from "~/core/vfs/errors";

import { parseBlogPostSource, useBlogPost, type BlogPostOptions } from "./useBlogPost";

vi.mock("~/core/debug", () => ({
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

function mountHarness(options: Partial<BlogPostOptions> = {}) {
  let state: ReturnType<typeof useBlogPost> | undefined;
  const readText = options.readText ?? vi.fn(async () => "# Field Notes\n\nSeeded body");
  const Harness = defineComponent({
    setup() {
      state = useBlogPost({
        args: { slug: "field-notes", path: "/home/posts/field-notes.md" },
        createRenderer: async () => renderer(),
        ...options,
        readText,
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

describe("useBlogPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders markdown for a valid blog launch slug", async () => {
    const readText = vi.fn(async () => "# Field Notes\n\nSeeded body");
    const { state } = mountHarness({ readText });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("ready");
    });

    expect(readText).toHaveBeenCalledWith("/home/posts/field-notes.md");
    expect(state.html.value).toContain("<h1");
    expect(state.html.value).toContain("Field Notes");
  });

  it("renders frontmatter title and date without exposing frontmatter", async () => {
    const readText = vi.fn(
      async () =>
        `---
title: "Meta Title"
date: "2026-05-30"
---

This is the body.`,
    );
    const { state } = mountHarness({ readText });

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

  it("parses quoted title/date frontmatter and strips duplicate leading H1", async () => {
    const readText = vi.fn(
      async () =>
        `---
title: "Meta Title"
date: "2026-05-30"
---
# Duplicate Heading

Body`,
    );
    const { state } = mountHarness({ readText });

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

  it("shows not-found for an invalid slug without reading VFS", async () => {
    const readText = vi.fn(async () => "# No");
    const createRenderer = vi.fn(async () => renderer());
    const { state } = mountHarness({
      args: { slug: "FIELD-NOTES" },
      createRenderer,
      readText,
    });

    await vi.waitFor(() => {
      expect(state.status.value).toBe("not-found");
    });

    expect(readText).not.toHaveBeenCalled();
    expect(createRenderer).not.toHaveBeenCalled();
  });

  it("shows not-found for a missing VFS post", async () => {
    const createRenderer = vi.fn(async () => renderer());
    const { state } = mountHarness({
      createRenderer,
      readText: vi.fn(async () => {
        throw new VfsError("NOT_FOUND", "Path not found", {
          path: "/home/posts/nope.md",
        });
      }),
    });

    await vi.waitFor(() => {
      expect(state.notFound.value).toBe(true);
    });

    expect(createRenderer).not.toHaveBeenCalled();
    expect(state.html.value).toBe("");
  });

  it("sets a generic error for non-404 read failures", async () => {
    const { state } = mountHarness({
      readText: vi.fn(async () => {
        throw new VfsError("ADAPTER_UNAVAILABLE", "Adapter down");
      }),
    });

    await vi.waitFor(() => {
      expect(state.loadFailed.value).toBe(true);
    });

    expect(debugWarn).toHaveBeenCalledWith(
      "[blog] failed to load or render VFS markdown",
      expect.objectContaining({ code: "ADAPTER_UNAVAILABLE" }),
    );
  });

  it("disposes a renderer that resolves after unmount and does not update HTML", async () => {
    const pendingRenderer = deferred<MarkdownRenderer>();
    const lateRenderer = renderer();
    const createRenderer = vi.fn(() => pendingRenderer.promise);
    const { state, wrapper } = mountHarness({
      createRenderer,
      readText: vi.fn(async () => "# Late"),
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
    expect(state.status.value).toBe("loading");
    expect(debugWarn).not.toHaveBeenCalled();
  });
});
