<script setup vapor lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { computed, inject, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";

import { AppFrame, AppToolbar, EmptyState, ScrollArea, useAppChrome } from "@daopk/kit";
import {
  Icon,
  Button,
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  Input,
  Modal,
  Textarea,
  useToast,
} from "@daopk/ui";
import FileText from "~icons/lucide/file-text";
import Plus from "~icons/lucide/plus";
import {
  AppContextInjectionKey,
  formatDateTime,
  useKernel,
  useVfs,
  type AppChromeBackAction,
} from "@daopk/sdk";

import {
  isNotesMarkdownPath,
  NOTES_ROOT,
  useNotes,
  type NoteListItem,
  type NotesStatus,
} from "./useNotes";
import { useNoteEditingSessions } from "./useNoteEditingSession";
import { usePinnedDesktopNotes } from "./usePinnedDesktopNotes";

const COMPACT_BREAKPOINT = 620;

interface AppFrameRef {
  element: HTMLElement | null;
}

const kernel = useKernel();
const appContext = inject(AppContextInjectionKey, null);
const vfs = useVfs();
const toast = useToast();
const pinnedNotes = usePinnedDesktopNotes();
const editingSessions = useNoteEditingSessions();
const notes = useNotes({
  vfs: {
    ...vfs,
    moveToTrash: (path) =>
      appContext === null
        ? Promise.resolve(null)
        : kernel.trash.moveToTrash(path, { handleId: appContext.handleId }),
  },
  editingSessions,
});
const rootRef = useTemplateRef<AppFrameRef>("rootRef");
const rootElement = computed(() => rootRef.value?.element ?? null);
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

useResizeObserver(rootElement, ([entry]) => {
  if (entry) {
    isCompact.value = entry.contentRect.width <= COMPACT_BREAKPOINT;
  }
});

onMounted(() => {
  if (!pinnedNotes.isHydrated()) {
    pinnedNotes.hydrate();
  }
  void loadInitialNotes();
});

onUnmounted(() => {
  stopWillKill();
  stopOpenRequests();
  notes.dispose({ flush: closeFlush === undefined });
});

const chromeTitle = computed(() =>
  isCompact.value && mobileEditorOpen.value ? notes.title.value || "Notes" : null,
);
const chromeBackAction = computed<AppChromeBackAction | null>(() =>
  isCompact.value && mobileEditorOpen.value
    ? { ariaLabel: "Back to Notes", handler: closeMobileEditor }
    : null,
);
useAppChrome({ title: chromeTitle, backAction: chromeBackAction });

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

function onNoteContextMenuOpen(open: boolean, note: NoteListItem): void {
  if (open) {
    void selectNoteForView(note.path, { openEditor: false });
  }
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

function pinNoteToDesktop(note: NoteListItem): void {
  pinnedNotes.pin(note.path);
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
    const deleted = await notes.deleteNote(note.path);
    if (deleted) {
      toast.success({ title: "Moved to Trash", description: `"${note.title}" moved to Trash.` });
    }
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
  <AppFrame
    ref="rootRef"
    as="section"
    class="notes"
    :class="{
      'notes--compact': isCompact,
      'notes--mobile-editor-open': isCompact && mobileEditorOpen,
    }"
    layout="grid"
    aria-label="Notes"
  >
    <aside v-if="showList" class="notes__sidebar" aria-label="Note list">
      <AppToolbar class="notes__sidebar-header" density="comfortable" variant="plain">
        <Button
          class="notes__new-button"
          :size="isCompact ? 'md' : 'sm'"
          variant="solid"
          color="blue"
          :loading="newButtonLoading"
          :disabled="newButtonDisabled"
          @click="createNote"
        >
          <template #left><Icon :icon="Plus" size="1.2em" aria-hidden="true" /></template>
          New
        </Button>
      </AppToolbar>

      <EmptyState v-if="notes.notes.value.length === 0" class="notes__list-empty">
        {{ statusText }}
      </EmptyState>
      <ScrollArea v-else as="ul" class="notes__list" aria-label="Notes">
        <li v-for="note in notes.notes.value" :key="note.path" class="notes__list-item">
          <ContextMenu :modal="false" @update:open="onNoteContextMenuOpen($event, note)">
            <template #trigger>
              <button
                type="button"
                class="notes__note-button"
                :class="{ 'notes__note-button--active': note.path === notes.selectedPath.value }"
                :aria-current="note.path === notes.selectedPath.value ? 'page' : undefined"
                @click="selectNote(note.path)"
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
              <ContextMenuItem @select="pinNoteToDesktop(note)">Pin to Desktop</ContextMenuItem>
              <ContextMenuItem @select="revealNoteInFinder(note)">Reveal in Finder</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem :disabled="noteMutationDisabled" @select="requestDeleteNote(note)">
                Delete...
              </ContextMenuItem>
            </template>
          </ContextMenu>
        </li>
      </ScrollArea>
    </aside>

    <main v-if="showEditor" class="notes__editor" aria-label="Selected note">
      <EmptyState v-if="!notes.hasSelection.value" class="notes__editor-empty">
        <template #icon>
          <FileText class="notes__empty-icon" aria-hidden="true" />
        </template>
        <span>{{ statusText }}</span>
      </EmptyState>
      <template v-else>
        <header class="notes__editor-header">
          <Input
            class="notes__title-input-root"
            :class-names="{ input: 'notes__title-input' }"
            :model-value="notes.title.value"
            ariaLabel="Note title"
            :input-attrs="{ autocomplete: 'off', spellcheck: true }"
            @update:model-value="notes.setTitle"
          />
          <div
            class="notes__status"
            :class="{ 'notes__status--error': notes.error.value !== null }"
            role="status"
          >
            {{ statusText }}
          </div>
        </header>
        <Textarea
          class="notes__textarea-root"
          :class-names="{ input: 'notes__textarea' }"
          resize="none"
          :model-value="notes.draft.value"
          ariaLabel="Note body"
          :input-attrs="{ spellcheck: true }"
          @update:model-value="notes.setDraft"
        />
      </template>
    </main>

    <Modal
      v-model:open="deleteDialogOpen"
      title="Move note to Trash?"
      :description="deleteDescription"
      :show-close-button="false"
      @close="cancelDeleteNote"
    >
      <template #footer>
        <Button size="sm" :disabled="deletingNote" @click="cancelDeleteNote">Cancel</Button>
        <Button
          size="sm"
          variant="solid"
          color="blue"
          :loading="deletingNote"
          @click="confirmDeleteNote"
        >
          Move to Trash
        </Button>
      </template>
    </Modal>
  </AppFrame>
</template>

<style scoped lang="scss" src="./styles/notes-app.scss"></style>
