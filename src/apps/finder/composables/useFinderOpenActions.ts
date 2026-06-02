import { isEditableVfsTextFile, type Kernel, type VfsDirEntry } from "@daopk/sdk";

import { isSlideDeckPath } from "~/core/routing/slidePaths";

import { openSuggestionsForEntry, type FinderOpenSuggestion } from "../utils/openSuggestions";
import type { FinderBindings } from "./useFinder";

type FinderOpenEvents = Kernel["events"];

export interface FinderOpenActionBindings {
  openEntry(entry: VfsDirEntry): void;
  openSelectedEntry(): void;
  openWithSuggestion(entry: VfsDirEntry, suggestion: FinderOpenSuggestion): void;
}

export interface UseFinderOpenActionsOptions {
  readonly events: FinderOpenEvents;
  readonly finder: Pick<FinderBindings, "openDirectory" | "selectedEntry">;
}

export function useFinderOpenActions({
  events,
  finder,
}: UseFinderOpenActionsOptions): FinderOpenActionBindings {
  function openInEditor(entry: VfsDirEntry): void {
    if (entry.kind !== "file" || !isEditableVfsTextFile(entry)) {
      return;
    }

    events.emit("editor.open.requested", {
      source: "api",
      path: entry.path,
    });
  }

  function openWithSuggestion(entry: VfsDirEntry, suggestion: FinderOpenSuggestion): void {
    const currentSuggestion = openSuggestionsForEntry(entry).find(
      (item) => item.id === suggestion.id,
    );
    if (currentSuggestion === undefined) {
      return;
    }

    openResolvedSuggestion(entry, currentSuggestion);
  }

  function openResolvedSuggestion(entry: VfsDirEntry, suggestion: FinderOpenSuggestion): void {
    if (suggestion.id === "editor") {
      openInEditor(entry);
      return;
    }
    if (suggestion.id === "pdf-viewer") {
      openPdf(entry);
      return;
    }
    if (suggestion.id === "slides") {
      openSlides(entry);
      return;
    }
    if (suggestion.id === "blog") {
      openBlog(suggestion);
      return;
    }

    events.emit("app.launch.requested", {
      manifestId: suggestion.manifestId,
      source: "api",
      args: suggestion.args,
    });

    if (suggestion.id === "notes" && typeof suggestion.args.path === "string") {
      events.emit("notes.open.requested", {
        source: "api",
        path: suggestion.args.path,
      });
    }
  }

  function openFirstSuggestedApp(entry: VfsDirEntry): void {
    const suggestion = openSuggestionsForEntry(entry)[0];
    if (suggestion === undefined) {
      return;
    }

    openResolvedSuggestion(entry, suggestion);
  }

  function openSelectedEntry(): void {
    const entry = finder.selectedEntry.value;
    if (entry !== null) {
      openEntry(entry);
    }
  }

  function openEntry(entry: VfsDirEntry): void {
    if (entry.kind === "directory") {
      void finder.openDirectory(entry.path);
      return;
    }

    openFirstSuggestedApp(entry);
  }

  function openPdf(entry: VfsDirEntry): void {
    events.emit("pdf-viewer.open.requested", {
      source: "api",
      path: entry.path,
    });
  }

  function openBlog(suggestion: FinderOpenSuggestion): void {
    if (typeof suggestion.args.path !== "string" || typeof suggestion.args.slug !== "string") {
      return;
    }

    events.emit("blog.post.open.requested", {
      source: "api",
      path: suggestion.args.path,
      slug: suggestion.args.slug,
    });
  }

  function openSlides(entry: VfsDirEntry): void {
    if (entry.kind !== "file" || !isSlideDeckPath(entry.path)) {
      return;
    }

    events.emit("app.launch.requested", {
      manifestId: "slides",
      source: "api",
      args: { path: entry.path },
    });
    events.emit("slides.open.requested", {
      source: "api",
      path: entry.path,
    });
  }

  return {
    openEntry,
    openSelectedEntry,
    openWithSuggestion,
  };
}
