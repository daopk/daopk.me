import { debugWarn } from "~/core/debug";
import { isBlogPostSlug } from "~/core/routing/blogPaths";
import { normalizeVfsPath } from "~/core/vfs/path";

export type ShellOpenRequest =
  | { readonly manifestId: "editor"; readonly path: string }
  | { readonly manifestId: "blog"; readonly path: string; readonly slug: string }
  | { readonly manifestId: "pdf-viewer"; readonly path: string };

export interface ShellOpenRequestEntry {
  readonly manifestId: string;
  readonly documentPath?: string | null;
  readonly args?: Readonly<Record<string, unknown>>;
}

export type ShellOpenRequestAction<T extends ShellOpenRequestEntry> =
  | {
      readonly type: "focus";
      readonly target: T;
      readonly manifestId: ShellOpenRequest["manifestId"];
      readonly path: string;
    }
  | {
      readonly type: "reuse-editor";
      readonly target: T;
      readonly path: string;
    }
  | {
      readonly type: "spawn";
      readonly manifestId: ShellOpenRequest["manifestId"];
      readonly args: Readonly<Record<string, unknown>>;
    };

export interface ShellOpenRequestAdapter<T extends ShellOpenRequestEntry> {
  findPreferred(manifestId: string, predicate: (entry: T) => boolean): T | null;
  apply(action: ShellOpenRequestAction<T>): void | Promise<void>;
}

function normalizeRequestPath(eventName: string, path: string): string | null {
  try {
    return normalizeVfsPath(path);
  } catch (error) {
    debugWarn("[shell-open-requests]", `${eventName} invalid path`, path, error);
    return null;
  }
}

function documentPathFor(entry: ShellOpenRequestEntry): string | null | undefined {
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

function eventNameFor(request: ShellOpenRequest): string {
  switch (request.manifestId) {
    case "editor":
      return "editor.open.requested";
    case "blog":
      return "blog.post.open.requested";
    case "pdf-viewer":
      return "pdf-viewer.open.requested";
  }
}

function spawnArgsFor(
  request: ShellOpenRequest,
  normalizedPath: string,
): Readonly<Record<string, unknown>> {
  return request.manifestId === "blog"
    ? { path: normalizedPath, slug: request.slug }
    : { path: normalizedPath };
}

/**
 * Owns document-open policy for every shell. The adapter supplies only the
 * shell-specific preference order and effects; normalization, validation,
 * matching, Editor reuse, and spawn arguments stay behind this interface.
 */
export async function handleShellOpenRequest<T extends ShellOpenRequestEntry>(
  request: ShellOpenRequest,
  adapter: ShellOpenRequestAdapter<T>,
): Promise<void> {
  const eventName = eventNameFor(request);
  const normalizedPath = normalizeRequestPath(eventName, request.path);
  if (normalizedPath === null) {
    return;
  }

  if (request.manifestId === "blog" && !isBlogPostSlug(request.slug)) {
    debugWarn("[shell-open-requests]", `${eventName} invalid slug`, request.slug);
    return;
  }

  const matchingEntry = adapter.findPreferred(
    request.manifestId,
    (entry) => documentPathFor(entry) === normalizedPath,
  );
  if (matchingEntry !== null) {
    await adapter.apply({
      type: "focus",
      target: matchingEntry,
      manifestId: request.manifestId,
      path: normalizedPath,
    });
    return;
  }

  if (request.manifestId === "editor") {
    const emptyEditor = adapter.findPreferred("editor", (entry) => entry.documentPath === null);
    if (emptyEditor !== null) {
      await adapter.apply({
        type: "reuse-editor",
        target: emptyEditor,
        path: normalizedPath,
      });
      return;
    }
  }

  await adapter.apply({
    type: "spawn",
    manifestId: request.manifestId,
    args: spawnArgsFor(request, normalizedPath),
  });
}
