import type { EditorStatus } from "../useEditor";

export interface EditorStatusTextInput {
  readonly currentPath: string | null;
  readonly dirty: boolean;
  readonly editorError: string | null;
  readonly filePickerPermissionError: string | null;
  readonly filePickerPermissionPending: boolean;
  readonly missing: boolean;
  readonly readOnly: boolean;
  readonly status: EditorStatus;
}

export function editorStatusText({
  currentPath,
  dirty,
  editorError,
  filePickerPermissionError,
  filePickerPermissionPending,
  missing,
  readOnly,
  status,
}: EditorStatusTextInput): string {
  if (editorError !== null) {
    return editorError;
  }
  if (filePickerPermissionError !== null) {
    return filePickerPermissionError;
  }
  if (filePickerPermissionPending) {
    return "Waiting for file access permission...";
  }
  if (status === "loading") {
    return "Opening...";
  }
  if (status === "saving") {
    return "Saving...";
  }
  if (currentPath === null) {
    return "No file open.";
  }
  if (readOnly) {
    return "Read only.";
  }
  if (missing) {
    return dirty ? "New file with unsaved changes." : "New file.";
  }
  if (dirty) {
    return "Unsaved changes.";
  }
  if (status === "saved") {
    return "Saved.";
  }

  return "Ready.";
}
