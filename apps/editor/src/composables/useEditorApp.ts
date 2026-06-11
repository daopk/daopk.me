import { inject } from "vue";

import { AppContextInjectionKey, useKernel, useVfs } from "@daopk/sdk";

import { useEditor } from "../useEditor";
import { useEditorFilePicker } from "./useEditorFilePicker";
import { useEditorOpenFlow } from "./useEditorOpenFlow";
import { useEditorPreview } from "./useEditorPreview";
import { useEditorStatus } from "./useEditorStatus";

export function useEditorApp() {
  const ctx = inject(AppContextInjectionKey, null);
  const kernel = useKernel();
  const vfs = useVfs();
  const editor = useEditor({ vfs });
  const filePicker = useEditorFilePicker({ editor, kernel, ctx });
  const openFlow = useEditorOpenFlow({
    beforeRequestOpenPath: filePicker.clearPermissionError,
    ctx,
    editor,
    kernel,
  });
  const preview = useEditorPreview(editor);
  const statusText = useEditorStatus({
    editor,
    filePickerPermissionError: filePicker.permissionError,
    filePickerPermissionPending: filePicker.permissionPending,
  });

  function onFilePickerConfirm(path: string): void {
    filePicker.close();
    openFlow.requestOpenPath(path);
  }

  return {
    acceptEditorFile: filePicker.acceptEditorFile,
    browseDisabled: filePicker.browseDisabled,
    cancelDiscard: openFlow.cancelDiscard,
    canPreview: preview.canPreview,
    confirmDiscard: openFlow.confirmDiscard,
    discardDialogOpen: openFlow.discardDialogOpen,
    editor,
    editorClasses: preview.bodyClasses,
    filePickerInitialPath: filePicker.initialPath,
    filePickerOpen: filePicker.open,
    onFilePickerConfirm,
    onKeydown: openFlow.onKeydown,
    openFilePicker: filePicker.openFilePicker,
    previewHtml: preview.previewHtml,
    previewLoading: preview.previewLoading,
    previewMessage: preview.previewMessage,
    requestRevert: openFlow.requestRevert,
    save: openFlow.save,
    statusText,
    textareaRef: openFlow.textareaRef,
    togglePreview: preview.togglePreview,
  };
}
