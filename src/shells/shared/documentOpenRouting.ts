import { debugWarn } from "~/core/debug";
import { normalizeVfsPath } from "~/core/vfs/path";

/**
 * Minimal shape both shells' surface records satisfy (desktop window records and
 * mobile navigation frames). `documentPathFor` reads only these fields.
 */
export interface DocumentOpenEntry {
  readonly documentPath?: string | null;
  readonly args?: Readonly<Record<string, unknown>>;
}

/**
 * Normalizes a document-open request path through the VFS, logging and
 * swallowing malformed paths. `tag` identifies the calling shell in debug
 * output; `eventName` is the originating kernel event.
 */
export function normalizeDocumentOpenPath(
  tag: string,
  eventName: string,
  path: string,
): string | null {
  try {
    return normalizeVfsPath(path);
  } catch (error) {
    debugWarn(tag, `${eventName} invalid path`, path, error);
    return null;
  }
}

/**
 * Resolves the document a surface is currently showing: the explicit
 * `documentPath` when the app has reported one, otherwise the normalized launch
 * arg. Returns `undefined` when neither is usable.
 */
export function documentPathFor(entry: DocumentOpenEntry): string | null | undefined {
  if (entry.documentPath !== undefined) {
    return entry.documentPath;
  }

  const launchPath = entry.args?.path;
  if (typeof launchPath !== "string") {
    return undefined;
  }

  try {
    return normalizeVfsPath(launchPath);
  } catch {
    return undefined;
  }
}
