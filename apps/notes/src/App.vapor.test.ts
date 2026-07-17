import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { flushPromises, mountVaporRoot, type VaporMount } from "~/test/mountVapor";

const { resizeCallbacks } = vi.hoisted(() => ({
  resizeCallbacks: [] as Array<(entries: Array<{ contentRect: { width: number } }>) => void>,
}));

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useResizeObserver: (
    _target: unknown,
    callback: (entries: Array<{ contentRect: { width: number } }>) => void,
  ): (() => void) => {
    resizeCallbacks.push(callback);

    return () => undefined;
  },
}));

import type { VfsDirEntry, VfsStat } from "~/core/vfs/nodes";
import { basename, dirname, normalizeVfsPath } from "~/core/vfs/path";
import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  type AppChromeBackAction,
  type AppChromeController,
  type AppContext,
} from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import App from "./App.vue";
import { NOTES_MIME_TYPE, NOTES_ROOT } from "./useNotes";

interface FakeNode {
  kind: "file" | "directory";
  text?: string;
  mimeType?: string;
  updatedAt?: number;
}

function stat(path: string, node: FakeNode): VfsStat {
  const normalized = normalizeVfsPath(path);
  return {
    path: normalized,
    kind: node.kind,
    size: node.text?.length ?? 0,
    createdAt: node.updatedAt ?? 0,
    updatedAt: node.updatedAt ?? 0,
    readonly: false,
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
    updatedAt: node.updatedAt ?? 0,
    readonly: false,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function makeKernel(seed: Record<string, FakeNode>): Kernel {
  const nodes: Record<string, FakeNode> = { ...seed };
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  let now = 20;

  function emit(channel: string, payload: unknown): void {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
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
      off: vi.fn((channel: string, listener: (payload: unknown) => void) => {
        listeners.get(channel)?.delete(listener);
      }),
    },
    vfs: {
      stat: vi.fn(async (path: string) => stat(path, nodes[normalizeVfsPath(path)]!)),
      list: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        return Object.entries(nodes)
          .filter(([candidate]) => dirname(normalizeVfsPath(candidate)) === normalized)
          .filter(([candidate]) => candidate !== normalized)
          .map(([candidate, node]) => entry(candidate, node));
      }),
      read: vi.fn(async () => null),
      readText: vi.fn(async (path: string) => nodes[normalizeVfsPath(path)]?.text ?? null),
      write: vi.fn(async () => null),
      writeText: vi.fn(
        async (
          path: string,
          text: string,
          options: { handleId?: string; overwrite?: boolean; mimeType?: string } = {},
        ) => {
          const normalized = normalizeVfsPath(path);
          nodes[normalized] = {
            kind: "file",
            text,
            updatedAt: ++now,
            ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
          };
          return stat(normalized, nodes[normalized]!);
        },
      ),
      mkdir: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        nodes[normalized] ??= { kind: "directory", updatedAt: ++now };
        return stat(normalized, nodes[normalized]!);
      }),
      remove: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        if (nodes[normalized] === undefined) {
          return false;
        }

        delete nodes[normalized];
        return true;
      }),
    },
    trash: {
      moveToTrash: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        const node = nodes[normalized];
        if (node === undefined) {
          return null;
        }

        delete nodes[normalized];
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
          deletedAt: ++now,
          kind: node.kind === "directory" ? "directory" : "file",
          size: node.text?.length ?? 0,
          ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
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
    manifestId: "notes",
    handleId: "notes-handle",
    args: Object.freeze(args),
  });
}

function mountNotes(
  kernel: Kernel,
  context: AppContext = makeContext(),
  options: { readonly appChrome?: AppChromeController } = {},
): VaporMount {
  return mountVaporRoot(App, {
    provide: [
      [KernelInjectionKey, kernel],
      [AppContextInjectionKey, context],
      ...(options.appChrome === undefined
        ? []
        : ([[AppChromeInjectionKey, options.appChrome]] as const)),
    ],
  });
}

async function click(element: HTMLElement): Promise<void> {
  element.click();
  await nextTick();
}

function setNotesWidth(width: number): void {
  for (const callback of resizeCallbacks) {
    callback([{ contentRect: { width } }]);
  }
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

async function flushOverlay(): Promise<void> {
  await nextTick();
  await nextTick();
  await flushPromises();
  await nextTick();
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
}

describe("Notes App.vue", () => {
  beforeEach(() => {
    localStorage.clear();
    resizeCallbacks.length = 0;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the empty state and New button", async () => {
    const wrapper = mountNotes(makeKernel({ [NOTES_ROOT]: { kind: "directory" } }));

    await flushPromises();

    expect(wrapper.text()).toContain("No notes yet.");
    const newButton = wrapper.find(".notes__new-button");
    expect(newButton.textContent).toContain("New");
    expect(newButton.classList).toContain("ds-button--sm");

    wrapper.unmount();
  });

  it("keeps the desktop list and editor visible together", async () => {
    const wrapper = mountNotes(
      makeKernel({
        [NOTES_ROOT]: { kind: "directory" },
        "/home/notes/a.md": {
          kind: "file",
          text: "# Alpha\n\nA body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 1,
        },
      }),
    );

    await flushPromises();

    expect(wrapper.exists(".notes__sidebar")).toBe(true);
    expect(wrapper.exists(".notes__editor")).toBe(true);
    expect(wrapper.find<HTMLInputElement>(".notes__title-input").value).toBe("Alpha");

    wrapper.unmount();
  });

  it("opens the note path provided by launch args", async () => {
    const wrapper = mountNotes(
      makeKernel({
        [NOTES_ROOT]: { kind: "directory" },
        "/home/notes/a.md": {
          kind: "file",
          text: "# Alpha\n\nA body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 2,
        },
        "/home/notes/b.md": {
          kind: "file",
          text: "# Beta\n\nB body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 1,
        },
      }),
      makeContext({ path: "/home/notes/b.md" }),
    );

    await flushPromises();

    expect(wrapper.find<HTMLInputElement>(".notes__title-input").value).toBe("Beta");
    expect(wrapper.find<HTMLTextAreaElement>(".notes__textarea").value).toBe("B body");

    wrapper.unmount();
  });

  it("responds to notes.open.requested while mounted", async () => {
    const kernel = makeKernel({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nA body",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 2,
      },
      "/home/notes/b.md": {
        kind: "file",
        text: "# Beta\n\nB body",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const wrapper = mountNotes(kernel);

    await flushPromises();
    kernel.events.emit("notes.open.requested", {
      source: "api",
      path: "/home/notes/b.md",
    });
    await flushPromises();

    expect(wrapper.find<HTMLInputElement>(".notes__title-input").value).toBe("Beta");
    expect(wrapper.find<HTMLTextAreaElement>(".notes__textarea").value).toBe("B body");

    wrapper.unmount();
  });

  it("selecting a note loads its title and body", async () => {
    const wrapper = mountNotes(
      makeKernel({
        [NOTES_ROOT]: { kind: "directory" },
        "/home/notes/a.md": {
          kind: "file",
          text: "# Alpha\n\nA body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 2,
        },
        "/home/notes/b.md": {
          kind: "file",
          text: "# Beta\n\nB body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 1,
        },
      }),
    );

    await flushPromises();
    await click(wrapper.findAll<HTMLElement>(".notes__note-button")[1]!);
    await flushPromises();

    expect(wrapper.find<HTMLInputElement>(".notes__title-input").value).toBe("Beta");
    expect(wrapper.find<HTMLTextAreaElement>(".notes__textarea").value).toBe("B body");

    wrapper.unmount();
  });

  it("starts compact mode on the list screen only", async () => {
    const wrapper = mountNotes(
      makeKernel({
        [NOTES_ROOT]: { kind: "directory" },
        "/home/notes/a.md": {
          kind: "file",
          text: "# Alpha\n\nA body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 2,
        },
        "/home/notes/b.md": {
          kind: "file",
          text: "# Beta\n\nB body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 1,
        },
      }),
    );

    await flushPromises();
    setNotesWidth(320);
    await nextTick();

    expect(wrapper.find(".notes").classList).toContain("notes--compact");
    expect(wrapper.exists(".notes__sidebar")).toBe(true);
    expect(wrapper.exists(".notes__editor")).toBe(false);
    expect(wrapper.find(".notes__new-button").classList).toContain("ds-button--md");
    expect(wrapper.findAll(".notes__note-button")).toHaveLength(2);

    wrapper.unmount();
  });

  it("opens the compact editor when a note row is tapped", async () => {
    const wrapper = mountNotes(
      makeKernel({
        [NOTES_ROOT]: { kind: "directory" },
        "/home/notes/a.md": {
          kind: "file",
          text: "# Alpha\n\nA body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 2,
        },
        "/home/notes/b.md": {
          kind: "file",
          text: "# Beta\n\nB body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 1,
        },
      }),
    );

    await flushPromises();
    setNotesWidth(320);
    await nextTick();
    await click(wrapper.findAll<HTMLElement>(".notes__note-button")[1]!);
    await flushPromises();

    expect(wrapper.exists(".notes__sidebar")).toBe(false);
    expect(wrapper.exists(".notes__editor")).toBe(true);
    expect(wrapper.find<HTMLInputElement>(".notes__title-input").value).toBe("Beta");
    expect(wrapper.find<HTMLTextAreaElement>(".notes__textarea").value).toBe("B body");

    wrapper.unmount();
  });

  it("uses mobile app chrome to return from the editor to the list", async () => {
    let backAction: AppChromeBackAction | null = null;
    const appChrome: AppChromeController = {
      setTitle: vi.fn(),
      setBackAction: vi.fn((action) => {
        backAction = action;
      }),
    };
    const wrapper = mountNotes(
      makeKernel({
        [NOTES_ROOT]: { kind: "directory" },
        "/home/notes/a.md": {
          kind: "file",
          text: "# Alpha\n\nA body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 2,
        },
        "/home/notes/b.md": {
          kind: "file",
          text: "# Beta\n\nB body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 1,
        },
      }),
      makeContext(),
      { appChrome },
    );

    await flushPromises();
    setNotesWidth(320);
    await nextTick();
    await click(wrapper.findAll<HTMLElement>(".notes__note-button")[1]!);
    await flushPromises();

    expect(wrapper.exists(".notes__sidebar")).toBe(false);
    expect(appChrome.setTitle).toHaveBeenLastCalledWith("Beta");
    expect(backAction?.ariaLabel).toBe("Back to Notes");

    backAction?.handler();
    await nextTick();

    expect(wrapper.exists(".notes__sidebar")).toBe(true);
    expect(wrapper.exists(".notes__editor")).toBe(false);
    expect(appChrome.setTitle).toHaveBeenLastCalledWith(null);
    expect(appChrome.setBackAction).toHaveBeenLastCalledWith(null);

    wrapper.unmount();
  });

  it("opens the compact editor after creating a note", async () => {
    const wrapper = mountNotes(makeKernel({ [NOTES_ROOT]: { kind: "directory" } }));

    await flushPromises();
    setNotesWidth(320);
    await nextTick();
    const newButton = wrapper
      .findAll<HTMLButtonElement>("button")
      .find((button) => button.textContent?.includes("New"));
    expect(newButton).toBeDefined();
    await click(newButton!);
    await flushPromises();

    expect(wrapper.exists(".notes__sidebar")).toBe(false);
    expect(wrapper.exists(".notes__editor")).toBe(true);
    expect(wrapper.find<HTMLInputElement>(".notes__title-input").value).toBe("Untitled note");

    wrapper.unmount();
  });

  it("right-clicking a note row opens note actions and selects that note", async () => {
    const wrapper = mountNotes(
      makeKernel({
        [NOTES_ROOT]: { kind: "directory" },
        "/home/notes/a.md": {
          kind: "file",
          text: "# Alpha\n\nA body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 2,
        },
        "/home/notes/b.md": {
          kind: "file",
          text: "# Beta\n\nB body",
          mimeType: NOTES_MIME_TYPE,
          updatedAt: 1,
        },
      }),
    );

    await flushPromises();
    dispatchContextMenu(wrapper.findAll(".notes__note-button")[1]!);
    await flushOverlay();

    expect(menuItems().map((node) => node.textContent?.trim())).toEqual([
      "Open",
      "Duplicate",
      "Pin to Desktop",
      "Reveal in Finder",
      "Delete...",
    ]);
    expect(wrapper.find<HTMLInputElement>(".notes__title-input").value).toBe("Beta");

    wrapper.unmount();
  });

  it("pins a note to the desktop from its context menu", async () => {
    const kernel = makeKernel({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nA body",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const wrapper = mountNotes(kernel);

    await flushPromises();
    dispatchContextMenu(wrapper.find(".notes__note-button"));
    await flushOverlay();
    menuItems()[2]!.click();
    await flushOverlay();

    expect(localStorage.getItem("notes-desktop:pinned")).toContain("/home/notes/a.md");

    wrapper.unmount();
  });

  it("duplicates a note from its context menu", async () => {
    const kernel = makeKernel({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nA body",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const wrapper = mountNotes(kernel);

    await flushPromises();
    dispatchContextMenu(wrapper.find(".notes__note-button"));
    await flushOverlay();
    menuItems()[1]!.click();
    await flushOverlay();

    expect(kernel.vfs.writeText).toHaveBeenLastCalledWith(
      "/home/notes/a copy.md",
      "# Alpha\n\nA body",
      {
        handleId: "notes-handle",
        overwrite: false,
        mimeType: NOTES_MIME_TYPE,
      },
    );
    expect(wrapper.findAll(".notes__note-button")).toHaveLength(2);

    wrapper.unmount();
  });

  it("reveals a note in Finder from its context menu", async () => {
    const kernel = makeKernel({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nA body",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const wrapper = mountNotes(kernel);

    await flushPromises();
    dispatchContextMenu(wrapper.find(".notes__note-button"));
    await flushOverlay();
    menuItems()[3]!.click();
    await flushOverlay();

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "finder",
      source: "menu",
      args: { path: NOTES_ROOT, reveal: "/home/notes/a.md" },
    });

    wrapper.unmount();
  });

  it("confirms before deleting a note from its context menu", async () => {
    const kernel = makeKernel({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nA body",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 2,
      },
      "/home/notes/b.md": {
        kind: "file",
        text: "# Beta\n\nB body",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const wrapper = mountNotes(kernel);

    await flushPromises();
    dispatchContextMenu(wrapper.findAll(".notes__note-button")[0]!);
    await flushOverlay();
    menuItems()[4]!.click();
    await flushOverlay();

    expect(kernel.trash.moveToTrash).not.toHaveBeenCalled();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const deleteButton = Array.from(dialog!.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Move to Trash",
    );
    expect(deleteButton).not.toBeUndefined();

    deleteButton!.click();
    await flushOverlay();

    expect(kernel.trash.moveToTrash).toHaveBeenCalledWith("/home/notes/a.md", {
      handleId: "notes-handle",
    });
    expect(wrapper.find<HTMLInputElement>(".notes__title-input").value).toBe("Beta");

    wrapper.unmount();
  });

  it("typing in the editor triggers debounced autosave", async () => {
    vi.useFakeTimers();
    const kernel = makeKernel({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const wrapper = mountNotes(kernel);

    await flushPromises();
    await wrapper.setValue(".notes__textarea", "New body");
    await vi.advanceTimersByTimeAsync(800);

    expect(kernel.vfs.writeText).toHaveBeenLastCalledWith(
      "/home/notes/a.md",
      "# Alpha\n\nNew body",
      {
        handleId: "notes-handle",
        overwrite: true,
        mimeType: NOTES_MIME_TYPE,
      },
    );

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("flushes pending edits when its process is about to close", async () => {
    const kernel = makeKernel({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const wrapper = mountNotes(kernel);

    await flushPromises();
    await wrapper.setValue(".notes__textarea", "Changed before close");

    const pendingCloseWork: Promise<unknown>[] = [];
    kernel.events.emit("app.will-kill", {
      manifestId: "notes",
      handleId: "notes-handle",
      reason: "shell",
      waitUntil: (promise: Promise<unknown>) => {
        pendingCloseWork.push(promise);
      },
    });
    await flushPromises();
    await Promise.all(pendingCloseWork);

    expect(kernel.vfs.writeText).toHaveBeenLastCalledWith(
      "/home/notes/a.md",
      "# Alpha\n\nChanged before close",
      {
        handleId: "notes-handle",
        overwrite: true,
        mimeType: NOTES_MIME_TYPE,
      },
    );

    wrapper.unmount();
  });

  it("does not start an untracked second flush when unmounted during close save", async () => {
    const kernel = makeKernel({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const pending = deferred<VfsStat>();
    vi.mocked(kernel.vfs.writeText).mockImplementationOnce(async () => await pending.promise);
    const wrapper = mountNotes(kernel);

    await flushPromises();
    await wrapper.setValue(".notes__textarea", "Changed before close");

    const pendingCloseWork: Promise<unknown>[] = [];
    kernel.events.emit("app.will-kill", {
      manifestId: "notes",
      handleId: "notes-handle",
      reason: "shell",
      waitUntil: (promise: Promise<unknown>) => {
        pendingCloseWork.push(promise);
      },
    });
    wrapper.unmount();

    expect(kernel.vfs.writeText).toHaveBeenCalledTimes(1);

    pending.resolve(
      stat("/home/notes/a.md", {
        kind: "file",
        text: "# Alpha\n\nChanged before close",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 21,
      }),
    );
    await Promise.all(pendingCloseWork);
    await flushPromises();

    expect(kernel.vfs.writeText).toHaveBeenCalledTimes(1);
  });
});
