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

const blogContext: AppContext = Object.freeze({
  manifestId: "blog",
  handleId: "h-blog-test",
  args: Object.freeze({
    slug: "field-notes",
    path: "/home/posts/field-notes.md",
  }),
});

function makeKernel(source: string | null = "# Field Notes\n\nBlog body") {
  return {
    vfs: {
      stat: vi.fn(async () => null),
      list: vi.fn(async () => []),
      read: vi.fn(async () => null),
      readText: vi.fn(async (path: string) => {
        if (source === null) {
          throw new VfsError("NOT_FOUND", `Path not found: ${path}`, { path });
        }
        return source;
      }),
      write: vi.fn(async () => null),
      writeText: vi.fn(async () => null),
      mkdir: vi.fn(async () => null),
      remove: vi.fn(async () => false),
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
