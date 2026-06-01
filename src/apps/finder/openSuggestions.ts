import type { Component } from "vue";

import { isSlideDeckPath } from "~/apps/slides/paths";
import { isNotesMarkdownPath } from "~/core/notes/notesPaths";
import { BLOG_POSTS_ROOT, isBlogPostSlug } from "~/core/routing/blogPaths";
import { detectVfsFileType, isEditableVfsTextFile, vfsFileExtension } from "~/core/vfs/fileTypes";
import type { VfsDirEntry } from "~/core/vfs/nodes";
import { basename, dirname, normalizeVfsPath } from "~/core/vfs/path";
import {
  BlogAppIcon,
  EditorAppIcon,
  NotesAppIcon,
  PdfViewerAppIcon,
  SlidesAppIcon,
} from "~/icons/fluentColor";

export type FinderOpenSuggestionId = "blog" | "editor" | "notes" | "pdf-viewer" | "slides";

export interface FinderOpenSuggestion {
  readonly id: FinderOpenSuggestionId;
  readonly label: string;
  readonly manifestId: string;
  readonly icon: Component;
  readonly args: Readonly<Record<string, unknown>>;
}

export function openSuggestionsForEntry(entry: VfsDirEntry): readonly FinderOpenSuggestion[] {
  if (entry.kind !== "file") {
    return [];
  }

  const path = entry.path;

  if (isSlideDeckPath(path)) {
    return [
      {
        id: "slides",
        label: "Open in Slides",
        manifestId: "slides",
        icon: SlidesAppIcon,
        args: { path },
      },
    ];
  }

  if (detectVfsFileType(entry) === "pdf") {
    return [
      {
        id: "pdf-viewer",
        label: "Open in PDF Viewer",
        manifestId: "pdf-viewer",
        icon: PdfViewerAppIcon,
        args: { path },
      },
    ];
  }

  const suggestions: FinderOpenSuggestion[] = [];
  const blogPost = blogPostArgsFromPath(path);
  if (blogPost !== null) {
    suggestions.push({
      id: "blog",
      label: "Open in Blog",
      manifestId: "blog",
      icon: BlogAppIcon,
      args: blogPost,
    });
  } else if (isNotesMarkdownPath(path)) {
    suggestions.push({
      id: "notes",
      label: "Open in Notes",
      manifestId: "notes",
      icon: NotesAppIcon,
      args: { path },
    });
  }

  if (isEditableVfsTextFile(entry)) {
    suggestions.push({
      id: "editor",
      label: "Open in Editor",
      manifestId: "editor",
      icon: EditorAppIcon,
      args: { path },
    });
  }

  return suggestions;
}

function blogPostArgsFromPath(
  path: string,
): { readonly path: string; readonly slug: string } | null {
  const normalized = (() => {
    try {
      return normalizeVfsPath(path);
    } catch {
      return null;
    }
  })();

  if (normalized === null) {
    return null;
  }

  if (dirname(normalized) !== BLOG_POSTS_ROOT || vfsFileExtension(normalized) !== "md") {
    return null;
  }

  const filename = basename(normalized);
  const slug = filename.slice(0, -".md".length);
  if (!isBlogPostSlug(slug)) {
    return null;
  }

  return { path: normalized, slug };
}
