import { describe, expect, it, vi } from "vitest";

import { basename, dirname, normalizeVfsPath } from "~/core/vfs/path";
import type { VfsDirEntry, VfsStat } from "~/core/vfs/nodes";

import { useFinder, type FinderTrashClient, type FinderVfsClient } from "./useFinder";

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
    size: kind === "file" ? 12 : 0,
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

interface FakeVfs extends FinderVfsClient {
  readonly nodes: Map<string, VfsDirEntry>;
  readonly bytes: Map<string, Uint8Array>;
  stat: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function makeVfs(listings: Record<string, readonly VfsDirEntry[] | null>): FakeVfs {
  const mutableListings = new Map<string, VfsDirEntry[] | null>();
  const nodes = new Map<string, VfsDirEntry>();
  const bytes = new Map<string, Uint8Array>();
  let timestamp = 1;

  for (const [path, items] of Object.entries(listings)) {
    const normalized = normalizeVfsPath(path);
    mutableListings.set(normalized, items === null ? null : [...items]);
    if (items !== null) {
      nodes.set(normalized, entry(normalized, "directory"));
      for (const item of items) {
        nodes.set(item.path, item);
        if (item.kind === "file") {
          bytes.set(item.path, new Uint8Array([1, 2, 3]));
        }
      }
    }
  }

  function upsertListingItem(parent: string, item: VfsDirEntry): void {
    const listing = mutableListings.get(parent);
    if (listing === null) {
      return;
    }

    const nextListing = listing ?? [];
    const existingIndex = nextListing.findIndex((candidate) => candidate.path === item.path);
    if (existingIndex < 0) {
      mutableListings.set(parent, [...nextListing, item]);
      return;
    }

    mutableListings.set(
      parent,
      nextListing.map((candidate) => (candidate.path === item.path ? item : candidate)),
    );
  }

  return {
    nodes,
    bytes,
    stat: vi.fn(async (path: string) => {
      const normalized = normalizeVfsPath(path);
      if (mutableListings.get(normalized) === null) {
        return null;
      }

      const item = nodes.get(normalized);
      return item === undefined ? null : statFromEntry(item);
    }),
    list: vi.fn(async (path: string) => {
      const normalized = normalizeVfsPath(path);
      return mutableListings.has(normalized) ? mutableListings.get(normalized)! : [];
    }),
    read: vi.fn(async (path: string) => bytes.get(normalizeVfsPath(path)) ?? null),
    write: vi.fn(
      async (
        path: string,
        data: Uint8Array,
        options: { overwrite?: boolean; mimeType?: string } = {},
      ) => {
        const normalized = normalizeVfsPath(path);
        if (nodes.has(normalized) && options.overwrite === false) {
          return null;
        }

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
    mkdir: vi.fn(async (path: string) => {
      const normalized = normalizeVfsPath(path);
      if (nodes.has(normalized)) {
        return null;
      }

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
        (mutableListings.get(dirname(normalized)) ?? [])?.filter(
          (candidate) => candidate.path !== normalized,
        ) ?? [],
      );
      return true;
    }),
  };
}

function makeTrash(vfs: FakeVfs): FinderTrashClient & {
  moveToTrash: ReturnType<typeof vi.fn>;
} {
  return {
    moveToTrash: vi.fn(async (path: string) => {
      const normalized = normalizeVfsPath(path);
      const item = vfs.nodes.get(normalized);
      if (item === undefined || !(await vfs.remove(normalized, { recursive: true }))) {
        return null;
      }

      return {
        id: `trash-${basename(normalized)}`,
        name: basename(normalized),
        originalPath: normalized,
        deletedAt: 1,
        kind: item.kind === "directory" ? "directory" : "file",
        size: item.size,
        ...(item.mimeType === undefined ? {} : { mimeType: item.mimeType }),
      };
    }),
  };
}

describe("useFinder", () => {
  it("loads a directory and selects the first entry", async () => {
    const vfs = makeVfs({
      "/": [entry("/home", "directory"), entry("/readme.md")],
    });
    const finder = useFinder({ vfs });

    await expect(finder.refresh()).resolves.toBe(true);

    expect(vfs.list).toHaveBeenCalledWith("/");
    expect(finder.cwd.value).toBe("/");
    expect(finder.entries.value).toHaveLength(2);
    expect(finder.selectedPath.value).toBe("/home");
    expect(finder.breadcrumbs.value).toEqual([{ label: "/", path: "/" }]);
    expect(finder.currentDirectory.value?.path).toBe("/");
    expect(finder.currentDirectoryReadonly.value).toBe(false);
  });

  it("tracks current directory read-only state", async () => {
    const vfs = makeVfs({
      "/portfolio": [entry("/portfolio/about.md")],
    });
    vfs.nodes.set("/portfolio", entry("/portfolio", "directory", { readonly: true }));
    const finder = useFinder({ vfs, initialPath: "/portfolio" });

    await finder.refresh();

    expect(finder.currentDirectory.value?.path).toBe("/portfolio");
    expect(finder.currentDirectoryReadonly.value).toBe(true);
  });

  it("represents an empty directory without a selected entry", async () => {
    const finder = useFinder({ vfs: makeVfs({ "/": [] }) });

    await finder.refresh();

    expect(finder.entries.value).toEqual([]);
    expect(finder.selectedPath.value).toBeNull();
    expect(finder.selectedEntry.value).toBeNull();
  });

  it("remembers selection per directory while navigating", async () => {
    const finder = useFinder({
      vfs: makeVfs({
        "/": [entry("/home", "directory"), entry("/tmp", "directory")],
        "/home": [entry("/home/a.md"), entry("/home/b.md")],
      }),
    });

    await finder.refresh();
    await finder.openDirectory("/home");
    finder.select("/home/b.md");
    await finder.goUp();
    await finder.openDirectory("/home");

    expect(finder.cwd.value).toBe("/home");
    expect(finder.selectedPath.value).toBe("/home/b.md");
  });

  it("moves selection with clamped indexes", async () => {
    const finder = useFinder({
      vfs: makeVfs({
        "/": [entry("/a.txt"), entry("/b.txt"), entry("/c.txt")],
      }),
    });

    await finder.refresh();
    finder.moveSelection(1);
    finder.moveSelection(99);

    expect(finder.selectedPath.value).toBe("/c.txt");

    finder.moveSelection(-99);

    expect(finder.selectedPath.value).toBe("/a.txt");
  });

  it("surfaces permission denial without throwing", async () => {
    const finder = useFinder({
      vfs: makeVfs({
        "/": null,
      }),
    });

    await expect(finder.refresh()).resolves.toBe(false);

    expect(finder.entries.value).toEqual([]);
    expect(finder.error.value).toMatch(/permission/i);
  });

  it("preserves the current directory when navigation fails", async () => {
    const finder = useFinder({
      vfs: makeVfs({
        "/": [entry("/home", "directory"), entry("/tmp", "directory")],
        "/home": null,
      }),
    });

    await finder.refresh();
    await expect(finder.openDirectory("/home")).resolves.toBe(false);

    expect(finder.cwd.value).toBe("/");
    expect(finder.entries.value.map((item) => item.path)).toEqual(["/home", "/tmp"]);
    expect(finder.selectedPath.value).toBe("/home");
    expect(finder.error.value).toMatch(/permission/i);
  });

  it("ignores invalid initial paths and falls back to root", () => {
    const finder = useFinder({ vfs: makeVfs({}), initialPath: "relative" });

    expect(finder.cwd.value).toBe("/");
  });

  it("selects an initial reveal entry after the first refresh", async () => {
    const finder = useFinder({
      vfs: makeVfs({
        "/portfolio/posts": [entry("/portfolio/posts/a.md"), entry("/portfolio/posts/field-notes.md")],
      }),
      initialPath: "/portfolio/posts",
      initialReveal: "/portfolio/posts/field-notes.md",
    });

    await finder.refresh();

    expect(finder.selectedPath.value).toBe("/portfolio/posts/field-notes.md");
  });

  it("reveal() navigates to a directory and selects the requested child", async () => {
    const finder = useFinder({
      vfs: makeVfs({
        "/": [entry("/portfolio", "directory")],
        "/portfolio/posts": [entry("/portfolio/posts/a.md"), entry("/portfolio/posts/field-notes.md")],
      }),
    });

    await finder.refresh();
    await finder.reveal("/portfolio/posts", "/portfolio/posts/field-notes.md");

    expect(finder.cwd.value).toBe("/portfolio/posts");
    expect(finder.selectedPath.value).toBe("/portfolio/posts/field-notes.md");
  });

  it("creates collision-safe folders and selects the created folder", async () => {
    const vfs = makeVfs({
      "/": [entry("/Untitled Folder", "directory")],
    });
    const finder = useFinder({ vfs });

    await finder.refresh();
    await expect(finder.createFolder()).resolves.toBe(true);

    expect(vfs.mkdir).toHaveBeenCalledWith("/Untitled Folder 2", { recursive: false });
    expect(finder.entries.value.map((item) => item.path)).toContain("/Untitled Folder 2");
    expect(finder.selectedPath.value).toBe("/Untitled Folder 2");
  });

  it("duplicates files with bytes and MIME type preserved", async () => {
    const vfs = makeVfs({
      "/": [
        entry("/note.txt", "file", { mimeType: "text/plain;charset=utf-8" }),
        entry("/note copy.txt"),
      ],
    });
    vfs.bytes.set("/note.txt", new Uint8Array([9, 8, 7]));
    const finder = useFinder({ vfs });

    await finder.refresh();
    await expect(finder.duplicateFile("/note.txt")).resolves.toBe(true);

    expect(vfs.write).toHaveBeenCalledWith("/note copy 2.txt", new Uint8Array([9, 8, 7]), {
      overwrite: false,
      mimeType: "text/plain;charset=utf-8",
    });
    expect(finder.selectedPath.value).toBe("/note copy 2.txt");
  });

  it("rejects folder duplicate in v1 without mutating", async () => {
    const vfs = makeVfs({
      "/": [entry("/docs", "directory")],
    });
    const finder = useFinder({ vfs });

    await finder.refresh();
    await expect(finder.duplicateFile("/docs")).resolves.toBe(false);

    expect(vfs.read).not.toHaveBeenCalled();
    expect(vfs.write).not.toHaveBeenCalled();
    expect(finder.error.value).toBe("Finder can only duplicate files right now.");
  });

  it("deletes the selected entry and selects the next entry", async () => {
    const vfs = makeVfs({
      "/": [entry("/a.txt"), entry("/b.txt"), entry("/c.txt")],
    });
    const trash = makeTrash(vfs);
    const finder = useFinder({ vfs, trash });

    await finder.refresh();
    await expect(finder.deleteEntry("/a.txt")).resolves.toBe(true);

    expect(trash.moveToTrash).toHaveBeenCalledWith("/a.txt");
    expect(finder.entries.value.map((item) => item.path)).toEqual(["/b.txt", "/c.txt"]);
    expect(finder.selectedPath.value).toBe("/b.txt");
  });

  it("surfaces mutation failures while preserving state", async () => {
    const vfs = makeVfs({
      "/": [entry("/a.txt"), entry("/b.txt")],
    });
    const trash = makeTrash(vfs);
    vi.mocked(trash.moveToTrash).mockResolvedValueOnce(null);
    const finder = useFinder({ vfs, trash });

    await finder.refresh();
    await expect(finder.deleteEntry("/a.txt")).resolves.toBe(false);

    expect(finder.error.value).toBe("Finder does not have permission to move this item to Trash.");
    expect(finder.entries.value.map((item) => item.path)).toEqual(["/a.txt", "/b.txt"]);
    expect(finder.selectedPath.value).toBe("/a.txt");
  });
});
