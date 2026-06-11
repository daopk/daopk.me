import { dirname, isEditableVfsTextFile, normalizeVfsPath, type VfsDirEntry } from "@daopk/sdk";

export function editorPickerInitialPath(currentPath: string | null): string {
  if (currentPath !== null) {
    return dirname(normalizeVfsPath(currentPath));
  }

  return "/home";
}

export function isEditorPickerFileAccepted(entry: VfsDirEntry): boolean {
  return entry.kind === "file" && isEditableVfsTextFile(entry);
}
