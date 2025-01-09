import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import { MemoryAdapter, VFS } from "~/core/vfs";
import { AppContextInjectionKey, type AppContext } from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import App from "./App.vue";

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "slides",
    handleId: "slides-handle",
    args: Object.freeze(args),
  });
}

function makeKernel(): Kernel {
  const vfs = new VFS();
  vfs.mount(
    "/",
    new MemoryAdapter({
      id: "root",
      seed: {
        directories: ["/home", "/home/slides", "/home/slides/demo"],
        files: {
          "/home/slides/demo/slides.md": {
            text: `---
title: Demo Deck
---

# Demo Deck
`,
            mimeType: "text/markdown;charset=utf-8",
          },
        },
      },
    }),
    { id: "root" },
  );

  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const emit = vi.fn((channel: string, payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  });

  return {
    events: {
      emit,
      on: vi.fn((channel: string, listener: (payload: unknown) => void) => {
        const bucket = listeners.get(channel) ?? new Set();
        bucket.add(listener);
        listeners.set(channel, bucket);
        return () => {
          bucket.delete(listener);
        };
      }),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
    permissions: {
      request: vi.fn(async () => ({ granted: false, persisted: false })),
      respond: vi.fn(),
      revoke: vi.fn(),
      list: vi.fn(() => []),
    },
    vfs: {
      stat: vi.fn(async (path: string) => vfs.stat(path)),
      list: vi.fn(async (path: string) => vfs.list(path)),
      read: vi.fn(async (path: string) => (await vfs.read(path)).bytes),
      readText: vi.fn(async (path: string) => vfs.readText(path)),
      write: vi.fn(async (path: string, bytes: Uint8Array, options = {}) =>
        vfs.write(path, bytes, options),
      ),
      writeText: vi.fn(async (path: string, text: string, options = {}) =>
        vfs.writeText(path, text, options),
      ),
      mkdir: vi.fn(async (path: string, options = {}) => vfs.mkdir(path, options)),
      remove: vi.fn(async (path: string, options = {}) => {
        await vfs.remove(path, options);
        return true;
      }),
    },
  } as unknown as Kernel;
}

function mountSlides(kernel: Kernel, context: AppContext = makeContext()) {
  return mount(App, {
    attachTo: document.body,
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
        [AppContextInjectionKey as symbol]: context,
      },
    },
  });
}

describe("Slides App.vue", () => {
  it("lists and opens VFS decks", async () => {
    const wrapper = mountSlides(makeKernel(), makeContext({ path: "/home/slides/demo/slides.md" }));

    await flushPromises();

    expect(wrapper.find("h1").text()).toBe("Slides");
    expect(wrapper.text()).toContain("Demo Deck");
    expect(wrapper.find('[aria-label="WebContainer log"]').text()).toContain("WebContainer");
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toContain(
      "# Demo Deck",
    );

    wrapper.unmount();
  });

  it("creates and saves decks through VFS", async () => {
    const kernel = makeKernel();
    const wrapper = mountSlides(kernel);

    await flushPromises();
    await wrapper.find("#slides-new-title").setValue("Launch Review");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Launch Review");
    await wrapper.find("textarea").setValue("# Updated Launch Review");
    await wrapper.find('button[aria-label="Save deck"]').trigger("click");
    await flushPromises();

    expect(kernel.vfs.writeText).toHaveBeenCalledWith(
      "/home/slides/launch-review/slides.md",
      "# Updated Launch Review",
      expect.objectContaining({
        handleId: "slides-handle",
        overwrite: true,
      }),
    );

    wrapper.unmount();
  });

  it("responds to singleton deck-open requests", async () => {
    const kernel = makeKernel();
    const wrapper = mountSlides(kernel);

    await flushPromises();
    kernel.events.emit("slides.open.requested", {
      source: "api",
      path: "/home/slides/demo/slides.md",
    });
    await flushPromises();

    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toContain(
      "# Demo Deck",
    );

    wrapper.unmount();
  });
});
