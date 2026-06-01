import { describe, expect, it } from "vitest";

import { FinderFolderIcon } from "~/icons/fluentColor";
import { Cloud } from "~/icons/lucide";
import type { VfsDirEntry } from "~/core/vfs/nodes";
import { normalizeVfsPath } from "~/core/vfs/path";

import { entryIcon, isCloudDriveEntry } from "./display";

function directory(path: string): VfsDirEntry {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path: normalizeVfsPath(path),
    kind: "directory",
    size: 0,
    updatedAt: 0,
    readonly: path === "/cloud",
  };
}

describe("finder display", () => {
  it("uses a cloud icon only for the cloud drive mount", () => {
    const cloud = directory("/cloud");
    const home = directory("/home");

    expect(isCloudDriveEntry(cloud)).toBe(true);
    expect(entryIcon(cloud)).toBe(Cloud);
    expect(isCloudDriveEntry(home)).toBe(false);
    expect(entryIcon(home)).toBe(FinderFolderIcon);
  });
});
