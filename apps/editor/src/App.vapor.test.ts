import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AppContextInjectionKey,
  basename,
  dirname,
  KernelInjectionKey,
  normalizeVfsPath,
  VfsError,
  type AppContext,
  type Kernel,
  type VfsDirEntry,
  type VfsStat,
} from "@daopk/sdk";

import App from "./App.vue";

type MountedEditor = ReturnType<typeof mount>;
type ButtonWrapper = ReturnType<MountedEditor["find"]>;

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

interface FakeKernelOptions {
  readPermissionGranted?: boolean;
  readPermissionPersisted?: boolean;
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

function entry(path: string, node: FakeNode): VfsDirEntry {
  const normalized = normalizeVfsPath(path);
  return {
    name: basename(normalized),
    path: normalized,
    kind: node.kind,
    size: node.text?.length ?? 0,
    updatedAt: 0,
    readonly: node.readonly === true,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function isDirectChildPath(parent: string, candidate: string): boolean {
  if (parent === candidate) {
    return false;
  }

  const prefix = parent === "/" ? "/" : `${parent}/`;
  if (!candidate.startsWith(prefix)) {
    return false;
  }

  const rest = candidate.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}

function makeKernel(seed: Record<string, FakeNode>, options: FakeKernelOptions = {}): Kernel {
  const nodes = Object.fromEntries(
    Object.entries(seed).map(([path, node]) => [normalizeVfsPath(path), node] as const),
  );
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
    permissions: {
      request: vi.fn(async () => {
        const persisted = options.readPermissionPersisted ?? true;
        return {
          granted: options.readPermissionGranted ?? true,
          persisted,
          reason: persisted ? "cached" : "user",
        };
      }),
      respond: vi.fn(() => true),
      revoke: vi.fn(() => false),
      list: vi.fn(() => []),
    },
    vfs: {
      stat: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        const node = nodes[normalized];
        if (node === undefined) {
          throw new VfsError("NOT_FOUND", `Path not found: ${normalized}`, { path: normalized });
        }
        return stat(normalized, node);
      }),
      list: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        const node = nodes[normalized];
        if (node === undefined) {
          throw new VfsError("NOT_FOUND", `Path not found: ${normalized}`, { path: normalized });
        }
        if (node.kind !== "directory") {
          throw new VfsError("NOT_DIRECTORY", `Path is not a directory: ${normalized}`, {
            path: normalized,
          });
        }

        return Object.entries(nodes)
          .filter(([candidate]) => isDirectChildPath(normalized, candidate))
          .map(([candidate, child]) => entry(candidate, child));
      }),
      read: vi.fn(async () => null),
      readText: vi.fn(async (path: string) => nodes[normalizeVfsPath(path)]?.text ?? ""),
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

function mountEditor(kernel: Kernel, context: AppContext = makeContext()): MountedEditor {
  return mount(App, {
    attachTo: document.body,
    toastProvider: true,
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
        [AppContextInjectionKey as symbol]: context,
      },
    },
  });
}

function buttonByText(wrapper: MountedEditor, text: string): ButtonWrapper;
function buttonByText(
  wrapper: MountedEditor,
  text: string,
  options: { required: false },
): ButtonWrapper | undefined;
function buttonByText(wrapper: MountedEditor, text: string, options: { required?: boolean } = {}) {
  const button = wrapper.findAll("button").find((node) => node.text().includes(text));
  if (button === undefined) {
    if (options.required === false) {
      return undefined;
    }
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

function dialogButtonByText(text: string): HTMLButtonElement {
  const dialog = document.body.querySelector('[role="dialog"]');
  if (dialog === null) {
    throw new Error("Dialog not found");
  }

  const button = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((node) =>
    node.textContent?.includes(text),
  );
  if (button === undefined) {
    throw new Error(`Dialog button not found: ${text}`);
  }
  return button;
}

function optionByText(text: string): HTMLElement {
  const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (node) => node.textContent?.includes(text),
  );
  if (option === undefined) {
    throw new Error(`Option not found: ${text}`);
  }
  return option;
}

async function flushUi(): Promise<void> {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Editor App.vue", () => {
  it("opens with no file selected", () => {
    const kernel = makeKernel({ "/home": { kind: "directory" } });
    const wrapper = mountEditor(kernel);

    expect(wrapper.text()).toContain("No file open.");
    expect(wrapper.find(".editor__toolbar").exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Browse files"]').exists()).toBe(false);
    expect(wrapper.find(".editor__status").exists()).toBe(false);
    expect(wrapper.find(".editor__sr-status").attributes("aria-live")).toBe("polite");
    expect(wrapper.find("#editor-path").exists()).toBe(false);
    expect(buttonByText(wrapper, "Open").exists()).toBe(true);
    expect(buttonByText(wrapper, "Save", { required: false })).toBeUndefined();
    expect(buttonByText(wrapper, "Revert", { required: false })).toBeUndefined();
    expect(wrapper.find('button[aria-label="Toggle Markdown preview"]').exists()).toBe(false);
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

    expect(wrapper.find(".editor__toolbar").exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Browse files"]').exists()).toBe(true);
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

  it("opens a file selected from the Browse picker", async () => {
    const kernel = makeKernel({
      "/home": { kind: "directory" },
      "/home/current.md": { kind: "file", text: "# Current", mimeType: "text/markdown" },
      "/home/next.txt": { kind: "file", text: "next", mimeType: "text/plain" },
      "/home/photo.png": { kind: "file", text: "png", mimeType: "image/png" },
    });
    const wrapper = mountEditor(kernel, makeContext({ path: "/home/current.md" }));

    await flushUi();
    await wrapper.find('button[aria-label="Browse files"]').trigger("click");
    await flushUi();

    expect(kernel.permissions.request).toHaveBeenCalledWith("editor", "vfs.read", {
      source: "app",
    });
    expect(optionByText("photo.png").getAttribute("aria-disabled")).toBe("true");
    optionByText("next.txt").click();
    await flushUi();
    dialogButtonByText("Open").click();
    await flushUi();

    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("next");
    expect(kernel.vfs.readText).toHaveBeenCalledWith("/home/next.txt", {
      handleId: "editor-handle",
    });

    wrapper.unmount();
  });

  it("keeps the Browse picker closed when read permission is denied", async () => {
    const kernel = makeKernel(
      {
        "/home": { kind: "directory" },
        "/home/note.txt": { kind: "file", text: "note", mimeType: "text/plain" },
      },
      { readPermissionGranted: false },
    );
    const wrapper = mountEditor(kernel);

    await buttonByText(wrapper, "Open").trigger("click");
    await flushUi();

    expect(kernel.permissions.request).toHaveBeenCalledWith("editor", "vfs.read", {
      source: "app",
    });
    expect(document.body.textContent).not.toContain("Open File");
    expect(wrapper.text()).toContain("Editor needs file access before browsing.");
    expect(kernel.vfs.list).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("keeps the Browse picker closed after one-time read permission", async () => {
    const kernel = makeKernel(
      {
        "/home": { kind: "directory" },
        "/home/note.txt": { kind: "file", text: "note", mimeType: "text/plain" },
      },
      { readPermissionPersisted: false },
    );
    const wrapper = mountEditor(kernel);

    await buttonByText(wrapper, "Open").trigger("click");
    await flushUi();

    expect(kernel.permissions.request).toHaveBeenCalledWith("editor", "vfs.read", {
      source: "app",
    });
    expect(document.body.textContent).not.toContain("Open File");
    expect(wrapper.text()).toContain("Choose Allow and remember to browse files.");
    expect(kernel.vfs.list).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("keeps the discard flow when Browse selects another file with dirty changes", async () => {
    const wrapper = mountEditor(
      makeKernel({
        "/home": { kind: "directory" },
        "/home/a.txt": { kind: "file", text: "A", mimeType: "text/plain" },
        "/home/b.txt": { kind: "file", text: "B", mimeType: "text/plain" },
      }),
      makeContext({ path: "/home/a.txt" }),
    );

    await flushUi();
    await wrapper.find("textarea").setValue("dirty");
    await wrapper.find('button[aria-label="Browse files"]').trigger("click");
    await flushUi();

    optionByText("b.txt").click();
    await flushUi();
    dialogButtonByText("Open").click();
    await flushUi();

    expect(document.body.textContent).toContain("Discard changes?");
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("dirty");

    dialogButtonByText("Discard").click();
    await flushUi();

    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("B");

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
