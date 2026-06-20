import { parseAppProtocolIntent, parseYouTubePlayerUrlIntent } from "~/core/routing/appUrlIntents";
import { detectVfsFileType, type VfsRenderableFileType } from "~/core/vfs/fileTypes";

import type { AppPreviewInput, AppPreviewMatch } from "~/types/preview";

/**
 * App-owned, serializable preview match rule declared in `app.manifest.json`.
 *
 * The shell evaluates these **synchronously and without loading the app module**
 * (`PreviewRegistry.resolve` runs on the render-decision path, e.g. inside a
 * `computed` in `PreviewHost`), so the rule has to be data, not app code. The
 * generic kinds below mean a new app that previews a file type or its own
 * `app://` URLs needs no shell change — only a manifest entry — which is the
 * decoupling this replaces the old host-owned matcher keys with.
 */
export type FirstPartyPreviewMatchRule =
  | { readonly kind: "vfs-file-type"; readonly fileType: VfsRenderableFileType }
  | { readonly kind: "app-url" };

const VFS_RENDERABLE_FILE_TYPES = new Set<VfsRenderableFileType>([
  "markdown",
  "text",
  "image",
  "pdf",
  "unsupported",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validate an untrusted catalog `match` value into a known, serializable rule. */
export function coerceFirstPartyPreviewMatchRule(value: unknown): FirstPartyPreviewMatchRule | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === "vfs-file-type") {
    const { fileType } = value;
    return typeof fileType === "string" &&
      VFS_RENDERABLE_FILE_TYPES.has(fileType as VfsRenderableFileType)
      ? { kind: "vfs-file-type", fileType: fileType as VfsRenderableFileType }
      : null;
  }

  if (value.kind === "app-url") {
    return { kind: "app-url" };
  }

  return null;
}

/** Build the sync matcher the preview registry calls for each candidate input. */
export function resolveFirstPartyPreviewMatcher(
  rule: FirstPartyPreviewMatchRule,
  manifestId: string,
): (input: AppPreviewInput) => AppPreviewMatch | null {
  switch (rule.kind) {
    case "vfs-file-type":
      return (input) => matchVfsFileType(input, rule.fileType);
    case "app-url":
      return (input) => matchAppUrl(input, manifestId);
  }
}

function matchVfsFileType(
  input: AppPreviewInput,
  fileType: VfsRenderableFileType,
): AppPreviewMatch | null {
  if (input.kind !== "vfs-file" || input.entry.kind !== "file") {
    return null;
  }

  return detectVfsFileType(input.entry) === fileType ? { args: { path: input.entry.path } } : null;
}

function matchAppUrl(input: AppPreviewInput, manifestId: string): AppPreviewMatch | null {
  if (input.kind !== "url") {
    return null;
  }

  const protocolIntent = parseAppProtocolIntent(input.url);
  if (protocolIntent.kind === "app" && protocolIntent.manifestId === manifestId) {
    return { args: protocolIntent.args ?? {} };
  }

  const publicArgs = publicUrlPreviewArgs(input.url, manifestId);
  return publicArgs === null ? null : { args: publicArgs };
}

/**
 * Public (non-`app://`) URLs that the shell routes to a specific app. Mapping
 * the public URL space to apps is a host responsibility, so this stays
 * shell-side and is keyed by the app's trusted manifest id rather than an
 * opaque matcher key.
 */
function publicUrlPreviewArgs(
  url: string,
  manifestId: string,
): Readonly<Record<string, unknown>> | null {
  if (manifestId === "youtube-player") {
    const intent = parseYouTubePlayerUrlIntent(url);
    if (intent.kind === "app") {
      return intent.args ?? {};
    }
  }

  return null;
}
