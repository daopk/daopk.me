import type { VfsDirEntry } from "~/core/vfs/nodes";

export type VfsRenderableFileType = "markdown" | "text" | "image" | "pdf" | "unsupported";

export interface VfsFileTypeInput {
  readonly name: string;
  readonly mimeType?: string;
}

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const TEXT_EXTENSIONS = new Set(["css", "js", "json", "log", "scss", "ts", "tsx", "txt", "vue"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const RASTER_IMAGE_MIME_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function detectVfsFileType(input: VfsFileTypeInput): VfsRenderableFileType {
  const mimeType = normalizedVfsMimeType(input);
  const extension = vfsFileExtension(input.name);

  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") {
    return "markdown";
  }
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return "markdown";
  }
  if (mimeType === "application/pdf" || PDF_EXTENSIONS.has(extension)) {
    return "pdf";
  }
  if (mimeType !== undefined && RASTER_IMAGE_MIME_TYPES.has(mimeType)) {
    return "image";
  }
  if (mimeType?.startsWith("text/") === true) {
    return "text";
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  return "unsupported";
}

export function isEditableVfsTextFile(input: VfsFileTypeInput): boolean {
  const kind = detectVfsFileType(input);
  return kind === "markdown" || kind === "text";
}

export function vfsFileTypeInputFromPath(path: string, mimeType?: string): VfsFileTypeInput {
  return {
    name: path.split("/").filter(Boolean).at(-1) ?? path,
    ...(mimeType === undefined ? {} : { mimeType }),
  };
}

export function defaultTextMimeTypeForPath(path: string, fallback?: string): string {
  if (fallback !== undefined && fallback.trim().length > 0) {
    return fallback;
  }

  return detectVfsFileType(vfsFileTypeInputFromPath(path)) === "markdown"
    ? "text/markdown"
    : "text/plain;charset=utf-8";
}

export function normalizedVfsMimeType(input: Pick<VfsDirEntry, "mimeType">): string | undefined {
  return input.mimeType?.split(";")[0]?.trim().toLowerCase() || undefined;
}

export function vfsFileExtension(name: string): string {
  const leaf = name.split("/").filter(Boolean).at(-1) ?? name;
  const index = leaf.lastIndexOf(".");
  return index < 0 ? "" : leaf.slice(index + 1).toLowerCase();
}
