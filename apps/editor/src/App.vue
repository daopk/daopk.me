<script setup lang="ts">
import { AppFrame, Textarea } from "@daopk/kit";
import { VfsFilePickerDialog } from "@daopk/files";

import EditorDiscardDialog from "./components/EditorDiscardDialog.vue";
import EditorEmptyState from "./components/EditorEmptyState.vue";
import EditorPreviewPane from "./components/EditorPreviewPane.vue";
import EditorToolbar from "./components/EditorToolbar.vue";
import { useEditorApp } from "./composables/useEditorApp";

const {
  acceptEditorFile,
  browseDisabled,
  cancelDiscard,
  canPreview,
  confirmDiscard,
  discardDialogOpen,
  editor,
  editorClasses,
  filePickerInitialPath,
  filePickerOpen,
  onFilePickerConfirm,
  onKeydown,
  openFilePicker,
  previewHtml,
  previewLoading,
  previewMessage,
  requestRevert,
  save,
  statusText,
  textareaRef: editorTextareaRef,
  togglePreview,
} = useEditorApp();

function setTextareaRef(value: unknown): void {
  editorTextareaRef.value =
    typeof value === "object" &&
    value !== null &&
    typeof (value as { focus?: unknown }).focus === "function"
      ? (value as { focus: (options?: FocusOptions) => void })
      : null;
}
</script>

<template>
  <AppFrame class="editor" layout="flex-column" aria-label="Editor" @keydown="onKeydown">
    <EditorToolbar
      v-if="editor.currentPath.value !== null"
      :browse-disabled="browseDisabled"
      :can-preview="canPreview"
      :can-save="editor.canSave.value"
      :dirty="editor.dirty.value"
      :loading="editor.loading.value"
      :preview-open="editor.previewOpen.value"
      :saving="editor.saving.value"
      @browse="void openFilePicker()"
      @revert="requestRevert"
      @save="save"
      @toggle-preview="togglePreview"
    />

    <p class="editor__sr-status" role="status" aria-live="polite" aria-atomic="true">
      {{ statusText }}
    </p>

    <main class="editor__body" :class="editorClasses">
      <EditorEmptyState
        v-if="editor.currentPath.value === null"
        :open-disabled="browseDisabled"
        @open="void openFilePicker()"
      />
      <Textarea
        v-else
        :ref="setTextareaRef"
        class="editor__textarea"
        variant="plain"
        resize="none"
        :model-value="editor.draft.value"
        :readonly="editor.readOnly.value || editor.loading.value || editor.saving.value"
        :aria-label="`Editing ${editor.currentPath.value}`"
        spellcheck="false"
        @update:model-value="editor.setDraft"
      />

      <EditorPreviewPane
        v-if="editor.previewOpen.value && canPreview"
        :html="previewHtml"
        :loading="previewLoading"
        :message="previewMessage"
      />
    </main>

    <VfsFilePickerDialog
      v-model:open="filePickerOpen"
      :initial-path="filePickerInitialPath"
      title="Open File"
      confirm-label="Open"
      :accept="acceptEditorFile"
      @confirm="onFilePickerConfirm"
    />

    <EditorDiscardDialog
      v-model:open="discardDialogOpen"
      @cancel="cancelDiscard"
      @confirm="confirmDiscard"
    />
  </AppFrame>
</template>

<style lang="scss" src="./styles/editor.scss"></style>
