import type { Component } from "vue";

import { BlogAppIcon, EditorAppIcon, NotesAppIcon, PdfViewerAppIcon } from "~/icons/fluentColor";

import type { FinderOpenSuggestion } from "./openSuggestions";

export function openSuggestionIcon(suggestion: FinderOpenSuggestion): Component {
  switch (suggestion.id) {
    case "blog":
      return BlogAppIcon;
    case "editor":
      return EditorAppIcon;
    case "notes":
      return NotesAppIcon;
    case "pdf-viewer":
      return PdfViewerAppIcon;
  }
}
