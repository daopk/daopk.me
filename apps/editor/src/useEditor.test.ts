import { describe, expect, it, vi } from "vitest";

import { dirname, normalizeVfsPath, VfsError, type VfsStat } from "@daopk/sdk";

import { useEditor, type EditorVfsClient } from "./useEditor";

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

function makeVfs(seed: Record<string, FakeNode>): EditorVfsClient & {
  stat: ReturnType<typeof vi.fn>;
  readText: ReturnType<typeof vi.fn>;
  writeText: ReturnType<typeof vi.fn>;
  nodes: Record<string, FakeNode>;
} {
  const nodes = { ...seed };

  return {
    nodes,
    stat: vi.fn(async (path: string) => {
      const node = nodes[path];
      if (node === undefined) {
        throw new VfsError("NOT_FOUND", `Path not found: ${path}`, { path });
      }
      return stat(path, node);
    }),
    readText: vi.fn(async (path: string) => nodes[path]?.text ?? ""),
    writeText: vi.fn(async (path: string, text: string, options = {}) => {
      const normalized = normalizeVfsPath(path);
      if (options.overwrite === false && nodes[normalized] !== undefined) {
        throw new VfsError("ALREADY_EXISTS", `Path already exists: ${path}`, { path });
      }

      const parentPath = dirname(normalized);
      if (nodes[parentPath]?.kind !== "directory") {
        throw new VfsError("NOT_FOUND", `Parent missing: ${parentPath}`, { path });
      }

      nodes[normalized] = {
        kind: "file",
        text,
        mimeType: options.mimeType,
      };
      return stat(normalized, nodes[normalized]);
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useEditor", () => {
  it("opens an existing text file", async () => {
    const vfs = makeVfs({
      "/home": { kind: "directory" },
      "/home/note.md": { kind: "file", text: "# Hello", mimeType: "text/markdown" },
    });
    const editor = useEditor({ vfs });

    await expect(editor.openPath("/home/note.md")).resolves.toBe(true);

    expect(editor.currentPath.value).toBe("/home/note.md");
    expect(editor.draft.value).toBe("# Hello");
    expect(editor.dirty.value).toBe(false);
    expect(editor.editableKind.value).toBe("markdown");
  });

  it("opens a missing text-like path and creates it on save", async () => {
    const vfs = makeVfs({
      "/home": { kind: "directory" },
    });
    const editor = useEditor({ vfs });

    await expect(editor.openPath("/home/new.md")).resolves.toBe(true);
    expect(editor.missing.value).toBe(true);
    expect(editor.canSave.value).toBe(true);

    editor.setDraft("# New");
    await expect(editor.save()).resolves.toBe(true);

    expect(vfs.writeText).toHaveBeenCalledWith("/home/new.md", "# New", {
      overwrite: false,
      mimeType: "text/markdown",
    });
    expect(editor.missing.value).toBe(false);
    expect(editor.savedText.value).toBe("# New");
  });

  it("saves an existing file with overwrite enabled", async () => {
    const vfs = makeVfs({
      "/home": { kind: "directory" },
      "/home/log.txt": { kind: "file", text: "old", mimeType: "text/plain" },
    });
    const editor = useEditor({ vfs });

    await editor.openPath("/home/log.txt");
    editor.setDraft("new");
    await expect(editor.save()).resolves.toBe(true);

    expect(vfs.writeText).toHaveBeenCalledWith("/home/log.txt", "new", {
      overwrite: true,
      mimeType: "text/plain",
    });
  });

  it("keeps read-only files unsaveable", async () => {
    const editor = useEditor({
      vfs: makeVfs({
        "/portfolio": { kind: "directory" },
        "/portfolio/about.md": {
          kind: "file",
          text: "# About",
          readonly: true,
          mimeType: "text/markdown",
        },
      }),
    });

    await editor.openPath("/portfolio/about.md");
    editor.setDraft("# Edited");

    expect(editor.readOnly.value).toBe(true);
    expect(editor.canSave.value).toBe(false);
    await expect(editor.save()).resolves.toBe(false);
    expect(editor.error.value).toMatch(/read-only/i);
  });

  it("surfaces permission denial from the VFS facade", async () => {
    const editor = useEditor({
      vfs: {
        stat: vi.fn(async () => null),
        readText: vi.fn(async () => null),
        writeText: vi.fn(async () => null),
      },
    });

    await expect(editor.openPath("/home/private.md")).resolves.toBe(false);

    expect(editor.error.value).toMatch(/permission/i);
    expect(editor.currentPath.value).toBeNull();
  });

  it("rejects unsupported file types", async () => {
    const editor = useEditor({
      vfs: makeVfs({
        "/home": { kind: "directory" },
        "/home/photo.png": { kind: "file", text: "png", mimeType: "image/png" },
      }),
    });

    await expect(editor.openPath("/home/photo.png")).resolves.toBe(false);

    expect(editor.error.value).toMatch(/cannot edit/i);
  });

  it("keeps newer opens when an older read resolves late", async () => {
    const slow = deferred<string | null>();
    const vfs = makeVfs({
      "/home": { kind: "directory" },
      "/home/slow.txt": { kind: "file", text: "slow", mimeType: "text/plain" },
      "/home/fast.txt": { kind: "file", text: "fast", mimeType: "text/plain" },
    });
    vfs.readText.mockImplementation(async (path: string) =>
      path === "/home/slow.txt" ? slow.promise : "fast",
    );
    const editor = useEditor({ vfs });

    const slowOpen = editor.openPath("/home/slow.txt");
    await editor.openPath("/home/fast.txt");
    slow.resolve("slow");
    await slowOpen;

    expect(editor.currentPath.value).toBe("/home/fast.txt");
    expect(editor.draft.value).toBe("fast");
  });

  it("reverts the draft to the last saved text", async () => {
    const editor = useEditor({
      vfs: makeVfs({
        "/home": { kind: "directory" },
        "/home/note.txt": { kind: "file", text: "saved", mimeType: "text/plain" },
      }),
    });

    await editor.openPath("/home/note.txt");
    editor.setDraft("changed");
    editor.revert();

    expect(editor.draft.value).toBe("saved");
    expect(editor.dirty.value).toBe(false);
  });
});
