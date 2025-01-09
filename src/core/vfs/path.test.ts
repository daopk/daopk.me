import { describe, expect, it } from "vitest";

import { VfsError } from "~/core/vfs/errors";
import { basename, dirname, joinVfsPath, normalizeVfsPath } from "~/core/vfs/path";

describe("VFS path helpers", () => {
  it("normalizes absolute paths deterministically", () => {
    expect(normalizeVfsPath("/a//b/../c/")).toBe("/a/c");
    expect(normalizeVfsPath("/./a/../../x")).toBe("/x");
    expect(normalizeVfsPath("/")).toBe("/");
  });

  it("rejects relative, empty, and control-character paths", () => {
    for (const path of ["", "notes/today.md", "/bad\0path"]) {
      expect(() => normalizeVfsPath(path)).toThrow(VfsError);
      try {
        normalizeVfsPath(path);
      } catch (error) {
        expect(error).toMatchObject({ code: "INVALID_PATH" });
      }
    }
  });

  it("joins and splits normalized paths", () => {
    const path = joinVfsPath("/notes", "./daily", "../today.md");

    expect(path).toBe("/notes/today.md");
    expect(dirname(path)).toBe("/notes");
    expect(basename(path)).toBe("today.md");
    expect(dirname(normalizeVfsPath("/"))).toBe("/");
    expect(basename(normalizeVfsPath("/"))).toBe("");
  });
});
