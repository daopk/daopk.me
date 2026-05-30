import { computed, ref, type ComputedRef, type Ref } from "vue";

import type { VfsDirEntry, VfsStat } from "~/core/vfs/nodes";
import { splitFilename } from "~/core/vfs/fileNames";
import { basename, dirname, joinVfsPath, normalizeVfsPath, type VfsPath } from "~/core/vfs/path";
import { normalizedVfsMimeType, vfsFileExtension } from "~/core/vfs/fileTypes";
import type { TrashItem } from "~/types/trash";

export const NOTES_ROOT = "/home/notes";
export const NOTES_MIME_TYPE = "text/markdown;charset=utf-8";
export const NOTES_AUTOSAVE_DEBOUNCE_MS = 800;

export type NotesStatus = "idle" | "loading" | "empty" | "unsaved" | "saving" | "saved" | "error";

export interface NoteListItem {
  readonly path: VfsPath;
  readonly name: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly size: number;
}

export interface NotesVfsClient {
  list(path: string): Promise<readonly VfsDirEntry[] | null>;
  readText(path: string): Promise<string | null>;
  writeText(
    path: string,
    text: string,
    options?: { overwrite?: boolean; mimeType?: string },
  ): Promise<VfsStat | null>;
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
  readonly selectedPath: Ref<VfsPath | null>;
  readonly title: Ref<string>;
  readonly draft: Ref<string>;
  readonly status: Ref<NotesStatus>;
  readonly error: Ref<string | null>;
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

export function isNotesMarkdownPath(path: string): boolean {
  let normalized: VfsPath;
  try {
    normalized = normalizeVfsPath(path);
  } catch {
    return false;
  }

  const extension = vfsFileExtension(normalized);
  return dirname(normalized) === NOTES_ROOT && (extension === "md" || extension === "markdown");
}

interface ParsedNote {
  readonly title: string;
  readonly body: string;
}

const UNTITLED_TITLE = "Untitled note";
const FIRST_H1_PATTERN = /^#\s+(.+?)\s*$/;

export function useNotes({
  vfs,
  now = () => new Date(),
  debounceMs = NOTES_AUTOSAVE_DEBOUNCE_MS,
}: UseNotesOptions): UseNotesBindings {
  const notes = ref<readonly NoteListItem[]>([]);
  const selectedPath = ref<VfsPath | null>(null);
  const title = ref("");
  const draft = ref("");
  const savedSource = ref("");
  const status = ref<NotesStatus>("idle");
  const error = ref<string | null>(null);
  const creating = ref(false);
  const hasSelection = computed(() => selectedPath.value !== null);

  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let loadRun = 0;
  let saveRun = 0;
  let inFlightSaves = 0;
  let activeSave: Promise<boolean> | undefined;
  let disposed = false;

  async function loadNotes(): Promise<boolean> {
    cancelAutosave();
    const run = ++loadRun;
    saveRun += 1;
    status.value = "loading";
    error.value = null;

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
        status.value = "empty";
        return true;
      }

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
    if (!(await persistActiveDraftBeforeTransition())) {
      creating.value = false;
      return false;
    }

    cancelAutosave();
    const run = ++loadRun;
    saveRun += 1;
    status.value = "saving";
    error.value = null;

    try {
      const rootReady = await ensureNotesRoot();
      if (!rootReady || run !== loadRun || disposed) {
        return false;
      }

      const path = nextNotePath();
      const source = noteSource(UNTITLED_TITLE, "");
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
      const item = noteItemFromStat(stat, UNTITLED_TITLE);
      notes.value = sortNotes(upsertNote(notes.value, item));
      selectedPath.value = normalized;
      title.value = UNTITLED_TITLE;
      draft.value = "";
      savedSource.value = source;
      status.value = "saved";
      error.value = null;
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

    if (!(await persistActiveDraftBeforeTransition())) {
      return false;
    }

    cancelAutosave();
    const normalized = normalizeVfsPath(path);
    const run = ++loadRun;
    saveRun += 1;
    status.value = "saving";
    error.value = null;

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
      selectedPath.value = duplicatedPath;
      title.value = parsed.title;
      draft.value = parsed.body;
      savedSource.value = source;
      status.value = "saved";
      error.value = null;
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

    if (!(await persistActiveDraftBeforeTransition())) {
      return false;
    }

    cancelAutosave();
    const normalized = normalizeVfsPath(path);
    const run = ++loadRun;
    saveRun += 1;
    const currentNotes = notes.value;
    const deleteIndex = currentNotes.findIndex((note) => note.path === normalized);
    const fallbackPath = nextSelectionAfterDelete(currentNotes, deleteIndex);
    status.value = "saving";
    error.value = null;

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
          return await selectNote(fallbackPath);
        }

        status.value = "empty";
        error.value = null;
        return true;
      }

      status.value = nextNotes.length === 0 ? "empty" : "saved";
      error.value = null;
      return true;
    } catch (deleteError) {
      if (run === loadRun && !disposed) {
        fail(messageFromError(deleteError, "delete note"));
      }
      return false;
    }
  }

  async function selectNote(path: string): Promise<boolean> {
    if (!(await persistActiveDraftBeforeTransition())) {
      return false;
    }

    cancelAutosave();
    const normalized = normalizeVfsPath(path);
    const run = ++loadRun;
    saveRun += 1;
    status.value = "loading";
    error.value = null;

    try {
      const source = await vfs.readText(normalized);
      if (run !== loadRun || disposed) {
        return false;
      }
      if (source === null) {
        fail("Notes does not have permission to open this note.");
        return false;
      }

      const parsed = parseNoteSource(source, normalized);
      selectedPath.value = normalized;
      title.value = parsed.title;
      draft.value = parsed.body;
      savedSource.value = source;
      status.value = "saved";
      error.value = null;
      return true;
    } catch (selectError) {
      if (run === loadRun && !disposed) {
        fail(messageFromError(selectError, "open note"));
      }
      return false;
    }
  }

  function setTitle(value: string): void {
    title.value = value;
    updateSelectedNoteTitle(value);
    markUnsaved();
  }

  function setDraft(value: string): void {
    draft.value = value;
    markUnsaved();
  }

  async function flushAutosave(): Promise<boolean> {
    cancelAutosave();
    let waitedForActiveSave = false;
    while (activeSave !== undefined) {
      waitedForActiveSave = true;
      await activeSave.catch(() => false);
    }

    const operation = performAutosave({ force: waitedForActiveSave });
    activeSave = operation;

    try {
      return await operation;
    } finally {
      if (activeSave === operation) {
        activeSave = undefined;
      }
    }
  }

  async function performAutosave({ force = false }: { force?: boolean } = {}): Promise<boolean> {
    const path = selectedPath.value;
    if (path === null) {
      return false;
    }

    cancelAutosave();
    const run = ++saveRun;
    const source = currentSource();
    if (!force && source === savedSource.value && inFlightSaves === 0) {
      status.value = "saved";
      error.value = null;
      return true;
    }

    status.value = "saving";
    error.value = null;

    try {
      inFlightSaves += 1;
      const stat = await vfs.writeText(path, source, {
        overwrite: true,
        mimeType: NOTES_MIME_TYPE,
      });
      if (run !== saveRun || selectedPath.value !== path || disposed) {
        if (stat !== null) {
          reconcileStaleSave(path, source, stat);
        }
        return false;
      }
      if (stat === null) {
        fail("Notes does not have permission to save this note.");
        return false;
      }

      savedSource.value = source;
      notes.value = sortNotes(upsertNote(notes.value, noteItemFromStat(stat, title.value)));
      status.value = "saved";
      error.value = null;
      return true;
    } catch (saveError) {
      if (run === saveRun && selectedPath.value === path && !disposed) {
        fail(messageFromError(saveError, "save note"));
      }
      return false;
    } finally {
      inFlightSaves = Math.max(0, inFlightSaves - 1);
    }
  }

  function dispose({ flush = true }: { flush?: boolean } = {}): void {
    if (
      flush &&
      selectedPath.value !== null &&
      (currentSource() !== savedSource.value || inFlightSaves > 0)
    ) {
      void flushAutosave();
    }

    disposed = true;
    cancelAutosave();
    loadRun += 1;
    saveRun += 1;
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
          source === null ? titleFromPath(entry.path) : parseNoteSource(source, entry.path).title;
        return noteItemFromEntry(entry, titleText);
      }),
    );

    return sortNotes(loaded);
  }

  function markUnsaved(): void {
    if (selectedPath.value === null) {
      return;
    }

    saveRun += 1;
    error.value = null;
    status.value =
      currentSource() === savedSource.value && inFlightSaves === 0 ? "saved" : "unsaved";
    scheduleAutosave();
  }

  function reconcileStaleSave(path: VfsPath, persistedSource: string, stat: VfsStat): void {
    if (selectedPath.value !== path || disposed) {
      return;
    }

    savedSource.value = persistedSource;
    notes.value = sortNotes(
      upsertNote(notes.value, noteItemFromStat(stat, parseNoteSource(persistedSource, path).title)),
    );

    if (currentSource() === savedSource.value) {
      status.value = "saved";
      error.value = null;
      cancelAutosave();
      return;
    }

    status.value = "unsaved";
    error.value = null;
    scheduleAutosave();
  }

  async function persistActiveDraftBeforeTransition(): Promise<boolean> {
    if (selectedPath.value === null) {
      return true;
    }

    if (currentSource() === savedSource.value && inFlightSaves === 0) {
      return true;
    }

    return await flushAutosave();
  }

  function scheduleAutosave(): void {
    cancelAutosave();
    if (status.value !== "unsaved") {
      return;
    }

    autosaveTimer = setTimeout(() => {
      autosaveTimer = undefined;
      void flushAutosave();
    }, debounceMs);
  }

  function cancelAutosave(): void {
    if (autosaveTimer !== undefined) {
      clearTimeout(autosaveTimer);
      autosaveTimer = undefined;
    }
  }

  function currentSource(): string {
    return noteSource(title.value, draft.value);
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
    const { stem, extension } = splitFilename(basename(path), UNTITLED_TITLE);
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
      note.path === path ? { ...note, title: displayTitle(value, note.path) } : note,
    );
  }

  function clearSelection(): void {
    selectedPath.value = null;
    title.value = "";
    draft.value = "";
    savedSource.value = "";
  }

  function fail(message: string): void {
    status.value = "error";
    error.value = message;
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

export function parseNoteSource(source: string, path: string): ParsedNote {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const headingIndex = lines.findIndex((line) => FIRST_H1_PATTERN.test(line));

  if (headingIndex < 0) {
    return {
      title: titleFromPath(path),
      body: normalized,
    };
  }

  const match = FIRST_H1_PATTERN.exec(lines[headingIndex]);
  const bodyLines = [...lines.slice(0, headingIndex), ...lines.slice(headingIndex + 1)];
  if (bodyLines[0] === "") {
    bodyLines.shift();
  }

  return {
    title: displayTitle(match?.[1] ?? "", path),
    body: bodyLines.join("\n"),
  };
}

export function noteSource(title: string, body: string): string {
  return `# ${safeHeading(title)}\n\n${body}`;
}

function noteItemFromEntry(entry: VfsDirEntry, title: string): NoteListItem {
  return {
    path: entry.path,
    name: entry.name,
    title: displayTitle(title, entry.path),
    updatedAt: entry.updatedAt,
    size: entry.size,
  };
}

function noteItemFromStat(stat: VfsStat, title: string): NoteListItem {
  const path = normalizeVfsPath(stat.path);
  return {
    path,
    name: basename(path),
    title: displayTitle(title, path),
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

function titleFromPath(path: string): string {
  const normalized = normalizeVfsPath(path);
  const name = basename(normalized);
  return name.replace(/\.(md|markdown)$/i, "") || UNTITLED_TITLE;
}

function displayTitle(value: string, path: string): string {
  return safeHeading(value) || titleFromPath(path);
}

function safeHeading(value: string): string {
  return value.replace(/\s+/g, " ").trim() || UNTITLED_TITLE;
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
  return error instanceof Error ? error.message : `Notes could not ${action}.`;
}
