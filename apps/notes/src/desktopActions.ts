import {
  NOTES_ROOT,
  normalizeVfsPath,
  type DesktopContextMenuActionContext,
  type VfsDirEntry,
  type VfsPath,
} from "@daopk/sdk";

import { NOTES_MIME_TYPE, noteSource } from "./useNotes";
import { usePinnedDesktopNotes } from "./usePinnedDesktopNotes";

const UNTITLED_TITLE = "Untitled note";

export async function createDesktopNote({
  kernel,
  handle,
  position,
}: DesktopContextMenuActionContext): Promise<void> {
  const access = { handleId: handle.id };
  const root = await kernel.vfs.mkdir(NOTES_ROOT, { ...access, recursive: true });
  if (root === null) {
    return;
  }

  const path = await nextNotePath(kernel, handle.id);
  const stat = await kernel.vfs.writeText(path, noteSource(UNTITLED_TITLE, ""), {
    ...access,
    overwrite: false,
    mimeType: NOTES_MIME_TYPE,
  });
  if (stat === null) {
    return;
  }

  usePinnedDesktopNotes().pin(stat.path, {
    x: position.x,
    y: position.y,
  });
}

async function nextNotePath(
  kernel: DesktopContextMenuActionContext["kernel"],
  handleId: string,
): Promise<VfsPath> {
  const stamp = formatTimestamp(new Date());
  const base = `${NOTES_ROOT}/note-${stamp}`;
  const existing = await existingNotePaths(kernel, handleId);
  let candidate = normalizeVfsPath(`${base}.md`);
  let suffix = 2;

  while (existing.has(candidate)) {
    candidate = normalizeVfsPath(`${base}-${suffix}.md`);
    suffix += 1;
  }

  return candidate;
}

async function existingNotePaths(
  kernel: DesktopContextMenuActionContext["kernel"],
  handleId: string,
): Promise<ReadonlySet<VfsPath>> {
  const entries = await kernel.vfs.list(NOTES_ROOT, { handleId });
  if (entries === null) {
    return new Set();
  }

  return new Set(entries.map((entry: VfsDirEntry) => normalizeVfsPath(entry.path)));
}

function formatTimestamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];
  const [year, month, day, hour, minute, second] = parts.map((part, index) =>
    index === 0 ? String(part) : String(part).padStart(2, "0"),
  );

  return `${year}${month}${day}-${hour}${minute}${second}`;
}
