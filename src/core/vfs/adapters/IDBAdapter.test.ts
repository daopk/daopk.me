import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "fake-indexeddb/auto";

import { IDBAdapter } from "~/core/vfs/adapters/IDBAdapter";
import { normalizeVfsPath } from "~/core/vfs/path";

const decoder = new TextDecoder();
let counter = 0;

function dbName(): string {
  counter += 1;
  return `vfs-idb-${Date.now()}-${counter}`;
}

describe("IDBAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists directories and files across adapter instances", async () => {
    const name = dbName();
    const first = new IDBAdapter({ dbName: name, baseTimestamp: 1 });

    await first.mkdir(normalizeVfsPath("/notes"), { now: 2 });
    await first.write(normalizeVfsPath("/notes/today.md"), new TextEncoder().encode("hello"), {
      now: 3,
      mimeType: "text/markdown",
    });
    first.dispose();

    const second = new IDBAdapter({ dbName: name, baseTimestamp: 1 });
    const entries = await second.list(normalizeVfsPath("/notes"));
    expect(entries).toEqual([
      expect.objectContaining({
        name: "today.md",
        path: "/notes/today.md",
        size: 5,
        mimeType: "text/markdown",
      }),
    ]);
    await expect(second.read(normalizeVfsPath("/notes/today.md"))).resolves.toMatchObject({
      stat: expect.objectContaining({ createdAt: 3, updatedAt: 3 }),
    });
    expect(decoder.decode((await second.read(normalizeVfsPath("/notes/today.md"))).bytes)).toBe(
      "hello",
    );
    second.dispose();
  });

  it("round-trips binary data without sharing mutable buffers", async () => {
    const adapter = new IDBAdapter({ dbName: dbName() });
    const bytes = new Uint8Array([1, 2, 3]);

    await adapter.write(normalizeVfsPath("/blob.bin"), bytes);
    bytes[0] = 9;

    const first = await adapter.read(normalizeVfsPath("/blob.bin"));
    first.bytes[1] = 8;

    const second = await adapter.read(normalizeVfsPath("/blob.bin"));
    expect([...second.bytes]).toEqual([1, 2, 3]);
    adapter.dispose();
  });

  it("walks a subtree without repeated directory listings", async () => {
    const adapter = new IDBAdapter({ dbName: dbName() });

    await adapter.mkdir(normalizeVfsPath("/notes/deep"), { recursive: true });
    await adapter.write(normalizeVfsPath("/notes/a.md"), new TextEncoder().encode("a"));
    await adapter.write(normalizeVfsPath("/notes/deep/b.md"), new TextEncoder().encode("b"));
    await adapter.write(normalizeVfsPath("/outside.md"), new TextEncoder().encode("outside"));

    await expect(adapter.walk(normalizeVfsPath("/notes"))).resolves.toEqual([
      expect.objectContaining({ path: "/notes/deep", kind: "directory" }),
      expect.objectContaining({ path: "/notes/a.md", kind: "file" }),
      expect.objectContaining({ path: "/notes/deep/b.md", kind: "file" }),
    ]);
    await expect(adapter.walk(normalizeVfsPath("/notes"), { maxDepth: 1 })).resolves.toEqual([
      expect.objectContaining({ path: "/notes/deep", kind: "directory" }),
      expect.objectContaining({ path: "/notes/a.md", kind: "file" }),
    ]);
    await expect(adapter.walk(normalizeVfsPath("/notes"), { maxEntries: 2 })).resolves.toHaveLength(
      2,
    );
    adapter.dispose();
  });

  it("maps missing IndexedDB to a VFS adapter error", async () => {
    vi.stubGlobal("indexedDB", undefined);

    const adapter = new IDBAdapter({ dbName: dbName() });
    await expect(adapter.stat(normalizeVfsPath("/"))).rejects.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
    });
    adapter.dispose();
  });
});
