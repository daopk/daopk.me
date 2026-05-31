import type { VfsDirEntry, VfsNodeKind } from "~/core/vfs/nodes";
import { compareVfsNames } from "~/core/vfs/path";

const KIND_RANK: Record<VfsNodeKind, number> = {
  directory: 0,
  file: 1,
  symlink: 2,
};

export function compareEntries(a: VfsDirEntry, b: VfsDirEntry): number {
  const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (rank !== 0) {
    return rank;
  }

  return compareVfsNames(a.name, b.name);
}
