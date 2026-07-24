import { flushPromises, mountVaporTest } from "~/test/mountVapor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick } from "vue";

import {
  AppContextInjectionKey,
  KernelInjectionKey,
  basename,
  normalizeVfsPath,
  type AppContext,
  type Kernel,
  type VfsDirEntry,
  type VfsStat,
} from "@daopk/sdk";

import { useFinderSession, type FinderSession } from "./useFinderSession";

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

function stat(item: VfsDirEntry): VfsStat {
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

function makeKernel(initialEntries: readonly VfsDirEntry[]): Kernel {
  const root = entry("/", "directory");
  const entries = [...initialEntries];
  const nodes = new Map<string, VfsDirEntry>([
    [root.path, root],
    ...initialEntries.map((item) => [item.path, item] as const),
  ]);
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  function emit(channel: string, payload: unknown): void {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  }

  return {
    events: {
      emit: vi.fn(emit),
      on: vi.fn((channel: string, listener: (payload: unknown) => void) => {
        const bucket = listeners.get(channel) ?? new Set<(payload: unknown) => void>();
        bucket.add(listener);
        listeners.set(channel, bucket);
        return () => bucket.delete(listener);
      }),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
    vfs: {
      stat: vi.fn(async (path: string) => {
        const item = nodes.get(normalizeVfsPath(path));
        return item === undefined ? null : stat(item);
      }),
      list: vi.fn(async (path: string) => (normalizeVfsPath(path) === "/" ? [...entries] : [])),
      read: vi.fn(async () => new Uint8Array([1, 2, 3])),
      readText: vi.fn(async (path: string) => `preview:${normalizeVfsPath(path)}`),
      write: vi.fn(async () => null),
      writeText: vi.fn(async () => null),
      mkdir: vi.fn(async () => null),
      remove: vi.fn(async () => false),
    },
    trash: {
      moveToTrash: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        const index = entries.findIndex((item) => item.path === normalized);
        const item = entries[index];
        if (item === undefined) {
          return null;
        }

        entries.splice(index, 1);
        nodes.delete(normalized);
        return {
          id: `trash-${item.name}`,
          name: item.name,
          originalPath: item.path,
          deletedAt: 1,
          kind: item.kind === "directory" ? "directory" : "file",
          size: item.size,
          ...(item.mimeType === undefined ? {} : { mimeType: item.mimeType }),
        };
      }),
    },
    apps: {
      list: vi.fn(() => []),
    },
  } as unknown as Kernel;
}

const context: AppContext = Object.freeze({
  manifestId: "finder",
  handleId: "finder-session-test",
  args: Object.freeze({}),
  isActive: () => true,
});

function mountSession(kernel: Kernel) {
  let result!: FinderSession;
  const Harness = defineVaporComponent(
    () => {
      result = useFinderSession();
      return document.createElement("div");
    },
    { name: "FinderSessionHarness" },
  );
  const wrapper = mountVaporTest(Harness, {
    toastProvider: true,
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
        [AppContextInjectionKey as symbol]: context,
      },
    },
  });
  return { result, unmount: () => wrapper.unmount() };
}

describe("Finder session", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("publishes render state and keeps selection-to-preview coordination internal", async () => {
    const kernel = makeKernel([entry("/note.txt"), entry("/home", "directory")]);
    const mounted = mountSession(kernel);

    expect(Object.keys(mounted.result).sort()).toEqual(["send", "state"]);

    await flushPromises();

    expect(mounted.result.state.value.entries.selectedPath).toBe("/note.txt");
    expect(mounted.result.state.value.previewPane).toMatchObject({
      kind: "text",
      path: "/note.txt",
      text: "preview:/note.txt",
    });

    mounted.result.send({ type: "select-entry", path: "/home" });
    await flushPromises();

    expect(mounted.result.state.value.entries.selectedPath).toBe("/home");
    expect(mounted.result.state.value.previewPane).toMatchObject({
      kind: "directory",
      path: "/home",
    });

    kernel.events.emit("shell.changed", {
      shellId: "mobile",
      profile: { formFactor: "mobile" },
    });
    await nextTick();

    expect(mounted.result.state.value.entries.selectedPath).toBeNull();
    expect(mounted.result.state.value.previewPane).toBeNull();
  });

  it("owns open policy behind intents and rejects stale suggestions", async () => {
    const kernel = makeKernel([entry("/note.txt")]);
    const mounted = mountSession(kernel);
    await flushPromises();

    mounted.result.send({ type: "open-selected-entry" });

    expect(kernel.events.emit).toHaveBeenCalledWith("editor.open.requested", {
      source: "api",
      path: "/note.txt",
    });

    vi.mocked(kernel.events.emit).mockClear();
    mounted.result.send({
      type: "open-with-suggestion",
      path: "/note.txt",
      suggestionId: "pdf-viewer",
    });

    expect(kernel.events.emit).not.toHaveBeenCalled();
  });

  it("owns delete confirmation and refreshes the published entries", async () => {
    const kernel = makeKernel([entry("/a.txt"), entry("/b.txt")]);
    const mounted = mountSession(kernel);
    await flushPromises();

    mounted.result.send({ type: "request-delete", path: "/a.txt" });
    expect(mounted.result.state.value.deleteConfirmation).toMatchObject({
      description: 'Move "a.txt" to Trash?',
      open: true,
    });

    mounted.result.send({ type: "confirm-delete" });
    await flushPromises();

    expect(kernel.trash.moveToTrash).toHaveBeenCalledWith("/a.txt", {
      handleId: "finder-session-test",
    });
    expect(mounted.result.state.value.entries.entries.map((item) => item.path)).toEqual(["/b.txt"]);
    expect(mounted.result.state.value.deleteConfirmation.open).toBe(false);
  });
});
