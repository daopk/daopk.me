<script setup lang="ts">
import { computed, inject, nextTick, onUnmounted, ref, watch } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  IconButton,
  ScrollArea,
  Spinner,
  Textarea,
} from "@daopk/kit";
import { Button, Dialog, DialogActions } from "@daopk/ui";
import { createMarkdownRenderer, type MarkdownRenderer } from "@daopk/markdown";
import { FileText, FolderOpen, RefreshCw, Save } from "@daopk/icons";
import { VfsFilePickerDialog } from "@daopk/files";
import {
  AppContextInjectionKey,
  dirname,
  isEditableVfsTextFile,
  normalizeVfsPath,
  useKernel,
  useVfs,
  type VfsDirEntry,
} from "@daopk/sdk";

import { useEditor } from "./useEditor";

type PendingDiscardAction = { kind: "open"; path: string } | { kind: "revert" };

const ctx = inject(AppContextInjectionKey, null);
const kernel = useKernel();
const vfs = useVfs();
const editor = useEditor({ vfs });

const textareaRef = ref<{ focus: (options?: FocusOptions) => void } | null>(null);
const discardDialogOpen = ref(false);
const pendingDiscardAction = ref<PendingDiscardAction | null>(null);
const filePickerOpen = ref(false);
const filePickerInitialPath = ref("/home");
const filePickerPermissionPending = ref(false);
const filePickerPermissionError = ref<string | null>(null);
const previewHtml = ref("");
const previewLoading = ref(false);
const previewMessage = ref("");

let previewRun = 0;
let disposed = false;
let renderer: MarkdownRenderer | undefined;
let rendererPromise: Promise<MarkdownRenderer> | undefined;
const stopOpenRequests = kernel.events.on("editor.window.open.requested", (payload) => {
  if (payload.handleId !== ctx?.handleId) {
    return;
  }

  requestOpenPath(payload.path);
});

const canPreview = computed(
  () => editor.currentPath.value !== null && editor.editableKind.value === "markdown",
);

const editorClasses = computed(() => ({
  "editor__body--split": editor.previewOpen.value && canPreview.value,
}));
const initialPath = typeof ctx?.args.path === "string" ? ctx.args.path : "";

const statusText = computed(() => {
  if (editor.error.value !== null) {
    return editor.error.value;
  }
  if (filePickerPermissionError.value !== null) {
    return filePickerPermissionError.value;
  }
  if (filePickerPermissionPending.value) {
    return "Waiting for file access permission...";
  }
  if (editor.status.value === "loading") {
    return "Opening...";
  }
  if (editor.status.value === "saving") {
    return "Saving...";
  }
  if (editor.currentPath.value === null) {
    return "No file open.";
  }
  if (editor.readOnly.value) {
    return "Read only.";
  }
  if (editor.missing.value) {
    return editor.dirty.value ? "New file with unsaved changes." : "New file.";
  }
  if (editor.dirty.value) {
    return "Unsaved changes.";
  }
  if (editor.status.value === "saved") {
    return "Saved.";
  }

  return "Ready.";
});

void openInitialPath();

watch(
  () => [editor.previewOpen.value, editor.draft.value, editor.editableKind.value] as const,
  () => {
    void renderPreview();
  },
  { immediate: true },
);

onUnmounted(() => {
  disposed = true;
  previewRun += 1;
  stopOpenRequests();
  renderer?.dispose();
  renderer = undefined;
});

watch(
  editor.currentPath,
  (path) => {
    emitDocumentPath(path);
  },
  { immediate: initialPath.length === 0 },
);

async function openInitialPath(): Promise<void> {
  if (initialPath.length === 0) {
    return;
  }

  await openNow(initialPath);
  if (editor.currentPath.value === null) {
    emitDocumentPath(null);
  }
}

function emitDocumentPath(path: string | null): void {
  if (ctx === null) {
    return;
  }

  kernel.events.emit("app.document.changed", {
    manifestId: ctx.manifestId,
    handleId: ctx.handleId,
    path,
  });
}

async function getRenderer(): Promise<MarkdownRenderer> {
  if (renderer !== undefined) {
    return renderer;
  }

  rendererPromise ??= createMarkdownRenderer();
  const next = await rendererPromise;
  if (disposed) {
    next.dispose();
    throw new Error("Editor preview renderer resolved after dispose.");
  }

  renderer = next;
  return next;
}

async function renderPreview(): Promise<void> {
  const run = ++previewRun;
  previewHtml.value = "";
  previewMessage.value = "";

  if (!editor.previewOpen.value) {
    previewLoading.value = false;
    return;
  }
  if (!canPreview.value) {
    previewLoading.value = false;
    previewMessage.value = "Preview is available for Markdown files.";
    return;
  }

  previewLoading.value = true;
  try {
    const activeRenderer = await getRenderer();
    const result = await activeRenderer.render(editor.draft.value);
    if (run !== previewRun || disposed) {
      return;
    }

    previewHtml.value = result.html;
  } catch (error) {
    if (run === previewRun && !disposed) {
      previewMessage.value = error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (run === previewRun && !disposed) {
      previewLoading.value = false;
    }
  }
}

async function openFilePicker(): Promise<void> {
  if (filePickerPermissionPending.value) {
    return;
  }

  filePickerPermissionError.value = null;
  if (ctx === null) {
    filePickerPermissionError.value = "Editor cannot request file access right now.";
    return;
  }

  filePickerPermissionPending.value = true;
  try {
    const decision = await kernel.permissions.request(ctx.manifestId, "vfs.read", {
      source: "app",
    });
    if (!decision.granted) {
      filePickerPermissionError.value = "Editor needs file access before browsing.";
      return;
    }
    if (!decision.persisted && decision.reason !== "system-auto-grant") {
      filePickerPermissionError.value = "Choose Allow and remember to browse files.";
      return;
    }
  } catch {
    filePickerPermissionError.value = "Editor could not request file access.";
    return;
  } finally {
    filePickerPermissionPending.value = false;
  }

  filePickerInitialPath.value = initialPickerPath();
  filePickerOpen.value = true;
}

function initialPickerPath(): string {
  if (editor.currentPath.value !== null) {
    return dirname(normalizeVfsPath(editor.currentPath.value));
  }

  return "/home";
}

function acceptEditorFile(entry: VfsDirEntry): boolean {
  return entry.kind === "file" && isEditableVfsTextFile(entry);
}

function onFilePickerConfirm(path: string): void {
  filePickerOpen.value = false;
  requestOpenPath(path);
}

function requestOpenPath(path: string): void {
  const nextPath = path.trim();
  if (nextPath.length === 0) {
    return;
  }

  filePickerPermissionError.value = null;
  if (editor.dirty.value) {
    pendingDiscardAction.value = { kind: "open", path: nextPath };
    discardDialogOpen.value = true;
    return;
  }

  void openNow(nextPath);
}

async function openNow(path: string): Promise<void> {
  const opened = await editor.openPath(path);
  if (!opened) {
    return;
  }

  await nextTick();
  textareaRef.value?.focus({ preventScroll: true });
}

function requestRevert(): void {
  if (!editor.dirty.value) {
    editor.revert();
    return;
  }

  pendingDiscardAction.value = { kind: "revert" };
  discardDialogOpen.value = true;
}

function confirmDiscard(): void {
  const action = pendingDiscardAction.value;
  pendingDiscardAction.value = null;
  discardDialogOpen.value = false;

  if (action?.kind === "open") {
    void openNow(action.path);
    return;
  }
  if (action?.kind === "revert") {
    editor.revert();
  }
}

function cancelDiscard(): void {
  pendingDiscardAction.value = null;
  discardDialogOpen.value = false;
}

function save(): void {
  void editor.save();
}

function togglePreview(): void {
  editor.setPreviewOpen(!editor.previewOpen.value);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key.toLowerCase() === "s" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    if (editor.canSave.value) {
      void editor.save();
    }
  }
}
</script>

<template>
  <AppFrame class="editor" layout="flex-column" aria-label="Editor" @keydown="onKeydown">
    <AppToolbar v-if="editor.currentPath.value !== null" class="editor__toolbar" wrap>
      <IconButton
        class="editor__browse-button"
        size="sm"
        label="Browse files"
        :icon="FolderOpen"
        :disabled="editor.loading.value || editor.saving.value || filePickerPermissionPending"
        @click="void openFilePicker()"
      />

      <template #end>
        <div class="editor__actions">
          <Button
            size="sm"
            variant="primary"
            :icon-start="Save"
            :disabled="!editor.canSave.value"
            :loading="editor.saving.value"
            @click="save"
          >
            Save
          </Button>
          <Button
            size="sm"
            :icon-start="RefreshCw"
            :disabled="!editor.dirty.value || editor.loading.value || editor.saving.value"
            @click="requestRevert"
          >
            Revert
          </Button>
          <IconButton
            size="sm"
            label="Toggle Markdown preview"
            :icon="FileText"
            :active="editor.previewOpen.value && canPreview"
            :disabled="!canPreview"
            :pressed="editor.previewOpen.value && canPreview"
            @click="togglePreview"
          />
        </div>
      </template>
    </AppToolbar>

    <p class="editor__sr-status" role="status" aria-live="polite" aria-atomic="true">
      {{ statusText }}
    </p>

    <main class="editor__body" :class="editorClasses">
      <EmptyState
        v-if="editor.currentPath.value === null"
        class="editor__empty"
        title="No file open."
      >
        <Button
          variant="primary"
          :icon-start="FolderOpen"
          :disabled="filePickerPermissionPending"
          @click="void openFilePicker()"
        >
          Open
        </Button>
      </EmptyState>
      <Textarea
        v-else
        ref="textareaRef"
        class="editor__textarea"
        variant="plain"
        resize="none"
        :model-value="editor.draft.value"
        :readonly="editor.readOnly.value || editor.loading.value || editor.saving.value"
        :aria-label="`Editing ${editor.currentPath.value}`"
        spellcheck="false"
        @update:model-value="editor.setDraft"
      />

      <ScrollArea v-if="editor.previewOpen.value && canPreview" as="aside" class="editor__preview">
        <div v-if="previewLoading" class="editor__preview-message">
          <Spinner size="sm" />
          <span>Rendering preview...</span>
        </div>
        <div v-else-if="previewMessage" class="editor__preview-message">{{ previewMessage }}</div>
        <div v-else class="editor__preview-content" v-html="previewHtml" />
      </ScrollArea>
    </main>

    <VfsFilePickerDialog
      v-model:open="filePickerOpen"
      :initial-path="filePickerInitialPath"
      title="Open File"
      confirm-label="Open"
      :accept="acceptEditorFile"
      @confirm="onFilePickerConfirm"
    />

    <Dialog
      v-model:open="discardDialogOpen"
      title="Discard changes?"
      description="Unsaved changes in the current file will be lost."
      @close="cancelDiscard"
    >
      <DialogActions>
        <Button size="sm" @click="cancelDiscard">Cancel</Button>
        <Button size="sm" variant="danger" @click="confirmDiscard">Discard</Button>
      </DialogActions>
    </Dialog>
  </AppFrame>
</template>

<style scoped lang="scss">
.editor {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-size: var(--font-size-sm);
  inline-size: 100%;
  min-block-size: 0;
}

.editor__toolbar {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
  min-block-size: 46px;
  padding: var(--space-xs) var(--space-sm);
}

.editor__browse-button {
  flex: 0 0 auto;
}

.editor__textarea:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.editor__actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
}

.editor__sr-status {
  block-size: 1px;
  clip: rect(0 0 0 0);
  inline-size: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
}

.editor__body {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr);
  min-block-size: 0;
}

.editor__body--split {
  grid-template-columns: minmax(0, 1fr) minmax(260px, 38%);
}

.editor__empty {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  justify-content: center;
  min-block-size: 0;
  padding: var(--space-lg);
}

.editor__textarea {
  background: var(--color-bg);
  border: 0;
  color: var(--color-fg);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  inline-size: 100%;
  line-height: 1.55;
  min-block-size: 0;
  padding: var(--space-md);
  resize: none;
}

.editor__textarea[readonly] {
  color: var(--color-fg-muted);
}

.editor__preview {
  border-inline-start: 1px solid var(--color-border);
  padding: var(--space-md);
}

.editor__preview-message {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  gap: var(--space-xs);
}

.editor__preview-content {
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.editor__preview-content :deep(h1) {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 var(--space-sm);
}

.editor__preview-content :deep(h2),
.editor__preview-content :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: var(--space-md) 0 var(--space-xs);
}

.editor__preview-content :deep(p),
.editor__preview-content :deep(ul),
.editor__preview-content :deep(ol),
.editor__preview-content :deep(pre) {
  margin: 0 0 var(--space-sm);
}

.editor__preview-content :deep(pre) {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  padding: var(--space-sm);
}

.editor__preview-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

@media (max-width: 640px) {
  .editor__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .editor__actions {
    inline-size: 100%;
  }

  .editor__actions {
    justify-content: flex-end;
  }

  .editor__body--split {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(220px, 1fr) minmax(180px, 42%);
  }

  .editor__preview {
    border-block-start: 1px solid var(--color-border);
    border-inline-start: 0;
  }
}
</style>
