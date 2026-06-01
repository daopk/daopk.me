import { vfsFileExtension } from "~/core/vfs/fileTypes";
import { dirname, normalizeVfsPath, type VfsPath } from "~/core/vfs/path";

/**
 * The Notes folder convention. The shell owns the VFS layout (where first-party
 * apps store their data), so this lives in core and is shared by the host
 * (Finder's "Open in Notes" suggestion) and the Notes app itself (via the
 * `@daopk/sdk` re-export). Keeping a single source of truth means the app and
 * the shell can never disagree on where notes live.
 */
export const NOTES_ROOT = "/home/notes";

/** True for a markdown file that lives directly in {@link NOTES_ROOT}. */
export function isNotesMarkdownPath(path: string): boolean {
  let normalized: VfsPath;
  try {
    normalized = normalizeVfsPath(path);
  } catch {
    return false;
  }

  const extension = vfsFileExtension(normalized);
  return dirname(normalized) === NOTES_ROOT && (extension === "md" || extension === "markdown");
}
