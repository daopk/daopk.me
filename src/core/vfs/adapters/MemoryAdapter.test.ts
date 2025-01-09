import { describe, expect, it } from "vitest";

import { MemoryAdapter } from "~/core/vfs/adapters/MemoryAdapter";
import { VfsError } from "~/core/vfs/errors";
import { normalizeVfsPath } from "~/core/vfs/path";

const decoder = new TextDecoder();

describe("MemoryAdapter", () => {
  it("reads, writes, stats, and lists deterministic entries", async () => {
    const adapter = new MemoryAdapter({
      now: 1,
      seed: {
        directories: ["/z-dir", "/a-dir"],
        files: {
          "/b.txt": { text: "bee", mimeType: "text/plain", now: 2 },
          "/a.txt": "aye",
        },
      },
    });

    const entries = await adapter.list(normalizeVfsPath("/"));
    expect(entries.map((entry) => entry.name)).toEqual(["a-dir", "z-dir", "a.txt", "b.txt"]);

    const read = await adapter.read(normalizeVfsPath("/b.txt"));
    expect(decoder.decode(read.bytes)).toBe("bee");
    expect(read.stat).toMatchObject({
      path: "/b.txt",
      kind: "file",
      size: 3,
      mimeType: "text/plain",
    });
  });

  it("copies byte arrays on write and read", async () => {
    const adapter = new MemoryAdapter();
    const bytes = new Uint8Array([1, 2, 3]);

    await adapter.write(normalizeVfsPath("/bytes.bin"), bytes, { now: 1 });
    bytes[0] = 9;

    const first = await adapter.read(normalizeVfsPath("/bytes.bin"));
    first.bytes[1] = 8;

    const second = await adapter.read(normalizeVfsPath("/bytes.bin"));
    expect([...second.bytes]).toEqual([1, 2, 3]);
  });

  it("handles mkdir, overwrite, and remove edge cases", async () => {
    const adapter = new MemoryAdapter();

    await adapter.mkdir(normalizeVfsPath("/a/b"), { recursive: true, now: 1 });
    await adapter.write(normalizeVfsPath("/a/b/file.txt"), new Uint8Array([1]), { now: 2 });

    await expect(
      adapter.write(normalizeVfsPath("/a/b/file.txt"), new Uint8Array([2]), {
        overwrite: false,
      }),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });

    await expect(adapter.remove(normalizeVfsPath("/a"))).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await adapter.remove(normalizeVfsPath("/a"), { recursive: true });
    await expect(adapter.stat(normalizeVfsPath("/a"))).rejects.toBeInstanceOf(VfsError);
  });

  it("rejects file and directory operation mismatches", async () => {
    const adapter = new MemoryAdapter({ seed: { files: { "/file.txt": "x" } } });

    await expect(adapter.list(normalizeVfsPath("/file.txt"))).rejects.toMatchObject({
      code: "NOT_DIRECTORY",
    });
    await expect(adapter.read(normalizeVfsPath("/"))).rejects.toMatchObject({
      code: "IS_DIRECTORY",
    });
    await expect(
      adapter.write(normalizeVfsPath("/missing/file.txt"), new Uint8Array()),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
