import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeVfsPath, type VfsStat } from "@daopk/sdk";

import {
  createNoteEditingSession,
  createNoteEditingSessions,
  NOTES_MIME_TYPE,
  type NoteEditingSession,
  type NoteEditingSessions,
  type NoteEditingVfsClient,
} from "./useNoteEditingSession";

interface FakeNode {
  text: string;
  updatedAt: number;
}

interface FakeVfs extends NoteEditingVfsClient {
  readonly nodes: Record<string, FakeNode>;
  readonly writes: Array<{ path: string; text: string; options: Record<string, unknown> }>;
}

const sessions: NoteEditingSession[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) {
    session.dispose({ flush: false });
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function stat(path: string, node: FakeNode): VfsStat {
  return {
    path: normalizeVfsPath(path),
    kind: "file",
    size: node.text.length,
    createdAt: node.updatedAt,
    updatedAt: node.updatedAt,
    readonly: false,
    mimeType: NOTES_MIME_TYPE,
  };
}

function makeVfs(seed: Record<string, string>): FakeVfs {
  const nodes = Object.fromEntries(
    Object.entries(seed).map(([path, text], index) => [
      normalizeVfsPath(path),
      { text, updatedAt: index + 1 },
    ]),
  );
  const writes: FakeVfs["writes"] = [];
  let now = Object.keys(nodes).length + 1;

  return {
    nodes,
    writes,
    readText: vi.fn(async (path: string) => nodes[normalizeVfsPath(path)]?.text ?? null),
    writeText: vi.fn(
      async (
        path: string,
        text: string,
        options: { overwrite?: boolean; mimeType?: string } = {},
      ) => {
        const normalized = normalizeVfsPath(path);
        writes.push({ path: normalized, text, options });
        const node = { text, updatedAt: ++now };
        nodes[normalized] = node;
        return stat(normalized, node);
      },
    ),
  };
}

function createSession(
  vfs: FakeVfs,
  options: {
    debounceMs?: number;
    editingSessions?: NoteEditingSessions;
    onPersisted?: ReturnType<typeof vi.fn>;
  } = {},
): NoteEditingSession {
  const session = createNoteEditingSession({
    vfs,
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
    ...(options.editingSessions === undefined ? {} : { editingSessions: options.editingSessions }),
    ...(options.onPersisted === undefined ? {} : { onPersisted: options.onPersisted }),
  });
  sessions.push(session);
  return session;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("useNoteEditingSession", () => {
  it("shares one draft and autosave pipeline between callers editing the same path", async () => {
    vi.useFakeTimers();
    const path = "/home/notes/a.md";
    const vfs = makeVfs({ [path]: "# Alpha\n\nOld" });
    const editingSessions = createNoteEditingSessions();
    const firstPersisted = vi.fn();
    const secondPersisted = vi.fn();
    const first = createSession(vfs, {
      debounceMs: 800,
      editingSessions,
      onPersisted: firstPersisted,
    });
    const second = createSession(vfs, {
      debounceMs: 800,
      editingSessions,
      onPersisted: secondPersisted,
    });

    await expect(Promise.all([first.open(path), second.open(path)])).resolves.toEqual([
      "opened",
      "opened",
    ]);
    expect(vfs.readText).toHaveBeenCalledOnce();

    first.setBody("Shared body");
    expect(second.body.value).toBe("Shared body");
    second.setTitle("Shared title");
    expect(first.title.value).toBe("Shared title");

    await vi.advanceTimersByTimeAsync(800);
    expect(vfs.writes).toEqual([
      {
        path,
        text: "# Shared title\n\nShared body",
        options: { overwrite: true, mimeType: NOTES_MIME_TYPE },
      },
    ]);
    expect(firstPersisted).toHaveBeenCalledOnce();
    expect(secondPersisted).toHaveBeenCalledOnce();

    first.dispose({ flush: false });
    second.setBody("Still owned by the remaining caller");
    await vi.advanceTimersByTimeAsync(800);

    expect(vfs.writes.at(-1)?.text).toBe("# Shared title\n\nStill owned by the remaining caller");
  });

  it("retires a path after a replacement caller leaves during the final save", async () => {
    const path = "/home/notes/a.md";
    const vfs = makeVfs({ [path]: "# Alpha\n\nOld" });
    const pending = deferred<VfsStat>();
    vi.mocked(vfs.writeText).mockImplementationOnce(
      async (nextPath: string, text: string, options = {}) => {
        const normalized = normalizeVfsPath(nextPath);
        vfs.writes.push({ path: normalized, text, options });
        const result = await pending.promise;
        vfs.nodes[normalized] = { text, updatedAt: result.updatedAt };
        return result;
      },
    );
    const editingSessions = createNoteEditingSessions();
    const first = createSession(vfs, { editingSessions });

    await first.open(path);
    first.setBody("Saved while closing");
    first.dispose();

    const replacement = createSession(vfs, { editingSessions });
    await expect(replacement.open(path)).resolves.toBe("opened");
    replacement.dispose({ flush: false });

    pending.resolve(stat(path, { text: "# Alpha\n\nSaved while closing", updatedAt: 11 }));
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve();
    }

    const reopened = createSession(vfs, { editingSessions });
    await expect(reopened.open(path)).resolves.toBe("opened");
    expect(vfs.readText).toHaveBeenCalledTimes(2);
  });

  it("loads and autosaves a note through its interface", async () => {
    vi.useFakeTimers();
    const vfs = makeVfs({ "/home/notes/a.md": "# Alpha\n\nOld" });
    const onPersisted = vi.fn();
    const session = createSession(vfs, { debounceMs: 800, onPersisted });

    await expect(session.open("/home/notes/a.md")).resolves.toBe("opened");
    expect(session.title.value).toBe("Alpha");
    expect(session.body.value).toBe("Old");

    session.setBody("New body");
    await vi.advanceTimersByTimeAsync(799);
    expect(vfs.writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(vfs.writes).toEqual([
      {
        path: "/home/notes/a.md",
        text: "# Alpha\n\nNew body",
        options: { overwrite: true, mimeType: NOTES_MIME_TYPE },
      },
    ]);
    expect(session.status.value).toBe("saved");
    expect(onPersisted).toHaveBeenCalledOnce();
  });

  it("does not rewrite an unedited noncanonical note before a transition", async () => {
    const vfs = makeVfs({
      "/home/notes/a.md": "Body only",
      "/home/notes/b.md": "# Beta\n\nBody",
    });
    const session = createSession(vfs);

    await expect(session.open("/home/notes/a.md")).resolves.toBe("opened");
    await expect(Promise.all([session.flush(), session.flush()])).resolves.toEqual([true, true]);
    await expect(session.open("/home/notes/b.md")).resolves.toBe("opened");

    expect(vfs.writes).toHaveLength(0);
    expect(session.path.value).toBe("/home/notes/b.md");
  });

  it("refreshes clean noncanonical content without writing stale source", async () => {
    const path = "/home/notes/a.md";
    const vfs = makeVfs({ [path]: "Original body only" });
    const session = createSession(vfs);

    await session.open(path);
    vfs.nodes[path] = { text: "External replacement", updatedAt: 11 };

    await expect(session.refresh(path)).resolves.toBe("opened");
    expect(vfs.writes).toHaveLength(0);
    expect(session.body.value).toBe("External replacement");
  });

  it("ignores an external refresh while local edits are dirty", async () => {
    const path = "/home/notes/a.md";
    const vfs = makeVfs({ [path]: "# Alpha\n\nOld" });
    const session = createSession(vfs);

    await session.open(path);
    session.setBody("Local edit");
    vfs.nodes[path] = { text: "# Alpha\n\nExternal edit", updatedAt: 11 };

    await expect(session.refresh(path)).resolves.toBe("ignored");
    expect(vfs.writes).toHaveLength(0);
    expect(session.body.value).toBe("Local edit");
    expect(session.status.value).toBe("unsaved");
  });

  it("cancels a pending open before a caller mutates notes", async () => {
    const vfs = makeVfs({
      "/home/notes/a.md": "# Alpha\n\nA",
      "/home/notes/b.md": "# Beta\n\nB",
    });
    const pending = deferred<string | null>();
    const session = createSession(vfs);

    await session.open("/home/notes/a.md");
    vi.mocked(vfs.readText).mockImplementationOnce(async () => await pending.promise);
    const opening = session.open("/home/notes/b.md");
    await Promise.resolve();

    await expect(session.prepareForMutation()).resolves.toBe(true);
    pending.resolve("# Beta\n\nB");

    await expect(opening).resolves.toBe("failed");
    expect(session.path.value).toBe("/home/notes/a.md");
    expect(session.title.value).toBe("Alpha");
  });

  it("repairs stale disk content after an in-flight edit is reverted", async () => {
    const vfs = makeVfs({ "/home/notes/a.md": "# Alpha\n\nOld" });
    const pending = deferred<VfsStat>();
    vi.mocked(vfs.writeText).mockImplementationOnce(
      async (path: string, text: string, options = {}) => {
        const normalized = normalizeVfsPath(path);
        vfs.writes.push({ path: normalized, text, options });
        const result = await pending.promise;
        vfs.nodes[normalized] = { text, updatedAt: result.updatedAt };
        return result;
      },
    );
    const session = createSession(vfs);

    await session.open("/home/notes/a.md");
    session.setBody("Temporary edit");
    const staleSave = session.flush();
    session.setBody("Old");

    pending.resolve(
      stat("/home/notes/a.md", {
        text: "# Alpha\n\nTemporary edit",
        updatedAt: 11,
      }),
    );
    await expect(staleSave).resolves.toBe(false);
    expect(session.status.value).toBe("unsaved");

    await expect(session.flush()).resolves.toBe(true);
    expect(vfs.writes.at(-1)?.text).toBe("# Alpha\n\nOld");
    expect(vfs.nodes["/home/notes/a.md"]?.text).toBe("# Alpha\n\nOld");
  });

  it("surfaces a rejected write and can retry without sticking in saving", async () => {
    const vfs = makeVfs({ "/home/notes/a.md": "# Alpha\n\nOld" });
    vi.mocked(vfs.writeText).mockRejectedValueOnce(new Error("Disk offline"));
    const session = createSession(vfs);

    await session.open("/home/notes/a.md");
    session.setBody("Still here");

    await expect(session.flush()).resolves.toBe(false);
    expect(session.status.value).toBe("error");
    expect(session.error.value).toContain("Disk offline");
    expect(session.body.value).toBe("Still here");

    await expect(session.flush()).resolves.toBe(true);
    expect(session.status.value).toBe("saved");
    expect(vfs.nodes["/home/notes/a.md"]?.text).toBe("# Alpha\n\nStill here");
  });

  it("flushes the active note before opening another note", async () => {
    const vfs = makeVfs({
      "/home/notes/a.md": "# Alpha\n\nOld",
      "/home/notes/b.md": "# Beta\n\nBody",
    });
    const session = createSession(vfs);

    await session.open("/home/notes/a.md");
    session.setBody("Changed before switch");

    await expect(session.open("/home/notes/b.md")).resolves.toBe("opened");
    expect(vfs.writes[0]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nChanged before switch",
    });
    expect(session.path.value).toBe("/home/notes/b.md");
    expect(session.title.value).toBe("Beta");
  });

  it("starts a final save when disposed with pending edits", async () => {
    const vfs = makeVfs({ "/home/notes/a.md": "# Alpha\n\nOld" });
    const session = createSession(vfs);

    await session.open("/home/notes/a.md");
    session.setBody("Changed before close");
    session.dispose();

    expect(vfs.writes[0]).toMatchObject({
      path: "/home/notes/a.md",
      text: "# Alpha\n\nChanged before close",
    });
  });
});
