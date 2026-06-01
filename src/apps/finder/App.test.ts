import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { basename, dirname, normalizeVfsPath } from "~/core/vfs/path";
import type { VfsDirEntry, VfsStat } from "~/core/vfs/nodes";
import { AppContextInjectionKey, type AppContext } from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import App from "./App.vue";

function entry(
  path: string,
  kind: VfsDirEntry["kind"] = "file",
  options: Partial<VfsDirEntry> = {},
): VfsDirEntry {
  const normalized = normalizeVfsPath(path);
  return {
    name: basename(normalized),
    path: normalized,
    kind,
    size: kind === "file" ? 24 : 0,
    updatedAt: 0,
    readonly: false,
    mimeType: kind === "file" ? "text/plain" : undefined,
    ...options,
  };
}

function statFromEntry(item: VfsDirEntry): VfsStat {
  return {
    path: item.path,
    kind: item.kind,
    size: item.size,
    createdAt: 0,
    updatedAt: item.updatedAt,
    readonly: item.readonly,
    ...(item.mimeType === undefined ? {} : { mimeType: item.mimeType }),
  };
}

function makeKernel(
  listings: Record<string, readonly VfsDirEntry[]>,
  options: { readonlyDirectories?: readonly string[] } = {},
): Kernel {
  const mutableListings = new Map<string, VfsDirEntry[]>();
  const nodes = new Map<string, VfsDirEntry>();
  const bytes = new Map<string, Uint8Array>();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  let timestamp = 1;

  for (const [path, items] of Object.entries(listings)) {
    const normalized = normalizeVfsPath(path);
    mutableListings.set(normalized, [...items]);
    nodes.set(
      normalized,
      entry(normalized, "directory", {
        readonly: options.readonlyDirectories?.includes(normalized) === true,
      }),
    );
    for (const item of items) {
      nodes.set(item.path, item);
      if (item.kind === "file") {
        bytes.set(item.path, new Uint8Array([1, 2, 3]));
      }
    }
  }

  function emit(channel: string, payload: unknown): void {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  }

  function upsertListingItem(parent: string, item: VfsDirEntry): void {
    const listing = mutableListings.get(parent) ?? [];
    const existingIndex = listing.findIndex((candidate) => candidate.path === item.path);
    if (existingIndex < 0) {
      mutableListings.set(parent, [...listing, item]);
      return;
    }

    mutableListings.set(
      parent,
      listing.map((candidate) => (candidate.path === item.path ? item : candidate)),
    );
  }

  return {
    events: {
      emit: vi.fn(emit),
      on: vi.fn((channel: string, listener: (payload: unknown) => void) => {
        let bucket = listeners.get(channel);
        if (bucket === undefined) {
          bucket = new Set();
          listeners.set(channel, bucket);
        }
        bucket.add(listener);
        return () => {
          bucket?.delete(listener);
        };
      }),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
    vfs: {
      stat: vi.fn(async (path: string) => {
        const item = nodes.get(normalizeVfsPath(path));
        return item === undefined ? null : statFromEntry(item);
      }),
      list: vi.fn(async (path: string) => mutableListings.get(normalizeVfsPath(path)) ?? []),
      read: vi.fn(async (path: string) => bytes.get(normalizeVfsPath(path)) ?? null),
      readText: vi.fn(async () => "plain text"),
      write: vi.fn(
        async (
          path: string,
          data: Uint8Array,
          options: { handleId?: string; overwrite?: boolean; mimeType?: string } = {},
        ) => {
          const normalized = normalizeVfsPath(path);
          const item = entry(normalized, "file", {
            size: data.byteLength,
            updatedAt: ++timestamp,
            ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
          });
          nodes.set(normalized, item);
          bytes.set(normalized, data);
          upsertListingItem(dirname(normalized), item);
          return statFromEntry(item);
        },
      ),
      writeText: vi.fn(async () => null),
      mkdir: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        const item = entry(normalized, "directory", { updatedAt: ++timestamp });
        nodes.set(normalized, item);
        mutableListings.set(normalized, []);
        upsertListingItem(dirname(normalized), item);
        return statFromEntry(item);
      }),
      remove: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        if (!nodes.has(normalized)) {
          return false;
        }

        for (const candidate of Array.from(nodes.keys())) {
          if (candidate === normalized || candidate.startsWith(`${normalized}/`)) {
            nodes.delete(candidate);
            bytes.delete(candidate);
            mutableListings.delete(candidate);
          }
        }
        mutableListings.set(
          dirname(normalized),
          (mutableListings.get(dirname(normalized)) ?? []).filter(
            (candidate) => candidate.path !== normalized,
          ),
        );
        return true;
      }),
    },
    trash: {
      moveToTrash: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        const item = nodes.get(normalized);
        if (item === undefined) {
          return null;
        }

        for (const candidate of Array.from(nodes.keys())) {
          if (candidate === normalized || candidate.startsWith(`${normalized}/`)) {
            nodes.delete(candidate);
            bytes.delete(candidate);
            mutableListings.delete(candidate);
          }
        }
        mutableListings.set(
          dirname(normalized),
          (mutableListings.get(dirname(normalized)) ?? []).filter(
            (candidate) => candidate.path !== normalized,
          ),
        );
        emit("trash.changed", {
          operation: "move",
          id: `trash-${basename(normalized)}`,
          originalPath: normalized,
          path: normalized,
        });
        return {
          id: `trash-${basename(normalized)}`,
          name: basename(normalized),
          originalPath: normalized,
          deletedAt: ++timestamp,
          kind: item.kind === "directory" ? "directory" : "file",
          size: item.size,
          ...(item.mimeType === undefined ? {} : { mimeType: item.mimeType }),
        };
      }),
      list: vi.fn(async () => []),
      restore: vi.fn(async () => true),
      remove: vi.fn(async () => true),
      empty: vi.fn(async () => true),
    },
  } as unknown as Kernel;
}

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "finder",
    handleId: "finder-handle",
    args: Object.freeze(args),
  });
}

const context: AppContext = makeContext();

function mountFinder(kernel: Kernel, appContext: AppContext = context) {
  return mount(App, {
    attachTo: document.body,
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
        [AppContextInjectionKey as symbol]: appContext,
      },
    },
  });
}

function dispatchContextMenu(target: Element): void {
  const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: 12 },
    clientY: { value: 24 },
    button: { value: 2 },
  });
  target.dispatchEvent(ev);
}

interface PointerInit {
  pointerId?: number;
  pointerType?: "mouse" | "touch" | "pen";
  clientX?: number;
  clientY?: number;
  isPrimary?: boolean;
}

function makePointerEvent(type: string, init: PointerInit = {}): PointerEvent {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(ev, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? "touch" },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    isPrimary: { value: init.isPrimary ?? true },
  });
  return ev;
}

async function flushReka(): Promise<void> {
  await nextTick();
  await nextTick();
  await flushPromises();
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
}

function emitShellChanged(kernel: Kernel, shellId: "desktop" | "mobile"): void {
  kernel.events.emit("shell.changed", {
    shellId,
    profile: {
      formFactor: shellId === "mobile" ? "mobile" : "desktop",
    },
  });
}

describe("Finder App.vue", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders directory entries from VFS", async () => {
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/home", "directory"), entry("/readme.md")],
      }),
    );

    await flushPromises();

    expect(wrapper.findAll(".finder__entry")).toHaveLength(2);
    expect(wrapper.text()).toContain("home");
    expect(wrapper.text()).toContain("readme.md");

    wrapper.unmount();
  });

  it("shows an empty state for empty directories", async () => {
    const wrapper = mountFinder(makeKernel({ "/": [] }));

    await flushPromises();

    expect(wrapper.text()).toContain("This folder is empty.");

    wrapper.unmount();
  });

  it("does not auto-select entries or render the preview pane on mobile", async () => {
    const kernel = makeKernel({
      "/": [entry("/home", "directory"), entry("/readme.md")],
    });
    const wrapper = mountFinder(kernel);

    emitShellChanged(kernel, "mobile");
    await flushPromises();

    expect(wrapper.find(".finder__entry--selected").exists()).toBe(false);
    expect(wrapper.find(".finder__preview").exists()).toBe(false);

    wrapper.unmount();
  });

  it("opens the selected directory with Enter", async () => {
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/home", "directory")],
        "/home": [entry("/home/note.txt")],
      }),
    );

    await flushPromises();
    await wrapper.find(".finder__entries").trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(wrapper.text()).toContain("note.txt");
    expect(wrapper.findAll(".finder__entry-name").map((node) => node.text())).toEqual(["note.txt"]);

    wrapper.unmount();
  });

  it("opens selected directories from a touch tap without a dblclick event", async () => {
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/home", "directory")],
        "/home": [entry("/home/note.txt")],
      }),
    );

    await flushPromises();
    const selectedEntry = wrapper.get(".finder__entry").element;
    selectedEntry.dispatchEvent(
      makePointerEvent("pointerdown", { pointerId: 7, clientX: 12, clientY: 16 }),
    );
    selectedEntry.dispatchEvent(
      makePointerEvent("pointerup", { pointerId: 7, clientX: 12, clientY: 16 }),
    );
    await flushPromises();

    expect(wrapper.findAll(".finder__entry-name").map((node) => node.text())).toEqual(["note.txt"]);

    wrapper.unmount();
  });

  it("switches between list and grid modes", async () => {
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/home", "directory")],
      }),
    );

    await flushPromises();
    await wrapper.find('button[aria-label="Grid view"]').trigger("click");

    expect(wrapper.find(".finder__entries").classes()).toContain("finder__entries--grid");

    wrapper.unmount();
  });

  it("keeps Open in actions out of the toolbar", async () => {
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/note.md")],
      }),
    );

    await flushPromises();

    expect(wrapper.find(".finder__toolbar").text()).not.toContain("Open in");

    wrapper.unmount();
  });

  it("opens a text file in Editor from its context menu", async () => {
    const kernel = makeKernel({
      "/": [entry("/note.md")],
    });
    const wrapper = mountFinder(kernel);

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__entry").element);
    await flushReka();
    const openItem = menuItems().find((item) => item.textContent?.trim() === "Open in Editor");
    expect(openItem).toBeDefined();
    openItem!.click();
    await flushReka();

    expect(kernel.events.emit).toHaveBeenCalledWith("editor.open.requested", {
      source: "api",
      path: "/note.md",
    });

    wrapper.unmount();
  });

  it("suggests Blog for markdown files under /home/posts", async () => {
    const kernel = makeKernel({
      "/home/posts": [entry("/home/posts/field-notes.md")],
    });
    const wrapper = mountFinder(kernel, makeContext({ path: "/home/posts" }));

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__entry").element);
    await flushReka();

    expect(menuItems().map((node) => node.textContent?.trim())).toEqual([
      "Open in Blog",
      "Open in Editor",
      "Copy Path",
      "Duplicate",
      "Delete...",
    ]);
    expect(document.body.querySelectorAll(".finder__context-icon")).toHaveLength(5);

    menuItems()[0]!.click();
    await flushReka();

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "blog",
      source: "api",
      args: { path: "/home/posts/field-notes.md", slug: "field-notes" },
    });

    wrapper.unmount();
  });

  it("suggests Notes for markdown files under /home/notes", async () => {
    const kernel = makeKernel({
      "/home/notes": [entry("/home/notes/daily.md")],
    });
    const wrapper = mountFinder(kernel, makeContext({ path: "/home/notes" }));

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__entry").element);
    await flushReka();

    expect(menuItems().map((node) => node.textContent?.trim())).toEqual([
      "Open in Notes",
      "Open in Editor",
      "Copy Path",
      "Duplicate",
      "Delete...",
    ]);
    expect(document.body.querySelectorAll(".finder__context-icon")).toHaveLength(5);

    menuItems()[0]!.click();
    await flushReka();

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "notes",
      source: "api",
      args: { path: "/home/notes/daily.md" },
    });
    expect(kernel.events.emit).toHaveBeenCalledWith("notes.open.requested", {
      source: "api",
      path: "/home/notes/daily.md",
    });

    wrapper.unmount();
  });

  it("opens a Slidev deck in Slides from its context menu", async () => {
    const kernel = makeKernel({
      "/home/slides/demo": [
        entry("/home/slides/demo/slides.md", "file", { mimeType: "text/markdown" }),
      ],
    });
    const wrapper = mountFinder(kernel, makeContext({ path: "/home/slides/demo" }));

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__entry").element);
    await flushReka();
    const openItem = menuItems().find((item) => item.textContent?.trim() === "Open in Slides");
    expect(openItem).toBeDefined();
    openItem!.click();
    await flushReka();

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "slides",
      source: "api",
      args: { path: "/home/slides/demo/slides.md" },
    });
    expect(kernel.events.emit).toHaveBeenCalledWith("slides.open.requested", {
      source: "api",
      path: "/home/slides/demo/slides.md",
    });

    wrapper.unmount();
  });

  it("opens a PDF file in PDF Viewer from its context menu", async () => {
    const kernel = makeKernel({
      "/": [entry("/manual.pdf", "file", { mimeType: "application/pdf" })],
    });
    const wrapper = mountFinder(kernel);

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__entry").element);
    await flushReka();
    const openItem = menuItems().find((item) => item.textContent?.trim() === "Open in PDF Viewer");
    expect(openItem).toBeDefined();
    openItem!.click();
    await flushReka();

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "pdf-viewer",
      source: "api",
      args: { path: "/manual.pdf" },
    });
    expect(wrapper.text()).toContain("Open this document in PDF Viewer.");

    wrapper.unmount();
  });

  it("opens PDFs from keyboard and double-click gestures", async () => {
    const kernel = makeKernel({
      "/": [entry("/manual.pdf", "file", { mimeType: "application/pdf" })],
    });
    const wrapper = mountFinder(kernel);

    await flushPromises();
    await wrapper.find(".finder__entries").trigger("keydown", { key: "Enter" });
    await wrapper.find(".finder__entry").trigger("dblclick");

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "pdf-viewer",
      source: "api",
      args: { path: "/manual.pdf" },
    });
    expect(kernel.events.emit).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });

  it("opens Slidev decks from keyboard and double-click gestures", async () => {
    const kernel = makeKernel({
      "/home/slides/demo": [
        entry("/home/slides/demo/slides.md", "file", { mimeType: "text/markdown" }),
      ],
    });
    const wrapper = mountFinder(kernel, makeContext({ path: "/home/slides/demo" }));

    await flushPromises();
    await wrapper.find(".finder__entries").trigger("keydown", { key: "Enter" });
    await wrapper.find(".finder__entry").trigger("dblclick");

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "slides",
      source: "api",
      args: { path: "/home/slides/demo/slides.md" },
    });
    expect(kernel.events.emit).toHaveBeenCalledWith("slides.open.requested", {
      source: "api",
      path: "/home/slides/demo/slides.md",
    });

    wrapper.unmount();
  });

  it("selects an initial reveal child from launch args", async () => {
    const wrapper = mountFinder(
      makeKernel({
        "/portfolio/posts": [
          entry("/portfolio/posts/a.md"),
          entry("/portfolio/posts/field-notes.md"),
        ],
      }),
      makeContext({ path: "/portfolio/posts", reveal: "/portfolio/posts/field-notes.md" }),
    );

    await flushPromises();

    const selected = wrapper.find(".finder__entry--selected");
    expect(selected.text()).toContain("field-notes.md");

    wrapper.unmount();
  });

  it("responds to finder.reveal.requested while mounted", async () => {
    const kernel = makeKernel({
      "/": [entry("/portfolio", "directory")],
      "/portfolio/posts": [
        entry("/portfolio/posts/a.md"),
        entry("/portfolio/posts/field-notes.md"),
      ],
    });
    const wrapper = mountFinder(kernel);

    await flushPromises();
    kernel.events.emit("finder.reveal.requested", {
      path: "/portfolio/posts",
      reveal: "/portfolio/posts/field-notes.md",
      source: "spotlight",
    });
    await flushPromises();

    const selected = wrapper.find(".finder__entry--selected");
    expect(selected.text()).toContain("field-notes.md");

    wrapper.unmount();
  });

  it("right-clicking an entry opens entry actions and selects that entry", async () => {
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/a.txt"), entry("/b.txt")],
      }),
    );

    await flushPromises();
    dispatchContextMenu(wrapper.findAll(".finder__entry")[1]!.element);
    await flushReka();

    expect(menuItems().map((node) => node.textContent?.trim())).toEqual([
      "Open in Editor",
      "Copy Path",
      "Duplicate",
      "Delete...",
    ]);
    expect(document.body.querySelectorAll(".finder__context-icon")).toHaveLength(4);
    expect(wrapper.find(".finder__entry--selected").text()).toContain("b.txt");

    wrapper.unmount();
  });

  it("keeps touch long-press on an entry from opening the background context menu", async () => {
    vi.useFakeTimers();
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/a.txt")],
      }),
    );

    await flushPromises();
    wrapper
      .get(".finder__entry")
      .element.dispatchEvent(
        makePointerEvent("pointerdown", { pointerId: 9, clientX: 18, clientY: 32 }),
      );
    await flushReka();
    await vi.advanceTimersByTimeAsync(700);
    await flushReka();

    expect(menuItems().map((node) => node.textContent?.trim())).toEqual([
      "Open in Editor",
      "Copy Path",
      "Duplicate",
      "Delete...",
    ]);

    wrapper.unmount();
  });

  it("opens entries from their context menu", async () => {
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/home", "directory")],
        "/home": [entry("/home/note.txt")],
      }),
    );

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__entry").element);
    await flushReka();
    menuItems()[0]!.click();
    await flushReka();

    expect(wrapper.findAll(".finder__entry-name").map((node) => node.text())).toEqual(["note.txt"]);

    wrapper.unmount();
  });

  it("opens the background context menu without using entry actions", async () => {
    const kernel = makeKernel({
      "/": [entry("/a.txt")],
    });
    const wrapper = mountFinder(kernel);

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__browser").element);
    await flushReka();

    expect(menuItems().map((node) => node.textContent?.trim())).toEqual([
      "New Folder",
      "Refresh",
      "Copy Current Folder Path",
    ]);
    expect(document.body.querySelectorAll(".finder__context-icon")).toHaveLength(3);

    menuItems()[0]!.click();
    await flushReka();

    expect(kernel.vfs.mkdir).toHaveBeenCalledWith("/Untitled Folder", {
      handleId: "finder-handle",
      recursive: false,
    });
    expect(wrapper.text()).toContain("Untitled Folder");

    wrapper.unmount();
  });

  it("confirms before deleting an entry from its context menu", async () => {
    const kernel = makeKernel({
      "/": [entry("/a.txt"), entry("/b.txt")],
    });
    const wrapper = mountFinder(kernel);

    await flushPromises();
    dispatchContextMenu(wrapper.findAll(".finder__entry")[0]!.element);
    await flushReka();
    menuItems().at(-1)!.click();
    await flushReka();

    expect(kernel.trash.moveToTrash).not.toHaveBeenCalled();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const deleteButton = Array.from(dialog!.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Move to Trash",
    );
    expect(deleteButton).toBeDefined();

    deleteButton!.click();
    await flushReka();

    expect(kernel.trash.moveToTrash).toHaveBeenCalledWith("/a.txt", {
      handleId: "finder-handle",
    });
    expect(wrapper.findAll(".finder__entry-name").map((node) => node.text())).toEqual(["b.txt"]);

    wrapper.unmount();
  });

  it("disables mutation actions for readonly entries", async () => {
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/locked.txt", "file", { readonly: true })],
      }),
    );

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__entry").element);
    await flushReka();

    const items = menuItems();
    expect(
      items.find((item) => item.textContent?.trim() === "Duplicate")?.hasAttribute("data-disabled"),
    ).toBe(true);
    expect(
      items.find((item) => item.textContent?.trim() === "Delete...")?.hasAttribute("data-disabled"),
    ).toBe(true);

    wrapper.unmount();
  });

  it("disables background mutation actions in readonly folders", async () => {
    const wrapper = mountFinder(
      makeKernel(
        {
          "/": [entry("/a.txt")],
        },
        { readonlyDirectories: ["/"] },
      ),
    );

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__browser").element);
    await flushReka();

    expect(menuItems()[0]?.textContent?.trim()).toBe("New Folder");
    expect(menuItems()[0]?.hasAttribute("data-disabled")).toBe(true);

    wrapper.unmount();
  });

  it("copies paths and reports clipboard failures", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const wrapper = mountFinder(
      makeKernel({
        "/": [entry("/a.txt")],
      }),
    );

    await flushPromises();
    dispatchContextMenu(wrapper.get(".finder__entry").element);
    await flushReka();
    menuItems()[1]!.click();
    await flushReka();

    expect(writeText).toHaveBeenCalledWith("/a.txt");

    wrapper.unmount();

    writeText.mockRejectedValueOnce(new Error("denied"));
    const failingWrapper = mountFinder(
      makeKernel({
        "/": [entry("/a.txt")],
      }),
    );

    await flushPromises();
    dispatchContextMenu(failingWrapper.get(".finder__browser").element);
    await flushReka();
    menuItems()[2]!.click();
    await flushReka();

    expect(failingWrapper.text()).toContain("Finder could not copy the path.");

    failingWrapper.unmount();
  });
});
