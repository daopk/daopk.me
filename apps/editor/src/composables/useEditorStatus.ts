import { computed, type Ref } from "vue";

import type { EditorBindings } from "../useEditor";
import { editorStatusText } from "../utils/status";

export interface UseEditorStatusOptions {
  readonly editor: EditorBindings;
  readonly filePickerPermissionError: Ref<string | null>;
  readonly filePickerPermissionPending: Ref<boolean>;
}

export function useEditorStatus({
  editor,
  filePickerPermissionError,
  filePickerPermissionPending,
}: UseEditorStatusOptions) {
  return computed(() =>
    editorStatusText({
      currentPath: editor.currentPath.value,
      dirty: editor.dirty.value,
      editorError: editor.error.value,
      filePickerPermissionError: filePickerPermissionError.value,
      filePickerPermissionPending: filePickerPermissionPending.value,
      missing: editor.missing.value,
      readOnly: editor.readOnly.value,
      status: editor.status.value,
    }),
  );
}
