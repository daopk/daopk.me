import { ref, type Ref } from "vue";

import { normalizeVfsPath, toErrorMessage, useVfs, type VfsPath, type VfsStat } from "@daopk/sdk";

import { noteSource, parseNoteSource } from "./noteSource";

export const NOTES_MIME_TYPE = "text/markdown;charset=utf-8";
export const NOTES_AUTOSAVE_DEBOUNCE_MS = 800;

export type NoteEditingStatus = "idle" | "loading" | "unsaved" | "saving" | "saved" | "error";
export type NoteOpenResult = "opened" | "unavailable" | "failed";
export type NoteRefreshResult = NoteOpenResult | "ignored";

export interface NoteEditingVfsClient {
  readText(path: string): Promise<string | null>;
  writeText(
    path: string,
    text: string,
    options?: { overwrite?: boolean; mimeType?: string },
  ): Promise<VfsStat | null>;
}

export interface NotePersistedEvent {
  readonly path: VfsPath;
  readonly source: string;
  readonly stat: VfsStat;
}

export interface UseNoteEditingSessionOptions {
  readonly vfs: NoteEditingVfsClient;
  readonly debounceMs?: number;
  readonly onPersisted?: (event: NotePersistedEvent) => void;
}

export interface NoteEditingSession {
  readonly path: Readonly<Ref<VfsPath | null>>;
  readonly title: Readonly<Ref<string>>;
  readonly body: Readonly<Ref<string>>;
  readonly status: Readonly<Ref<NoteEditingStatus>>;
  readonly error: Readonly<Ref<string | null>>;
  open(path: string): Promise<NoteOpenResult>;
  refresh(path: string): Promise<NoteRefreshResult>;
  prepareForMutation(): Promise<boolean>;
  usePersisted(path: string, source: string): void;
  clear(): void;
  setTitle(value: string): void;
  setBody(value: string): void;
  flush(): Promise<boolean>;
  dispose(options?: { flush?: boolean }): void;
}

export function useNoteEditingSession(): NoteEditingSession {
  return createNoteEditingSession({ vfs: useVfs() });
}

export function createNoteEditingSession({
  vfs,
  debounceMs = NOTES_AUTOSAVE_DEBOUNCE_MS,
  onPersisted,
}: UseNoteEditingSessionOptions): NoteEditingSession {
  const path = ref<VfsPath | null>(null);
  const title = ref("");
  const body = ref("");
  const status = ref<NoteEditingStatus>("idle");
  const error = ref<string | null>(null);
  let cleanEditorSource = "";

  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let loadRun = 0;
  let saveRun = 0;
  let inFlightSaves = 0;
  let activeSave: Promise<boolean> | undefined;
  let disposed = false;

  async function open(nextPath: string): Promise<NoteOpenResult> {
    const normalized = normalizeVfsPath(nextPath);
    const run = ++loadRun;
    if (!(await persistCurrent()) || run !== loadRun || disposed) {
      return "failed";
    }

    return await readPersisted(normalized, run);
  }

  async function refresh(nextPath: string): Promise<NoteRefreshResult> {
    if (isDirty() || inFlightSaves > 0 || activeSave !== undefined) {
      return "ignored";
    }

    const normalized = normalizeVfsPath(nextPath);
    const run = ++loadRun;
    return await readPersisted(normalized, run);
  }

  function prepareForMutation(): Promise<boolean> {
    cancelPendingLoad();
    return Promise.resolve(persistCurrent());
  }

  async function readPersisted(normalized: VfsPath, run: number): Promise<NoteOpenResult> {
    cancelAutosave();
    saveRun += 1;
    status.value = "loading";
    error.value = null;

    try {
      const source = await vfs.readText(normalized);
      if (run !== loadRun || disposed) {
        return "failed";
      }
      if (source === null) {
        fail("Notes does not have permission to open this note.");
        return "unavailable";
      }

      usePersisted(normalized, source);
      return "opened";
    } catch (openError) {
      if (run === loadRun && !disposed) {
        fail(messageFromError(openError, "open note"));
      }
      return "failed";
    }
  }

  function usePersisted(nextPath: string, source: string): void {
    cancelAutosave();
    loadRun += 1;
    saveRun += 1;

    const normalized = normalizeVfsPath(nextPath);
    const parsed = parseNoteSource(source, normalized);
    path.value = normalized;
    title.value = parsed.title;
    body.value = parsed.body;
    cleanEditorSource = currentSource();
    status.value = "saved";
    error.value = null;
  }

  function clear(): void {
    cancelAutosave();
    loadRun += 1;
    saveRun += 1;
    path.value = null;
    title.value = "";
    body.value = "";
    cleanEditorSource = "";
    status.value = "idle";
    error.value = null;
  }

  function setTitle(value: string): void {
    cancelPendingLoad();
    title.value = value;
    markUnsaved();
  }

  function setBody(value: string): void {
    cancelPendingLoad();
    body.value = value;
    markUnsaved();
  }

  async function flush(): Promise<boolean> {
    cancelAutosave();
    while (activeSave !== undefined) {
      await activeSave.catch(() => false);
    }

    const operation = performSave();
    activeSave = operation;

    try {
      return await operation;
    } finally {
      if (activeSave === operation) {
        activeSave = undefined;
      }
    }
  }

  async function performSave(): Promise<boolean> {
    const activePath = path.value;
    if (activePath === null) {
      return false;
    }

    cancelAutosave();
    const run = ++saveRun;
    const source = currentSource();
    if (!isDirty() && inFlightSaves === 0) {
      status.value = "saved";
      error.value = null;
      return true;
    }

    status.value = "saving";
    error.value = null;

    try {
      inFlightSaves += 1;
      const stat = await vfs.writeText(activePath, source, {
        overwrite: true,
        mimeType: NOTES_MIME_TYPE,
      });
      if (run !== saveRun || path.value !== activePath || disposed) {
        if (stat !== null) {
          reconcileStaleSave(activePath, source, stat);
        }
        return false;
      }
      if (stat === null) {
        fail("Notes does not have permission to save this note.");
        return false;
      }

      cleanEditorSource = source;
      onPersisted?.({ path: activePath, source, stat });
      status.value = "saved";
      error.value = null;
      return true;
    } catch (saveError) {
      if (run === saveRun && path.value === activePath && !disposed) {
        fail(messageFromError(saveError, "save note"));
      }
      return false;
    } finally {
      inFlightSaves = Math.max(0, inFlightSaves - 1);
    }
  }

  function dispose({ flush: shouldFlush = true }: { flush?: boolean } = {}): void {
    if (shouldFlush && path.value !== null && (isDirty() || inFlightSaves > 0)) {
      void flush();
    }

    disposed = true;
    cancelAutosave();
    loadRun += 1;
    saveRun += 1;
  }

  function markUnsaved(): void {
    if (path.value === null) {
      return;
    }

    saveRun += 1;
    error.value = null;
    status.value = !isDirty() && inFlightSaves === 0 ? "saved" : "unsaved";
    scheduleAutosave();
  }

  function reconcileStaleSave(activePath: VfsPath, persistedSource: string, stat: VfsStat): void {
    if (path.value !== activePath) {
      return;
    }

    cleanEditorSource = persistedSource;
    if (disposed) {
      return;
    }

    onPersisted?.({ path: activePath, source: persistedSource, stat });

    if (!isDirty()) {
      status.value = "saved";
      error.value = null;
      cancelAutosave();
      return;
    }

    status.value = "unsaved";
    error.value = null;
    scheduleAutosave();
  }

  function persistCurrent(): boolean | Promise<boolean> {
    if (path.value === null || (!isDirty() && inFlightSaves === 0)) {
      return true;
    }

    return flush();
  }

  function cancelPendingLoad(): void {
    loadRun += 1;
    if (status.value !== "loading") {
      return;
    }

    error.value = null;
    if (path.value === null) {
      status.value = "idle";
      return;
    }

    status.value = isDirty() || inFlightSaves > 0 ? "unsaved" : "saved";
    scheduleAutosave();
  }

  function scheduleAutosave(): void {
    cancelAutosave();
    if (status.value !== "unsaved") {
      return;
    }

    autosaveTimer = setTimeout(() => {
      autosaveTimer = undefined;
      void flush();
    }, debounceMs);
  }

  function cancelAutosave(): void {
    if (autosaveTimer !== undefined) {
      clearTimeout(autosaveTimer);
      autosaveTimer = undefined;
    }
  }

  function currentSource(): string {
    return noteSource(title.value, body.value);
  }

  function isDirty(): boolean {
    return path.value !== null && currentSource() !== cleanEditorSource;
  }

  function fail(message: string): void {
    status.value = "error";
    error.value = message;
  }

  return {
    path,
    title,
    body,
    status,
    error,
    open,
    refresh,
    prepareForMutation,
    usePersisted,
    clear,
    setTitle,
    setBody,
    flush,
    dispose,
  };
}

function messageFromError(error: unknown, action: string): string {
  return toErrorMessage(error, `Notes could not ${action}.`);
}
