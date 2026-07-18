import { computed, ref } from "vue";

import type { AppContext, Kernel, VfsDirEntry } from "@daopk/sdk";

import type { EditorBindings } from "../useEditor";
import { editorPickerInitialPath, isEditorPickerFileAccepted } from "../utils/files";

export interface UseEditorFilePickerOptions {
  readonly editor: EditorBindings;
  readonly kernel: Kernel;
  readonly ctx: AppContext | null;
}

export function useEditorFilePicker({ editor, kernel, ctx }: UseEditorFilePickerOptions) {
  const open = ref(false);
  const initialPath = ref("/home");
  const permissionPending = ref(false);
  const permissionError = ref<string | null>(null);

  const browseDisabled = computed(
    () => editor.loading.value || editor.saving.value || permissionPending.value,
  );

  async function openFilePicker(): Promise<void> {
    if (permissionPending.value) {
      return;
    }

    permissionError.value = null;
    if (ctx === null) {
      permissionError.value = "Editor cannot request file access right now.";
      return;
    }

    permissionPending.value = true;
    try {
      const decision = await kernel.permissions.request(ctx.manifestId, "vfs.read", {
        source: "app",
      });
      if (!decision.granted) {
        permissionError.value = "Editor needs file access before browsing.";
        return;
      }
      if (
        !decision.persisted &&
        decision.reason !== "system-auto-grant" &&
        decision.reason !== "first-party-default-grant"
      ) {
        permissionError.value = "Choose Allow and remember to browse files.";
        return;
      }
    } catch {
      permissionError.value = "Editor could not request file access.";
      return;
    } finally {
      permissionPending.value = false;
    }

    initialPath.value = editorPickerInitialPath(editor.currentPath.value);
    open.value = true;
  }

  function acceptEditorFile(entry: VfsDirEntry): boolean {
    return isEditorPickerFileAccepted(entry);
  }

  function close(): void {
    open.value = false;
  }

  function clearPermissionError(): void {
    permissionError.value = null;
  }

  return {
    acceptEditorFile,
    browseDisabled,
    clearPermissionError,
    close,
    initialPath,
    open,
    openFilePicker,
    permissionError,
    permissionPending,
  };
}
