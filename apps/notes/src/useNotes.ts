import { computed, ref, type ComputedRef, type Ref } from "vue";

import {
  basename,
  dirname,
  isNotesMarkdownPath,
  joinVfsPath,
  NOTES_ROOT,
  normalizedVfsMimeType,
  normalizeVfsPath,
  splitFilename,
  toErrorMessage,
  vfsFileExtension,
  type TrashItem,
  type VfsDirEntry,
  type VfsPath,
  type VfsStat,
} from "@daopk/sdk";

import {
  displayNoteTitle,
  noteSource,
  noteTitleFromPath,
  parseNoteSource,
  UNTITLED_NOTE_TITLE,
} from "./noteSource";
import {
  NOTES_AUTOSAVE_DEBOUNCE_MS,
  NOTES_MIME_TYPE,
  createNoteEditingSession,
  type NoteEditingStatus,
  type NoteEditingVfsClient,
} from "./useNoteEditingSession";

// `NOTES_ROOT` + `isNotesMarkdownPath` are owned by the host (the shell defines
// the VFS layout) and re-exported here so existing `./useNotes` importers
// (App.vue, tests) keep working against the same source of truth.
export { isNotesMarkdownPath, NOTES_ROOT };
export { noteSource, parseNoteSource } from "./noteSource";
export { NOTES_AUTOSAVE_DEBOUNCE_MS, NOTES_MIME_TYPE } from "./useNoteEditingSession";

export type NotesStatus = NoteEditingStatus | "empty";

export interface NoteListItem {
  readonly path: VfsPath;
  readonly name: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly size: number;
}

export interface NotesVfsClient extends NoteEditingVfsClient {
  list(path: string): Promise<readonly VfsDirEntry[] | null>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<VfsStat | null>;
  remove(path: string): Promise<boolean>;
  moveToTrash(path: string): Promise<TrashItem | null>;
}

export interface UseNotesOptions {
  readonly vfs: NotesVfsClient;
  readonly now?: () => Date;
  readonly debounceMs?: number;
}

export interface UseNotesBindings {
  readonly notes: Ref<readonly NoteListItem[]>;
  readonly selectedPath: Readonly<Ref<VfsPath | null>>;
  readonly title: Readonly<Ref<string>>;
  readonly draft: Readonly<Ref<string>>;
  readonly status: Readonly<Ref<NotesStatus>>;
  readonly error: Readonly<Ref<string | null>>;
  readonly creating: Ref<boolean>;
  readonly hasSelection: ComputedRef<boolean>;
  loadNotes(): Promise<boolean>;
  createNote(): Promise<boolean>;
  duplicateNote(path: string): Promise<boolean>;
  deleteNote(path: string): Promise<boolean>;
  selectNote(path: string): Promise<boolean>;
  setTitle(value: string): void;
  setDraft(value: string): void;
  flushAutosave(): Promise<boolean>;
  dispose(options?: { flush?: boolean }): void;
}

export function useNotes({
  vfs,
  now = () => new Date(),
  debounceMs = NOTES_AUTOSAVE_DEBOUNCE_MS,
}: UseNotesOptions): UseNotesBindings {
  const notes = ref<readonly NoteListItem[]>([]);
  const operationStatus = ref<NotesStatus | null>("idle");
  const operationError = ref<string | null>(null);
  const creating = ref(false);
  const editing = createNoteEditingSession({
    vfs,
    debounceMs,
    onPersisted: ({ path, source, stat }) => {
      notes.value = sortNotes(
        upsertNote(notes.value, noteItemFromStat(stat, parseNoteSource(source, path).title)),
      );
    },
  });
  const selectedPath = editing.path;
  const title = editing.title;
  const draft = editing.body;
  const status = computed<NotesStatus>(() => operationStatus.value ?? editing.status.value);
  const error = computed<string | null>(() => operationError.value ?? editing.error.value);
  const hasSelection = computed(() => selectedPath.value !== null);

  let loadRun = 0;
  let disposed = false;

  async function loadNotes(): Promise<boolean> {
    const run = ++loadRun;
    if (!(await persistActiveDraftBeforeTransition()) || run !== loadRun || disposed) {
      return false;
    }

    beginOperation("loading");

    try {
      const rootReady = await ensureNotesRoot();
      if (!rootReady || run !== loadRun || disposed) {
        return false;
      }

      const entries = await vfs.list(NOTES_ROOT);
      if (run !== loadRun || disposed) {
        return false;
      }
      if (entries === null) {
        fail("Notes does not have permission to read notes.");
        return false;
      }

      const nextNotes = await readNoteEntries(entries);
      if (run !== loadRun || disposed) {
        return false;
      }

      notes.value = nextNotes;
      if (nextNotes.length === 0) {
        clearSelection();
        beginOperation("empty");
        return true;
      }

      endOperation();
      return await selectNote(nextNotes[0]!.path);
    } catch (loadError) {
      if (run === loadRun && !disposed) {
        fail(messageFromError(loadError, "load notes"));
      }
      return false;
    }
  }

  async function createNote(): Promise<boolean> {
    if (creating.value) {
      return false;
    }

    creating.value = true;
    const run = ++loadRun;
    if (!(await persistActiveDraftBeforeTransition()) || run !== loadRun || disposed) {
      creating.value = false;
      return false;
    }

    beginOperation("saving");

    try {
      const rootReady = await ensureNotesRoot();
      if (!rootReady || run !== loadRun || disposed) {
        return false;
      }

      const path = nextNotePath();
      const source = noteSource(UNTITLED_NOTE_TITLE, "");
      const stat = await vfs.writeText(path, source, {
        overwrite: false,
        mimeType: NOTES_MIME_TYPE,
      });
      if (run !== loadRun || disposed) {
        return false;
      }
      if (stat === null) {
        fail("Notes does not have permission to create notes.");
        return false;
      }

      const normalized = normalizeVfsPath(stat.path);
      const item = noteItemFromStat(stat, UNTITLED_NOTE_TITLE);
      notes.value = sortNotes(upsertNote(notes.value, item));
      editing.usePersisted(normalized, source);
      endOperation();
      return true;
    } catch (createError) {
      if (run === loadRun && !disposed) {
        fail(messageFromError(createError, "create note"));
      }
      return false;
    } finally {
      if (!disposed) {
        creating.value = false;
      }
    }
  }

  async function duplicateNote(path: string): Promise<boolean> {
    if (creating.value) {
      return false;
    }

    const run = ++loadRun;
    if (!(await persistActiveDraftBeforeTransition()) || run !== loadRun || disposed) {
      return false;
    }

    const normalized = normalizeVfsPath(path);
    beginOperation("saving");

    try {
      const source = await vfs.readText(normalized);
      if (run !== loadRun || disposed) {
        return false;
      }
      if (source === null) {
        fail("Notes does not have permission to duplicate this note.");
        return false;
      }

      const duplicatePath = nextDuplicatePath(normalized);
      const stat = await vfs.writeText(duplicatePath, source, {
        overwrite: false,
        mimeType: NOTES_MIME_TYPE,
      });
      if (run !== loadRun || disposed) {
        return false;
      }
      if (stat === null) {
        fail("Notes does not have permission to duplicate notes.");
        return false;
      }

      const duplicatedPath = normalizeVfsPath(stat.path);
      const parsed = parseNoteSource(source, duplicatedPath);
      notes.value = sortNotes(upsertNote(notes.value, noteItemFromStat(stat, parsed.title)));
      editing.usePersisted(duplicatedPath, source);
      endOperation();
      return true;
    } catch (duplicateError) {
      if (run === loadRun && !disposed) {
        fail(messageFromError(duplicateError, "duplicate note"));
      }
      return false;
    }
  }

  async function deleteNote(path: string): Promise<boolean> {
    if (creating.value) {
      return false;
    }

    const run = ++loadRun;
    if (!(await persistActiveDraftBeforeTransition()) || run !== loadRun || disposed) {
      return false;
    }

    const normalized = normalizeVfsPath(path);
    const currentNotes = notes.value;
    const deleteIndex = currentNotes.findIndex((note) => note.path === normalized);
    const fallbackPath = nextSelectionAfterDelete(currentNotes, deleteIndex);
    beginOperation("saving");

    try {
      const trashed = await vfs.moveToTrash(normalized);
      if (run !== loadRun || disposed) {
        return false;
      }
      if (trashed === null) {
        fail("Notes does not have permission to move this note to Trash.");
        return false;
      }

      const nextNotes = notes.value.filter((note) => note.path !== normalized);
      notes.value = nextNotes;

      if (selectedPath.value === normalized) {
        clearSelection();
        if (fallbackPath !== null) {
          endOperation();
          return await selectNote(fallbackPath);
        }

        beginOperation("empty");
        return true;
      }

      if (nextNotes.length === 0) {
        beginOperation("empty");
      } else {
        endOperation();
      }
      return true;
    } catch (deleteError) {
      if (run === loadRun && !disposed) {
        fail(messageFromError(deleteError, "delete note"));
      }
      return false;
    }
  }

  async function selectNote(path: string): Promise<boolean> {
    const normalized = normalizeVfsPath(path);
    const run = ++loadRun;
    endOperation();
    const result = await editing.open(normalized);
    return result === "opened" && run === loadRun && !disposed;
  }

  function setTitle(value: string): void {
    endOperation();
    editing.setTitle(value);
    updateSelectedNoteTitle(value);
  }

  function setDraft(value: string): void {
    endOperation();
    editing.setBody(value);
  }

  async function flushAutosave(): Promise<boolean> {
    return await editing.flush();
  }

  function dispose({ flush = true }: { flush?: boolean } = {}): void {
    disposed = true;
    loadRun += 1;
    editing.dispose({ flush });
  }

  async function ensureNotesRoot(): Promise<boolean> {
    const stat = await vfs.mkdir(NOTES_ROOT, { recursive: true });
    if (stat === null) {
      fail("Notes does not have permission to prepare the notes folder.");
      return false;
    }

    return true;
  }

  async function readNoteEntries(
    entries: readonly VfsDirEntry[],
  ): Promise<readonly NoteListItem[]> {
    const markdownEntries = entries.filter(isMarkdownEntry);
    const loaded = await Promise.all(
      markdownEntries.map(async (entry) => {
        const source = await vfs.readText(entry.path);
        const titleText =
          source === null
            ? noteTitleFromPath(entry.path)
            : parseNoteSource(source, entry.path).title;
        return noteItemFromEntry(entry, titleText);
      }),
    );

    return sortNotes(loaded);
  }

  function persistActiveDraftBeforeTransition(): Promise<boolean> {
    return editing.prepareForMutation();
  }

  function nextNotePath(): VfsPath {
    const stamp = formatTimestamp(now());
    const existing = new Set(notes.value.map((note) => note.path));
    const base = `${NOTES_ROOT}/note-${stamp}`;
    let candidate = normalizeVfsPath(`${base}.md`);
    let suffix = 2;

    while (existing.has(candidate)) {
      candidate = normalizeVfsPath(`${base}-${suffix}.md`);
      suffix += 1;
    }

    return candidate;
  }

  function nextDuplicatePath(path: VfsPath): VfsPath {
    const parent = dirname(path);
    const { stem, extension } = splitFilename(basename(path), UNTITLED_NOTE_TITLE);
    const existing = new Set(notes.value.map((note) => note.path));
    let candidate = joinVfsPath(parent, `${stem} copy${extension}`);
    let suffix = 2;

    while (existing.has(candidate)) {
      candidate = joinVfsPath(parent, `${stem} copy ${suffix}${extension}`);
      suffix += 1;
    }

    return candidate;
  }

  function nextSelectionAfterDelete(
    items: readonly NoteListItem[],
    deleteIndex: number,
  ): VfsPath | null {
    if (deleteIndex < 0) {
      return null;
    }

    return items[deleteIndex + 1]?.path ?? items[deleteIndex - 1]?.path ?? null;
  }

  function updateSelectedNoteTitle(value: string): void {
    const path = selectedPath.value;
    if (path === null) {
      return;
    }

    notes.value = notes.value.map((note) =>
      note.path === path ? { ...note, title: displayNoteTitle(value, note.path) } : note,
    );
  }

  function clearSelection(): void {
    editing.clear();
  }

  function fail(message: string): void {
    operationStatus.value = "error";
    operationError.value = message;
  }

  function beginOperation(nextStatus: NotesStatus): void {
    operationStatus.value = nextStatus;
    operationError.value = null;
  }

  function endOperation(): void {
    operationStatus.value = null;
    operationError.value = null;
  }

  return {
    notes,
    selectedPath,
    title,
    draft,
    status,
    error,
    creating,
    hasSelection,
    loadNotes,
    createNote,
    duplicateNote,
    deleteNote,
    selectNote,
    setTitle,
    setDraft,
    flushAutosave,
    dispose,
  };
}

function noteItemFromEntry(entry: VfsDirEntry, title: string): NoteListItem {
  return {
    path: entry.path,
    name: entry.name,
    title: displayNoteTitle(title, entry.path),
    updatedAt: entry.updatedAt,
    size: entry.size,
  };
}

function noteItemFromStat(stat: VfsStat, title: string): NoteListItem {
  const path = normalizeVfsPath(stat.path);
  return {
    path,
    name: basename(path),
    title: displayNoteTitle(title, path),
    updatedAt: stat.updatedAt,
    size: stat.size,
  };
}

function upsertNote(
  existing: readonly NoteListItem[],
  next: NoteListItem,
): readonly NoteListItem[] {
  const index = existing.findIndex((note) => note.path === next.path);
  if (index < 0) {
    return [...existing, next];
  }

  return existing.map((note) => (note.path === next.path ? next : note));
}

function sortNotes(items: readonly NoteListItem[]): readonly NoteListItem[] {
  return [...items].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }

    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

function isMarkdownEntry(entry: VfsDirEntry): boolean {
  if (entry.kind !== "file") {
    return false;
  }

  const mimeType = normalizedVfsMimeType(entry);
  return (
    mimeType === "text/markdown" ||
    vfsFileExtension(entry.name) === "md" ||
    vfsFileExtension(entry.name) === "markdown"
  );
}

function formatTimestamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];
  const [year, month, day, hour, minute, second] = parts.map((part, index) =>
    index === 0 ? String(part) : String(part).padStart(2, "0"),
  );

  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function messageFromError(error: unknown, action: string): string {
  return toErrorMessage(error, `Notes could not ${action}.`);
}
