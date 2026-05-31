import { describe, expect, it } from "vitest";

import { compareEntries } from "~/core/vfs/entrySort";
import type { VfsDirEntry } from "~/core/vfs/nodes";
import { normalizeVfsPath } from "~/core/vfs/path";

function entry(name: string, kind: VfsDirEntry["kind"]): VfsDirEntry {
  return {
    name,
    path: normalizeVfsPath(`/${name}`),
    kind,
    size: 0,
    updatedAt: 0,
    readonly: false,
  };
}

describe("compareEntries", () => {
  it("sorts directories before files before symlinks", () => {
    const sorted = [
      entry("file", "file"),
      entry("link", "symlink"),
      entry("dir", "directory"),
    ].sort(compareEntries);

    expect(sorted.map((item) => item.kind)).toEqual(["directory", "file", "symlink"]);
  });

  it("sorts by name within the same kind", () => {
    const sorted = [entry("b", "file"), entry("a", "file"), entry("c", "file")].sort(
      compareEntries,
    );

    expect(sorted.map((item) => item.name)).toEqual(["a", "b", "c"]);
  });
});
