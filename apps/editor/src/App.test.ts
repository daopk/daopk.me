import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import {
  AppContextInjectionKey,
  dirname,
  KernelInjectionKey,
  normalizeVfsPath,
  VfsError,
  type AppContext,
  type Kernel,
  type VfsStat,
} from "@daopk/sdk";

import App from "./App.vue";

vi.mock("@daopk/markdown", () => ({
  createMarkdownRenderer: vi.fn(async () => ({
    ready: Promise.resolve(),
    render: vi.fn(async (source: string) => ({ html: `<p>${source}</p>` })),
    dispose: vi.fn(),
  })),
}));

interface FakeNode {
  kind: VfsStat["kind"];
  text?: string;
  readonly?: boolean;
  mimeType?: string;
}

function stat(path: string, node: FakeNode): VfsStat {
  return {
    path: normalizeVfsPath(path),
    kind: node.kind,
    size: node.text?.length ?? 0,
    createdAt: 0,
    updatedAt: 0,
    readonly: node.readonly === true,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function makeKernel(seed: Record<string, FakeNode>): Kernel {
  const nodes = { ...seed };
  const listeners = new Map<string, Set<(payload: Record<string, unknown>) => void>>();

  function emit(channel: string, payload: Record<string, unknown>): void {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  }

  return {
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
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
    vfs: {
      stat: vi.fn(async (path: string) => {
        const node = nodes[path];
        if (node === undefined) {
          throw new VfsError("NOT_FOUND", `Path not found: ${path}`, { path });
        }
        return stat(path, node);
      }),
      list: vi.fn(async () => []),
      read: vi.fn(async () => null),
      readText: vi.fn(async (path: string) => nodes[path]?.text ?? ""),
      write: vi.fn(async () => null),
      writeText: vi.fn(async (path: string, text: string, options = {}) => {
        const normalized = normalizeVfsPath(path);
        const parent = dirname(normalized);
        if (nodes[parent]?.kind !== "directory") {
          throw new VfsError("NOT_FOUND", `Parent missing: ${parent}`, { path });
        }
        nodes[normalized] = { kind: "file", text, mimeType: options.mimeType };
        return stat(normalized, nodes[normalized]);
      }),
      mkdir: vi.fn(async () => null),
      remove: vi.fn(async () => false),
    },
  } as unknown as Kernel;
}

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "editor",
    handleId: "editor-handle",
    args: Object.freeze(args),
  });
}

function mountEditor(kernel: Kernel, context: AppContext = makeContext()) {
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

function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll("button").find((node) => node.text().includes(text));
  if (button === undefined) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

describe("Editor App.vue", () => {
  it("opens with no file selected", () => {
    const kernel = makeKernel({ "/home": { kind: "directory" } });
    const wrapper = mountEditor(kernel);

    expect(wrapper.text()).toContain("No file open.");
    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "editor",
      handleId: "editor-handle",
      path: null,
    });

    wrapper.unmount();
  });

  it("loads launch args.path", async () => {
    const kernel = makeKernel({
      "/home": { kind: "directory" },
      "/home/note.md": { kind: "file", text: "# Hello", mimeType: "text/markdown" },
    });
    const wrapper = mountEditor(kernel, makeContext({ path: "/home/note.md" }));

    await flushPromises();

    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("# Hello");
    expect(kernel.vfs.readText).toHaveBeenCalledWith("/home/note.md", {
      handleId: "editor-handle",
    });
    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "editor",
      handleId: "editor-handle",
      path: "/home/note.md",
    });
    expect(kernel.events.emit).not.toHaveBeenCalledWith("app.document.changed", {
      manifestId: "editor",
      handleId: "editor-handle",
      path: null,
    });

    wrapper.unmount();
  });

  it("opens a path from the toolbar", async () => {
    const kernel = makeKernel({
      "/home": { kind: "directory" },
      "/home/log.txt": { kind: "file", text: "hello", mimeType: "text/plain" },
    });
    const wrapper = mountEditor(kernel);

    await wrapper.find("#editor-path").setValue("/home/log.txt");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("hello");
    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "editor",
      handleId: "editor-handle",
      path: "/home/log.txt",
    });

    wrapper.unmount();
  });

  it("opens targeted editor.window.open.requested events for its handle only", async () => {
    const kernel = makeKernel({
      "/home": { kind: "directory" },
      "/home/a.txt": { kind: "file", text: "A", mimeType: "text/plain" },
      "/home/b.txt": { kind: "file", text: "B", mimeType: "text/plain" },
    });
    const wrapper = mountEditor(kernel);

    kernel.events.emit("editor.window.open.requested", {
      handleId: "other-handle",
      path: "/home/a.txt",
    });
    await flushPromises();

    expect(wrapper.find("textarea").exists()).toBe(false);
    expect(kernel.vfs.readText).not.toHaveBeenCalledWith("/home/a.txt", {
      handleId: "editor-handle",
    });

    kernel.events.emit("editor.window.open.requested", {
      handleId: "editor-handle",
      path: "/home/b.txt",
    });
    await flushPromises();

    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("B");
    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "editor",
      handleId: "editor-handle",
      path: "/home/b.txt",
    });

    wrapper.unmount();
  });

  it("saves via the Save button and Cmd+S", async () => {
    const kernel = makeKernel({
      "/home": { kind: "directory" },
      "/home/log.txt": { kind: "file", text: "old", mimeType: "text/plain" },
    });
    const wrapper = mountEditor(kernel, makeContext({ path: "/home/log.txt" }));

    await flushPromises();
    await wrapper.find("textarea").setValue("button save");
    await buttonByText(wrapper, "Save").trigger("click");
    await flushPromises();

    expect(kernel.vfs.writeText).toHaveBeenLastCalledWith("/home/log.txt", "button save", {
      handleId: "editor-handle",
      overwrite: true,
      mimeType: "text/plain",
    });

    await wrapper.find("textarea").setValue("shortcut save");
    await wrapper.find(".editor").trigger("keydown", {
      key: "s",
      metaKey: true,
    });
    await flushPromises();

    expect(kernel.vfs.writeText).toHaveBeenLastCalledWith("/home/log.txt", "shortcut save", {
      handleId: "editor-handle",
      overwrite: true,
      mimeType: "text/plain",
    });

    wrapper.unmount();
  });

  it("disables save for read-only files", async () => {
    const wrapper = mountEditor(
      makeKernel({
        "/portfolio": { kind: "directory" },
        "/portfolio/about.md": {
          kind: "file",
          text: "# About",
          readonly: true,
          mimeType: "text/markdown",
        },
      }),
      makeContext({ path: "/portfolio/about.md" }),
    );

    await flushPromises();
    await wrapper.find("textarea").setValue("# Changed");

    expect(buttonByText(wrapper, "Save").attributes("disabled")).toBeDefined();

    wrapper.unmount();
  });

  it("rejects unsupported files", async () => {
    const wrapper = mountEditor(
      makeKernel({
        "/home": { kind: "directory" },
        "/home/photo.png": { kind: "file", text: "png", mimeType: "image/png" },
      }),
      makeContext({ path: "/home/photo.png" }),
    );

    await flushPromises();

    expect(wrapper.text()).toContain("cannot edit");
    expect(wrapper.find("textarea").exists()).toBe(false);

    wrapper.unmount();
  });

  it("renders Markdown preview when toggled", async () => {
    const wrapper = mountEditor(
      makeKernel({
        "/home": { kind: "directory" },
        "/home/note.md": { kind: "file", text: "# Preview", mimeType: "text/markdown" },
      }),
      makeContext({ path: "/home/note.md" }),
    );

    await flushPromises();
    await wrapper.find('button[aria-label="Toggle Markdown preview"]').trigger("click");
    await flushPromises();

    expect(wrapper.find(".editor__preview-content").html()).toContain("# Preview");

    wrapper.unmount();
  });
});
