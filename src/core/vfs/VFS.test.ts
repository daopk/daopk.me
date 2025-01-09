import { describe, expect, it } from "vitest";

import { MemoryAdapter } from "~/core/vfs/adapters/MemoryAdapter";
import { VfsError } from "~/core/vfs/errors";
import { createMemoryVfsBootstrap, VFS } from "~/core/vfs/VFS";

describe("VFS", () => {
  it("bootstraps a deterministic root tree", async () => {
    const vfs = createMemoryVfsBootstrap();

    await expect(vfs.list("/")).resolves.toEqual([
      expect.objectContaining({ path: "/home", kind: "directory" }),
      expect.objectContaining({ path: "/tmp", kind: "directory" }),
    ]);
  });

  it("resolves longest mount prefixes without crossing path boundaries", async () => {
    const vfs = new VFS();
    vfs.mount(
      "/",
      new MemoryAdapter({
        id: "root",
        seed: {
          directories: ["/portfolio", "/portfolio-old"],
          files: { "/portfolio-old/root.txt": "root" },
        },
      }),
      { id: "root" },
    );
    vfs.mount(
      "/portfolio",
      new MemoryAdapter({
        id: "portfolio",
        seed: { files: { "/mounted.txt": "mounted" } },
      }),
      { id: "portfolio" },
    );

    await expect(vfs.readText("/portfolio/mounted.txt")).resolves.toBe("mounted");
    await expect(vfs.readText("/portfolio-old/root.txt")).resolves.toBe("root");

    const entries = await vfs.list("/portfolio");
    expect(entries).toEqual([
      expect.objectContaining({ name: "mounted.txt", path: "/portfolio/mounted.txt" }),
    ]);
  });

  it("lists child mount points even when the parent adapter did not seed them", async () => {
    const vfs = new VFS();
    vfs.mount("/", new MemoryAdapter({ id: "root" }), { id: "root" });
    vfs.mount("/mnt", new MemoryAdapter({ id: "mnt" }), { id: "mnt" });

    await expect(vfs.list("/")).resolves.toEqual([
      expect.objectContaining({ name: "mnt", path: "/mnt", kind: "directory" }),
    ]);
  });

  it("walks descendants with global paths and child mount shadowing", async () => {
    const vfs = new VFS();
    vfs.mount(
      "/",
      new MemoryAdapter({
        id: "root",
        seed: {
          directories: ["/portfolio"],
          files: {
            "/portfolio/root-shadow.md": "shadowed",
            "/readme.md": "root",
          },
        },
      }),
      { id: "root" },
    );
    vfs.mount(
      "/portfolio",
      new MemoryAdapter({
        id: "portfolio",
        seed: {
          directories: ["/posts"],
          files: { "/posts/field-notes.md": "mounted" },
        },
      }),
      { id: "portfolio" },
    );

    await expect(vfs.walk("/")).resolves.toEqual([
      expect.objectContaining({ path: "/portfolio", kind: "directory" }),
      expect.objectContaining({ path: "/portfolio/posts", kind: "directory" }),
      expect.objectContaining({ path: "/portfolio/posts/field-notes.md", kind: "file" }),
      expect.objectContaining({ path: "/readme.md", kind: "file" }),
    ]);
    expect((await vfs.walk("/")).some((entry) => entry.path === "/portfolio/root-shadow.md")).toBe(
      false,
    );
  });

  it("rejects duplicate mount paths and missing mounts", async () => {
    const vfs = new VFS();
    vfs.mount("/", new MemoryAdapter({ id: "root" }), { id: "root" });

    let thrown: unknown;
    try {
      vfs.mount("/", new MemoryAdapter({ id: "again" }), { id: "again" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(VfsError);
    expect(thrown).toMatchObject({ code: "CONFLICT" });

    const empty = new VFS();
    await expect(empty.list("/nowhere")).rejects.toMatchObject({ code: "MOUNT_NOT_FOUND" });
  });
});
