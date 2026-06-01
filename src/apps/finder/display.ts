import type { Component } from "vue";

import {
  FinderFileIcon,
  FinderFolderIcon,
  FinderImageFileIcon,
  FinderPdfFileIcon,
  FinderTextFileIcon,
  SlidesAppIcon,
} from "~/icons/fluentColor";
import { formatBytes, formatDateTime } from "~/utils/format";
import type { VfsDirEntry } from "~/core/vfs/nodes";
import { isSlideDeckPath } from "~/core/routing/slidePaths";

import { detectPreviewType } from "./useFinderPreview";

export { formatBytes };

export function entryIcon(entry: VfsDirEntry): Component {
  if (entry.kind === "directory") {
    return FinderFolderIcon;
  }
  if (isSlideDeckEntry(entry)) {
    return SlidesAppIcon;
  }

  const previewType = detectPreviewType(entry);
  if (previewType === "markdown" || previewType === "text") {
    return FinderTextFileIcon;
  }
  if (previewType === "image") {
    return FinderImageFileIcon;
  }
  if (previewType === "pdf") {
    return FinderPdfFileIcon;
  }

  return FinderFileIcon;
}

export function entryKindLabel(entry: VfsDirEntry): string {
  if (entry.kind === "directory") {
    return "Folder";
  }
  if (entry.kind === "symlink") {
    return "Link";
  }
  if (isSlideDeckEntry(entry)) {
    return "Slidev Deck";
  }

  const previewType = detectPreviewType(entry);
  if (previewType === "markdown") {
    return "Markdown";
  }
  if (previewType === "pdf") {
    return "PDF";
  }

  return "File";
}

export function formatModified(timestamp: number): string {
  return formatDateTime(timestamp);
}

export function isPdfEntry(entry: VfsDirEntry | null): entry is VfsDirEntry {
  return entry?.kind === "file" && detectPreviewType(entry) === "pdf";
}

export function isSlideDeckEntry(entry: VfsDirEntry | null): entry is VfsDirEntry {
  return entry?.kind === "file" && isSlideDeckPath(entry.path);
}
