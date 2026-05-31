<script setup lang="ts">
import { computed, inject, nextTick, onUnmounted, ref, watch } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  IconButton,
  ScrollArea,
  Spinner,
  StatusBanner,
  Textarea,
  TextInput,
} from "~/components/kit";
import { Button, Dialog, DialogActions } from "~/components/ui";
import { useVfs } from "~/composables/useVfs";
import { createMarkdownRenderer } from "~/core/markdown/createMarkdownRenderer";
import type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";
import { FileText, FolderOpen, RefreshCw, Save } from "~/icons/lucide";
import { AppContextInjectionKey } from "~/types/app";

import { useEditor } from "./useEditor";

type PendingDiscardAction = { kind: "open"; path: string } | { kind: "revert" };

const ctx = inject(AppContextInjectionKey, null);
const vfs = useVfs();
const editor = useEditor({ vfs });

const pathInput = ref("");
const textareaRef = ref<{ focus: (options?: FocusOptions) => void } | null>(null);
const discardDialogOpen = ref(false);
const pendingDiscardAction = ref<PendingDiscardAction | null>(null);
const previewHtml = ref("");
const previewLoading = ref(false);
const previewMessage = ref("");

let previewRun = 0;
let disposed = false;
let renderer: MarkdownRenderer | undefined;
let rendererPromise: Promise<MarkdownRenderer> | undefined;

const canPreview = computed(
  () => editor.currentPath.value !== null && editor.editableKind.value === "markdown",
);

const editorClasses = computed(() => ({
  "editor__body--split": editor.previewOpen.value && canPreview.value,
}));

const statusText = computed(() => {
  if (editor.error.value !== null) {
    return editor.error.value;
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

const statusIsError = computed(() => editor.error.value !== null);

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
  renderer?.dispose();
  renderer = undefined;
});

async function openInitialPath(): Promise<void> {
  const initialPath = typeof ctx?.args.path === "string" ? ctx.args.path : "";
  if (initialPath.length === 0) {
    return;
  }

  pathInput.value = initialPath;
  await openNow(initialPath);
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

function requestOpen(): void {
  const nextPath = pathInput.value.trim();
  if (nextPath.length === 0) {
    return;
  }

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

  pathInput.value = editor.currentPath.value ?? path;
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
    <AppToolbar class="editor__toolbar" wrap>
      <form class="editor__path-form" @submit.prevent="requestOpen">
        <label class="editor__path-label" for="editor-path">Path</label>
        <TextInput
          id="editor-path"
          v-model="pathInput"
          class="editor__path-input"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          placeholder="/home/note.md"
          :disabled="editor.loading.value || editor.saving.value"
        />
        <Button
          type="submit"
          size="sm"
          :icon-start="FolderOpen"
          :disabled="editor.loading.value || editor.saving.value"
        >
          Open
        </Button>
      </form>

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

    <StatusBanner class="editor__status" :tone="statusIsError ? 'error' : 'info'">
      {{ statusText }}
    </StatusBanner>

    <main class="editor__body" :class="editorClasses">
      <EmptyState v-if="editor.currentPath.value === null" class="editor__empty">
        No file open.
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

.editor__path-form {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.editor__path-label {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
}

.editor__path-input {
  flex: 1 1 auto;
  min-inline-size: 120px;
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

.editor__status {
  border-block-end: 1px solid var(--color-border);
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  min-block-size: 30px;
  overflow: hidden;
  padding: var(--space-xs) var(--space-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor__status--error {
  color: var(--color-error-soft);
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

  .editor__actions,
  .editor__path-form {
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
