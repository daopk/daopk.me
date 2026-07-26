import { describe, expect, it, vi } from "vitest";

import type { VfsDirEntry, VfsStat } from "~/core/vfs/nodes";
import { basename, dirname, normalizeVfsPath } from "~/core/vfs/path";

import { NOTES_MIME_TYPE, NOTES_ROOT, noteSource, parseNoteSource, useNotes } from "./useNotes";
import type { NotesVfsClient } from "./useNotes";

interface FakeNode {
  kind: "file" | "directory";
  text?: string;
  mimeType?: string;
  updatedAt?: number;
}

interface FakeVfs extends NotesVfsClient {
  readonly nodes: Record<string, FakeNode>;
  readonly writes: Array<{ path: string; text: string; options: Record<string, unknown> }>;
  readonly trashed: string[];
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

function makeVfs(seed: Record<string, FakeNode> = {}): FakeVfs {
  const nodes: Record<string, FakeNode> = { ...seed };
  const writes: FakeVfs["writes"] = [];
  const trashed: string[] = [];
  let now = 10;

  return {
    nodes,
    writes,
    trashed,
    mkdir: vi.fn(async (path: string) => {
      const normalized = normalizeVfsPath(path);
      const parts = normalized.split("/").filter(Boolean);
      let current = "";
      for (const part of parts) {
        current = `${current}/${part}`;
        nodes[current] ??= { kind: "directory", updatedAt: ++now };
      }
      return stat(normalized, nodes[normalized]!);
    }),
    list: vi.fn(async (path: string) => {
      const normalized = normalizeVfsPath(path);
      return Object.entries(nodes)
        .filter(([candidate]) => dirname(normalizeVfsPath(candidate)) === normalized)
        .filter(([candidate]) => candidate !== normalized)
        .map(([candidate, node]) => entry(candidate, node));
    }),
    readText: vi.fn(async (path: string) => nodes[normalizeVfsPath(path)]?.text ?? null),
    writeText: vi.fn(
      async (
        path: string,
        text: string,
        options: { overwrite?: boolean; mimeType?: string } = {},
      ) => {
        const normalized = normalizeVfsPath(path);
        writes.push({ path: normalized, text, options });
        nodes[normalized] = {
          kind: "file",
          text,
          updatedAt: ++now,
          ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
        };
        return stat(normalized, nodes[normalized]!);
      },
    ),
    remove: vi.fn(async (path: string) => {
      const normalized = normalizeVfsPath(path);
      if (nodes[normalized] === undefined) {
        return false;
      }

      delete nodes[normalized];
      return true;
    }),
    moveToTrash: vi.fn(async (path: string) => {
      const normalized = normalizeVfsPath(path);
      const node = nodes[normalized];
      if (node === undefined) {
        return null;
      }

      delete nodes[normalized];
      trashed.push(normalized);
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
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function mockNextWriteWithDeferredMutation(vfs: FakeVfs) {
  const pending = deferred<VfsStat>();
  vi.mocked(vfs.writeText).mockImplementationOnce(
    async (path: string, text: string, options = {}) => {
      const normalized = normalizeVfsPath(path);
      vfs.writes.push({ path: normalized, text, options });
      const result = await pending.promise;
      vfs.nodes[normalized] = {
        kind: "file",
        text,
        updatedAt: result.updatedAt,
        ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
      };
      return result;
    },
  );
  return pending;
}

describe("useNotes", () => {
  it("creates /home/notes on first load", async () => {
    const vfs = makeVfs();
    const notes = useNotes({ vfs });

    await expect(notes.loadNotes()).resolves.toBe(true);

    expect(vfs.mkdir).toHaveBeenCalledWith(NOTES_ROOT, { recursive: true });
    expect(notes.status.value).toBe("empty");
  });

  it("lists only markdown notes sorted by updated time", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nA",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
      "/home/notes/skip.txt": { kind: "file", text: "skip", mimeType: "text/plain", updatedAt: 9 },
      "/home/notes/c.markdown": {
        kind: "file",
        text: "# Charlie\n\nC",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 3,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();

    expect(notes.notes.value.map((note) => note.path)).toEqual([
      "/home/notes/c.markdown",
      "/home/notes/a.md",
    ]);
    expect(notes.title.value).toBe("Charlie");
  });

  it("creates an immediate skeleton note with markdown MIME type", async () => {
    const vfs = makeVfs({ [NOTES_ROOT]: { kind: "directory" } });
    const notes = useNotes({
      vfs,
      now: () => new Date(2026, 4, 21, 10, 9, 8),
    });

    await expect(notes.createNote()).resolves.toBe(true);

    expect(vfs.writes[0]).toEqual({
      path: "/home/notes/note-20260521-100908.md",
      text: "# Untitled note\n\n",
      options: { overwrite: false, mimeType: NOTES_MIME_TYPE },
    });
    expect(notes.selectedPath.value).toBe("/home/notes/note-20260521-100908.md");
  });

  it("duplicates a note with preserved markdown source and a unique sibling path", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOriginal body",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 3,
      },
      "/home/notes/a copy.md": {
        kind: "file",
        text: "# Alpha\n\nOlder copy",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 2,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    await expect(notes.duplicateNote("/home/notes/a.md")).resolves.toBe(true);

    expect(vfs.writes.at(-1)).toEqual({
      path: "/home/notes/a copy 2.md",
      text: "# Alpha\n\nOriginal body",
      options: { overwrite: false, mimeType: NOTES_MIME_TYPE },
    });
    expect(notes.selectedPath.value).toBe("/home/notes/a copy 2.md");
    expect(notes.title.value).toBe("Alpha");
    expect(notes.draft.value).toBe("Original body");
  });

  it("derives title from first H1 and updates the stored H1", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Old title\n\nBody",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    expect(notes.title.value).toBe("Old title");
    expect(notes.draft.value).toBe("Body");

    notes.setTitle("New title");
    await notes.flushAutosave();

    expect(vfs.writes.at(-1)).toMatchObject({
      path: "/home/notes/a.md",
      text: "# New title\n\nBody",
    });
  });

  it("autosaves after the debounce window", async () => {
    vi.useFakeTimers();
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("New body");
    await vi.advanceTimersByTimeAsync(799);
    expect(vfs.writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(vfs.writes.at(-1)).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nNew body",
    });
    vi.useRealTimers();
  });

  it("flushes pending edits before switching notes", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 2,
      },
      "/home/notes/b.md": {
        kind: "file",
        text: "# Beta\n\nBody",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("Changed before switch");
    await expect(notes.selectNote("/home/notes/b.md")).resolves.toBe(true);

    expect(vfs.writes[0]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nChanged before switch",
    });
    expect(notes.selectedPath.value).toBe("/home/notes/b.md");
  });

  it("flushes pending edits before creating another note", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const notes = useNotes({
      vfs,
      now: () => new Date(2026, 4, 21, 10, 9, 8),
    });

    await notes.loadNotes();
    notes.setDraft("Changed before create");
    await expect(notes.createNote()).resolves.toBe(true);

    expect(vfs.writes[0]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nChanged before create",
    });
    expect(vfs.writes[1]).toMatchObject({
      path: "/home/notes/note-20260521-100908.md",
      text: "# Untitled note\n\n",
    });
  });

  it("flushes pending edits before duplicating a note", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("Changed before duplicate");
    await expect(notes.duplicateNote("/home/notes/a.md")).resolves.toBe(true);

    expect(vfs.writes[0]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nChanged before duplicate",
      options: { overwrite: true, mimeType: NOTES_MIME_TYPE },
    });
    expect(vfs.writes[1]).toMatchObject({
      path: "/home/notes/a copy.md",
      text: "# Alpha\n\nChanged before duplicate",
      options: { overwrite: false, mimeType: NOTES_MIME_TYPE },
    });
  });

  it("deletes the selected note and selects the next note", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nA",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 3,
      },
      "/home/notes/b.md": {
        kind: "file",
        text: "# Beta\n\nB",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 2,
      },
      "/home/notes/c.md": {
        kind: "file",
        text: "# Charlie\n\nC",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    await expect(notes.deleteNote("/home/notes/a.md")).resolves.toBe(true);

    expect(vfs.moveToTrash).toHaveBeenCalledWith("/home/notes/a.md");
    expect(notes.notes.value.map((note) => note.path)).toEqual([
      "/home/notes/b.md",
      "/home/notes/c.md",
    ]);
    expect(notes.selectedPath.value).toBe("/home/notes/b.md");
    expect(notes.title.value).toBe("Beta");
  });

  it("does not restore a deleted note when a pending selection resolves late", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nA",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 2,
      },
      "/home/notes/b.md": {
        kind: "file",
        text: "# Beta\n\nB",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    expect(notes.selectedPath.value).toBe("/home/notes/a.md");

    const pendingRead = deferred<string | null>();
    vi.mocked(vfs.readText).mockImplementationOnce(async () => await pendingRead.promise);
    const selection = notes.selectNote("/home/notes/b.md");
    for (
      let turn = 0;
      turn < 10 && vi.mocked(vfs.readText).mock.calls.at(-1)?.[0] !== "/home/notes/b.md";
      turn += 1
    ) {
      await Promise.resolve();
    }
    expect(vfs.readText).toHaveBeenLastCalledWith("/home/notes/b.md");

    await expect(notes.deleteNote("/home/notes/b.md")).resolves.toBe(true);
    expect(notes.selectedPath.value).toBe("/home/notes/a.md");

    pendingRead.resolve("# Beta\n\nB");
    await expect(selection).resolves.toBe(false);

    expect(notes.notes.value.map((note) => note.path)).toEqual(["/home/notes/a.md"]);
    expect(notes.selectedPath.value).toBe("/home/notes/a.md");
  });

  it("keeps local state intact and surfaces an error when delete fails", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nA",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    vi.mocked(vfs.moveToTrash).mockResolvedValueOnce(null);
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    await expect(notes.deleteNote("/home/notes/a.md")).resolves.toBe(false);

    expect(notes.status.value).toBe("error");
    expect(notes.error.value).toBe("Notes does not have permission to move this note to Trash.");
    expect(notes.notes.value.map((note) => note.path)).toEqual(["/home/notes/a.md"]);
    expect(notes.selectedPath.value).toBe("/home/notes/a.md");
    expect(notes.title.value).toBe("Alpha");
  });

  it("flushes pending edits before deleting a note", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("Changed before delete");
    await expect(notes.deleteNote("/home/notes/a.md")).resolves.toBe(true);

    expect(vfs.writes[0]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nChanged before delete",
      options: { overwrite: true, mimeType: NOTES_MIME_TYPE },
    });
    expect(vfs.moveToTrash).toHaveBeenCalledWith("/home/notes/a.md");
    expect(notes.status.value).toBe("empty");
    expect(notes.selectedPath.value).toBeNull();
  });

  it("starts a final autosave on dispose instead of dropping pending edits", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("Changed before close");
    notes.dispose();

    expect(vfs.writes[0]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nChanged before close",
    });
  });

  it("keeps newer edits unsaved when an older in-flight save resolves", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const pending = mockNextWriteWithDeferredMutation(vfs);
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("First edit");
    const firstSave = notes.flushAutosave();
    notes.setDraft("Second edit");

    pending.resolve(stat("/home/notes/a.md", vfs.nodes["/home/notes/a.md"]!));
    await expect(firstSave).resolves.toBe(false);

    expect(notes.status.value).toBe("unsaved");
    expect(notes.draft.value).toBe("Second edit");

    await notes.flushAutosave();
    expect(vfs.writes.at(-1)).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nSecond edit",
    });
  });

  it("repairs stale disk content after reverting while an older save is in flight", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const pending = deferred<VfsStat>();
    vi.mocked(vfs.writeText).mockImplementationOnce(
      async (path: string, text: string, options = {}) => {
        vfs.writes.push({ path: normalizeVfsPath(path), text, options });
        return await pending.promise;
      },
    );
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("Temporary edit");
    const staleSave = notes.flushAutosave();
    notes.setDraft("Old");

    expect(notes.status.value).toBe("unsaved");

    pending.resolve(
      stat("/home/notes/a.md", {
        kind: "file",
        text: "# Alpha\n\nTemporary edit",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 11,
      }),
    );
    await expect(staleSave).resolves.toBe(false);

    expect(notes.status.value).toBe("unsaved");

    await notes.flushAutosave();
    expect(vfs.writes.at(-1)).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nOld",
    });
    expect(vfs.nodes["/home/notes/a.md"]?.text).toBe("# Alpha\n\nOld");
  });

  it("starts a close save after reverting while an older save is in flight", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const pending = mockNextWriteWithDeferredMutation(vfs);
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("Temporary edit");
    const staleSave = notes.flushAutosave();
    notes.setDraft("Old");
    notes.dispose();

    pending.resolve(
      stat("/home/notes/a.md", {
        kind: "file",
        text: "# Alpha\n\nTemporary edit",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 11,
      }),
    );
    await staleSave;
    await Promise.resolve();
    await Promise.resolve();

    expect(vfs.writes[1]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nOld",
    });
    expect(vfs.nodes["/home/notes/a.md"]?.text).toBe("# Alpha\n\nOld");
  });

  it("repairs reverted in-flight edits before switching notes", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 2,
      },
      "/home/notes/b.md": {
        kind: "file",
        text: "# Beta\n\nBody",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const pending = mockNextWriteWithDeferredMutation(vfs);
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("Temporary edit");
    const staleSave = notes.flushAutosave();
    notes.setDraft("Old");

    const selection = notes.selectNote("/home/notes/b.md");
    await Promise.resolve();
    expect(vfs.writes).toHaveLength(1);

    pending.resolve(
      stat("/home/notes/a.md", {
        kind: "file",
        text: "# Alpha\n\nTemporary edit",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 11,
      }),
    );
    await expect(selection).resolves.toBe(true);
    await staleSave;

    expect(vfs.writes[1]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nOld",
    });
    expect(vfs.nodes["/home/notes/a.md"]?.text).toBe("# Alpha\n\nOld");
    expect(notes.selectedPath.value).toBe("/home/notes/b.md");
  });

  it("repairs reverted in-flight edits before creating another note", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const pending = mockNextWriteWithDeferredMutation(vfs);
    const notes = useNotes({
      vfs,
      now: () => new Date(2026, 4, 21, 10, 9, 8),
    });

    await notes.loadNotes();
    notes.setDraft("Temporary edit");
    const staleSave = notes.flushAutosave();
    notes.setDraft("Old");

    const create = notes.createNote();
    await Promise.resolve();
    expect(vfs.writes).toHaveLength(1);

    pending.resolve(
      stat("/home/notes/a.md", {
        kind: "file",
        text: "# Alpha\n\nTemporary edit",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 11,
      }),
    );
    await expect(create).resolves.toBe(true);
    await staleSave;

    expect(vfs.writes[1]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nOld",
    });
    expect(vfs.writes[2]).toMatchObject({
      path: "/home/notes/note-20260521-100908.md",
      text: "# Untitled note\n\n",
    });
    expect(vfs.nodes["/home/notes/a.md"]?.text).toBe("# Alpha\n\nOld");
  });

  it("ignores rapid duplicate create requests while the first create is in flight", async () => {
    const vfs = makeVfs({ [NOTES_ROOT]: { kind: "directory" } });
    const pending = deferred<VfsStat>();
    vi.mocked(vfs.writeText).mockImplementationOnce(
      async (path: string, text: string, options = {}) => {
        vfs.writes.push({ path: normalizeVfsPath(path), text, options });
        return await pending.promise;
      },
    );
    const notes = useNotes({
      vfs,
      now: () => new Date(2026, 4, 21, 10, 9, 8),
    });

    const firstCreate = notes.createNote();
    const secondCreate = notes.createNote();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(await secondCreate).toBe(false);
    expect(vfs.writeText).toHaveBeenCalledTimes(1);

    pending.resolve(
      stat("/home/notes/note-20260521-100908.md", {
        kind: "file",
        text: "# Untitled note\n\n",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 11,
      }),
    );
    await expect(firstCreate).resolves.toBe(true);
  });

  it("waits for an in-flight save before switching notes", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 2,
      },
      "/home/notes/b.md": {
        kind: "file",
        text: "# Beta\n\nBody",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    const pending = deferred<VfsStat>();
    vi.mocked(vfs.writeText).mockImplementationOnce(
      async (path: string, text: string, options = {}) => {
        vfs.writes.push({ path: normalizeVfsPath(path), text, options });
        return await pending.promise;
      },
    );
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("Changed");
    const save = notes.flushAutosave();
    const selection = notes.selectNote("/home/notes/b.md");
    await Promise.resolve();

    pending.resolve(stat("/home/notes/a.md", vfs.nodes["/home/notes/a.md"]!));
    await expect(selection).resolves.toBe(true);
    await save;

    expect(notes.selectedPath.value).toBe("/home/notes/b.md");
    expect(notes.title.value).toBe("Beta");
    expect(notes.draft.value).toBe("Body");
  });

  it("keeps the draft when write permission is denied", async () => {
    const vfs = makeVfs({
      [NOTES_ROOT]: { kind: "directory" },
      "/home/notes/a.md": {
        kind: "file",
        text: "# Alpha\n\nOld",
        mimeType: NOTES_MIME_TYPE,
        updatedAt: 1,
      },
    });
    vi.mocked(vfs.writeText).mockResolvedValueOnce(null);
    const notes = useNotes({ vfs });

    await notes.loadNotes();
    notes.setDraft("Still here");

    await expect(notes.flushAutosave()).resolves.toBe(false);

    expect(notes.status.value).toBe("error");
    expect(notes.draft.value).toBe("Still here");
    expect(notes.error.value).toContain("permission");
  });
});

describe("note source helpers", () => {
  it("falls back to the file name when no H1 exists", () => {
    expect(parseNoteSource("Body only", "/home/notes/body-only.md")).toEqual({
      title: "body-only",
      body: "Body only",
    });
  });

  it("normalizes blank titles when writing source", () => {
    expect(noteSource(" ", "Body")).toBe("# Untitled note\n\nBody");
  });
});
