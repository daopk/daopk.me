<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";

import {
  Button,
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  Dialog,
} from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { useVfs } from "~/composables/useVfs";
import { FileText, Plus } from "~/icons/lucide";
import { formatDateTime } from "~/utils/format";
import { AppChromeInjectionKey, AppContextInjectionKey } from "~/types/app";

import {
  isNotesMarkdownPath,
  NOTES_ROOT,
  useNotes,
  type NoteListItem,
  type NotesStatus,
} from "./useNotes";

const COMPACT_BREAKPOINT = 620;

const kernel = useKernel();
const appContext = inject(AppContextInjectionKey, null);
const appChrome = inject(AppChromeInjectionKey, null);
const vfs = useVfs();
const notes = useNotes({
  vfs: {
    ...vfs,
    moveToTrash: (path) =>
      appContext === null
        ? Promise.resolve(null)
        : kernel.trash.moveToTrash(path, { handleId: appContext.handleId }),
  },
});
const rootRef = ref<HTMLElement | null>(null);
const isCompact = ref(false);
const mobileEditorOpen = ref(false);
const deleteDialogOpen = ref(false);
const pendingDeleteNote = ref<NoteListItem | null>(null);
const deletingNote = ref(false);
let closeFlush: Promise<boolean> | undefined;

const initialNotePath = notePathFromArgs(appContext?.args);

const stopWillKill = kernel.events.on("app.will-kill", (payload) => {
  if (payload.handleId !== appContext?.handleId) {
    return;
  }

  closeFlush ??= notes.flushAutosave();
  payload.waitUntil(closeFlush);
});

const stopOpenRequests = kernel.events.on("notes.open.requested", (payload) => {
  if (!isNotesMarkdownPath(payload.path)) {
    return;
  }

  void selectNoteForView(payload.path, { openEditor: true });
});

const statusText = computed(() => {
  if (notes.error.value !== null) {
    return notes.error.value;
  }

  return labelForStatus(notes.status.value);
});

const newButtonLoading = computed(
  () =>
    notes.creating.value || (notes.status.value === "saving" && notes.selectedPath.value === null),
);

const newButtonDisabled = computed(
  () => notes.creating.value || notes.status.value === "loading" || notes.status.value === "saving",
);

const noteMutationDisabled = computed(
  () => notes.creating.value || notes.status.value === "loading" || notes.status.value === "saving",
);

const deleteDescription = computed(() => {
  const note = pendingDeleteNote.value;
  if (note === null) {
    return "The note can be restored from Trash.";
  }

  return `Move "${note.title}" to Trash?`;
});

const showList = computed(() => !isCompact.value || !mobileEditorOpen.value);
const showEditor = computed(() => !isCompact.value || mobileEditorOpen.value);

useResizeObserver(rootRef, ([entry]) => {
  if (entry) {
    isCompact.value = entry.contentRect.width <= COMPACT_BREAKPOINT;
  }
});

onMounted(() => {
  void loadInitialNotes();
});

onUnmounted(() => {
  stopWillKill();
  stopOpenRequests();
  appChrome?.setTitle(null);
  appChrome?.setBackAction(null);
  notes.dispose({ flush: closeFlush === undefined });
});

watch(
  () => [isCompact.value, mobileEditorOpen.value, notes.title.value] as const,
  ([compact, editorOpen, title]) => {
    if (compact && editorOpen) {
      appChrome?.setTitle(title || "Notes");
      appChrome?.setBackAction({
        ariaLabel: "Back to Notes",
        handler: closeMobileEditor,
      });
      return;
    }

    appChrome?.setTitle(null);
    appChrome?.setBackAction(null);
  },
  { immediate: true },
);

watch(
  () => notes.hasSelection.value,
  (hasSelection) => {
    if (!hasSelection) {
      mobileEditorOpen.value = false;
    }
  },
);

function notePathFromArgs(args: Readonly<Record<string, unknown>> | undefined): string | null {
  return typeof args?.path === "string" && isNotesMarkdownPath(args.path) ? args.path : null;
}

async function loadInitialNotes(): Promise<void> {
  const loaded = await notes.loadNotes();
  if (loaded && initialNotePath !== null) {
    await selectNoteForView(initialNotePath, { openEditor: true });
  }
}

async function createNote(): Promise<void> {
  const created = await notes.createNote();
  if (created) {
    openMobileEditor();
  }
}

function selectNote(path: string): void {
  void selectNoteForView(path, { openEditor: true });
}

async function selectNoteForView(
  path: string,
  { openEditor }: { openEditor: boolean },
): Promise<void> {
  if (path === notes.selectedPath.value) {
    if (openEditor) {
      openMobileEditor();
    }
    return;
  }

  const selected = await notes.selectNote(path);
  if (selected && openEditor) {
    openMobileEditor();
  }
}

function onNoteContextMenu(note: NoteListItem): void {
  void selectNoteForView(note.path, { openEditor: false });
}

async function duplicateNote(note: NoteListItem): Promise<void> {
  const duplicated = await notes.duplicateNote(note.path);
  if (duplicated) {
    openMobileEditor();
  }
}

function revealNoteInFinder(note: NoteListItem): void {
  kernel.events.emit("app.launch.requested", {
    manifestId: "finder",
    source: "menu",
    args: { path: NOTES_ROOT, reveal: note.path },
  });
}

function requestDeleteNote(note: NoteListItem): void {
  pendingDeleteNote.value = note;
  deleteDialogOpen.value = true;
}

function cancelDeleteNote(): void {
  if (deletingNote.value) {
    return;
  }

  deleteDialogOpen.value = false;
  pendingDeleteNote.value = null;
}

async function confirmDeleteNote(): Promise<void> {
  if (pendingDeleteNote.value === null || deletingNote.value) {
    return;
  }

  const note = pendingDeleteNote.value;
  deletingNote.value = true;
  try {
    await notes.deleteNote(note.path);
  } finally {
    deletingNote.value = false;
    deleteDialogOpen.value = false;
    pendingDeleteNote.value = null;
  }
}

function openMobileEditor(): void {
  if (isCompact.value && notes.hasSelection.value) {
    mobileEditorOpen.value = true;
  }
}

function closeMobileEditor(): void {
  mobileEditorOpen.value = false;
}

function onTitleInput(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLInputElement) {
    notes.setTitle(target.value);
  }
}

function onDraftInput(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement) {
    notes.setDraft(target.value);
  }
}

function formatModified(timestamp: number): string {
  return formatDateTime(timestamp, "");
}

function labelForStatus(status: NotesStatus): string {
  switch (status) {
    case "idle":
      return "Ready";
    case "loading":
      return "Loading...";
    case "empty":
      return "No notes yet.";
    case "unsaved":
      return "Unsaved";
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return "Error";
  }
}
</script>

<template>
  <section
    ref="rootRef"
    class="notes"
    :class="{
      'notes--compact': isCompact,
      'notes--mobile-editor-open': isCompact && mobileEditorOpen,
    }"
    aria-label="Notes"
  >
    <aside v-if="showList" class="notes__sidebar" aria-label="Note list">
      <header class="notes__sidebar-header">
        <h2 class="notes__title">Notes</h2>
        <Button
          size="sm"
          variant="primary"
          :icon-start="Plus"
          :loading="newButtonLoading"
          :disabled="newButtonDisabled"
          @click="createNote"
        >
          New
        </Button>
      </header>

      <div v-if="notes.notes.value.length === 0" class="notes__list-empty" role="status">
        {{ statusText }}
      </div>
      <ul v-else class="notes__list" aria-label="Notes">
        <li v-for="note in notes.notes.value" :key="note.path" class="notes__list-item">
          <ContextMenu :modal="false">
            <template #trigger>
              <button
                type="button"
                class="notes__note-button"
                :class="{ 'notes__note-button--active': note.path === notes.selectedPath.value }"
                :aria-current="note.path === notes.selectedPath.value ? 'page' : undefined"
                @click="selectNote(note.path)"
                @contextmenu="onNoteContextMenu(note)"
              >
                <span class="notes__note-title">{{ note.title }}</span>
                <span class="notes__note-meta">{{ formatModified(note.updatedAt) }}</span>
              </button>
            </template>
            <template #items>
              <ContextMenuItem @select="selectNote(note.path)">Open</ContextMenuItem>
              <ContextMenuItem :disabled="noteMutationDisabled" @select="duplicateNote(note)">
                Duplicate
              </ContextMenuItem>
              <ContextMenuItem @select="revealNoteInFinder(note)">Reveal in Finder</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem :disabled="noteMutationDisabled" @select="requestDeleteNote(note)">
                Delete...
              </ContextMenuItem>
            </template>
          </ContextMenu>
        </li>
      </ul>
    </aside>

    <main v-if="showEditor" class="notes__editor" aria-label="Selected note">
      <div v-if="!notes.hasSelection.value" class="notes__editor-empty">
        <FileText class="notes__empty-icon" aria-hidden="true" />
        <span>{{ statusText }}</span>
      </div>
      <template v-else>
        <header class="notes__editor-header">
          <input
            class="notes__title-input"
            type="text"
            :value="notes.title.value"
            aria-label="Note title"
            autocomplete="off"
            spellcheck="true"
            @input="onTitleInput"
          />
          <div
            class="notes__status"
            :class="{ 'notes__status--error': notes.error.value !== null }"
            role="status"
          >
            {{ statusText }}
          </div>
        </header>
        <textarea
          class="notes__textarea"
          :value="notes.draft.value"
          aria-label="Note body"
          spellcheck="true"
          @input="onDraftInput"
        />
      </template>
    </main>

    <Dialog
      v-model:open="deleteDialogOpen"
      title="Move note to Trash?"
      :description="deleteDescription"
      @close="cancelDeleteNote"
    >
      <div class="notes__dialog-actions">
        <Button size="sm" :disabled="deletingNote" @click="cancelDeleteNote">Cancel</Button>
        <Button size="sm" variant="primary" :loading="deletingNote" @click="confirmDeleteNote">
          Move to Trash
        </Button>
      </div>
    </Dialog>
  </section>
</template>

<style scoped lang="scss">
.notes {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: grid;
  font-size: 13px;
  grid-template-columns: minmax(220px, 28%) minmax(0, 1fr);
  inline-size: 100%;
  min-block-size: 0;
  padding-block-end: var(--mobile-shell-app-bottom-padding, 0px);
  padding-inline-end: var(--mobile-shell-app-safe-area-right, 0px);
  padding-inline-start: var(--mobile-shell-app-safe-area-left, 0px);
}

.notes--compact {
  background: var(--color-bg-subtle);
  font-size: 15px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden;
}

.notes--compact.notes--mobile-editor-open {
  background: var(--color-bg);
}

.notes__sidebar {
  background: var(--color-bg-subtle);
  border-inline-end: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.notes--compact .notes__sidebar {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-accent) 8%, transparent),
      transparent 180px
    ),
    var(--color-bg-subtle);
  border: 0;
}

.notes__sidebar-header {
  align-items: center;
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
  justify-content: space-between;
  min-block-size: 48px;
  padding: var(--space-sm);
}

.notes--compact .notes__sidebar-header {
  border-block-end: 0;
  min-block-size: 64px;
  padding: var(--space-md);
}

.notes__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.notes--compact .notes__title {
  font-size: 28px;
  font-weight: 700;
}

.notes__list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  list-style: none;
  margin: 0;
  min-block-size: 0;
  overflow: auto;
  padding: var(--space-xs);
}

.notes--compact .notes__list {
  gap: var(--space-sm);
  padding: 0 var(--space-md) var(--space-lg);
}

.notes__list-item {
  min-inline-size: 0;
}

.notes__note-button {
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: 2px;
  inline-size: 100%;
  min-block-size: 52px;
  padding: var(--space-sm);
  text-align: start;
}

.notes--compact .notes__note-button {
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: var(--radius-md);
  gap: 5px;
  min-block-size: 68px;
  padding: var(--space-sm) var(--space-md);
}

.notes__note-button:hover,
.notes__note-button--active {
  background: var(--color-bg-elevated);
}

.notes--compact .notes__note-button:hover,
.notes--compact .notes__note-button--active {
  background: var(--color-bg-elevated);
  border-color: color-mix(in srgb, var(--color-accent) 34%, var(--color-border));
}

.notes__note-button:focus-visible,
.notes__title-input:focus-visible,
.notes__textarea:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.notes__note-title {
  font-weight: 600;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notes--compact .notes__note-title {
  font-size: 16px;
  line-height: 1.25;
}

.notes__note-meta {
  color: var(--color-fg-muted);
  font-size: 12px;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notes--compact .notes__note-meta {
  font-size: 13px;
}

.notes__list-empty,
.notes__editor-empty {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  justify-content: center;
  padding: var(--space-lg);
  text-align: center;
}

.notes__list-empty {
  flex: 1 1 auto;
}

.notes__editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-block-size: 0;
  min-inline-size: 0;
}

.notes--compact .notes__editor {
  background: var(--color-bg);
  block-size: 100%;
}

.notes__editor-empty {
  flex-direction: column;
  gap: var(--space-sm);
  min-block-size: 0;
}

.notes__empty-icon {
  block-size: 28px;
  inline-size: 28px;
}

.notes__editor-header {
  border-block-end: 1px solid var(--color-border);
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-md);
}

.notes--compact .notes__editor-header {
  padding: var(--space-lg) var(--space-md) var(--space-sm);
}

.notes__title-input {
  background: transparent;
  border: 0;
  color: var(--color-fg);
  font: inherit;
  font-size: 20px;
  font-weight: 600;
  inline-size: 100%;
  min-block-size: 34px;
  padding: 0;
}

.notes--compact .notes__title-input {
  font-size: 26px;
  min-block-size: 42px;
}

.notes__status {
  color: var(--color-fg-muted);
  font-size: 12px;
  min-block-size: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notes__status--error {
  color: var(--color-error-soft);
}

.notes__textarea {
  background: var(--color-bg);
  border: 0;
  color: var(--color-fg);
  font: inherit;
  inline-size: 100%;
  line-height: 1.6;
  min-block-size: 0;
  padding: var(--space-md);
  resize: none;
}

.notes--compact .notes__textarea {
  font-size: 16px;
  line-height: 1.65;
  padding: var(--space-sm) var(--space-md) var(--space-lg);
}

.notes__dialog-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}
</style>
