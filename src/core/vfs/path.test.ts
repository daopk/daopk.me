import { describe, expect, it } from "vitest";

import { VfsError } from "~/core/vfs/errors";
import {
  basename,
  depthBetween,
  dirname,
  isDescendant,
  isDescendantOrSelf,
  joinVfsPath,
  normalizeVfsPath,
  withinDepth,
} from "~/core/vfs/path";

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

describe("VFS descendant predicates", () => {
  it("isDescendant excludes self and non-descendants", () => {
    expect(isDescendant(normalizeVfsPath("/a"), normalizeVfsPath("/a/b"))).toBe(true);
    expect(isDescendant(normalizeVfsPath("/a"), normalizeVfsPath("/a/b/c"))).toBe(true);
    expect(isDescendant(normalizeVfsPath("/a"), normalizeVfsPath("/a"))).toBe(false);
    expect(isDescendant(normalizeVfsPath("/a"), normalizeVfsPath("/ab"))).toBe(false);
    expect(isDescendant(normalizeVfsPath("/"), normalizeVfsPath("/a"))).toBe(true);
  });

  it("isDescendantOrSelf includes self and treats root as ancestor of all", () => {
    expect(isDescendantOrSelf(normalizeVfsPath("/a"), normalizeVfsPath("/a"))).toBe(true);
    expect(isDescendantOrSelf(normalizeVfsPath("/a"), normalizeVfsPath("/a/b"))).toBe(true);
    expect(isDescendantOrSelf(normalizeVfsPath("/a"), normalizeVfsPath("/ab"))).toBe(false);
    expect(isDescendantOrSelf(normalizeVfsPath("/"), normalizeVfsPath("/anything"))).toBe(true);
  });

  it("depthBetween counts segments below the parent", () => {
    expect(depthBetween(normalizeVfsPath("/a"), normalizeVfsPath("/a"))).toBe(0);
    expect(depthBetween(normalizeVfsPath("/a"), normalizeVfsPath("/a/b"))).toBe(1);
    expect(depthBetween(normalizeVfsPath("/a"), normalizeVfsPath("/a/b/c"))).toBe(2);
    expect(depthBetween(normalizeVfsPath("/"), normalizeVfsPath("/a/b"))).toBe(2);
  });

  it("withinDepth respects an optional maxDepth", () => {
    expect(withinDepth(normalizeVfsPath("/a"), normalizeVfsPath("/a/b/c"))).toBe(true);
    expect(withinDepth(normalizeVfsPath("/a"), normalizeVfsPath("/a/b"), 1)).toBe(true);
    expect(withinDepth(normalizeVfsPath("/a"), normalizeVfsPath("/a/b/c"), 1)).toBe(false);
  });
});
