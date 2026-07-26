import { computed, ref, shallowRef, type Ref } from "vue";

import {
  normalizeVfsPath,
  toErrorMessage,
  useKernel,
  useVfs,
  type Kernel,
  type VfsPath,
  type VfsStat,
} from "@daopk/sdk";

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
  readonly editingSessions?: NoteEditingSessions;
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

export interface NoteEditingDocumentLease {
  readonly editing: NoteEditingSession;
  open(): Promise<NoteOpenResult>;
  refresh(): Promise<NoteRefreshResult>;
  usePersisted(source: string): void;
  release(options?: { flush?: boolean }): void;
}

interface NoteEditingDocumentEntry {
  readonly editing: NoteEditingSession;
  readonly clients: Map<symbol, NoteEditingVfsClient>;
  readonly persistedListeners: Map<symbol, (event: NotePersistedEvent) => void>;
  opening: Promise<NoteOpenResult> | undefined;
}

export interface NoteEditingSessions {
  acquire(
    path: string,
    options: {
      readonly vfs: NoteEditingVfsClient;
      readonly debounceMs?: number;
      readonly onPersisted?: (event: NotePersistedEvent) => void;
    },
  ): NoteEditingDocumentLease;
}

const editingSessionsByKernel = new WeakMap<Kernel, NoteEditingSessions>();

export function useNoteEditingSessions(): NoteEditingSessions {
  const kernel = useKernel();
  let editingSessions = editingSessionsByKernel.get(kernel);
  if (editingSessions === undefined) {
    editingSessions = createNoteEditingSessions();
    editingSessionsByKernel.set(kernel, editingSessions);
  }

  return editingSessions;
}

export function useNoteEditingSession(): NoteEditingSession {
  return createNoteEditingSession({
    vfs: useVfs(),
    editingSessions: useNoteEditingSessions(),
  });
}

export function createNoteEditingSession({
  vfs,
  debounceMs = NOTES_AUTOSAVE_DEBOUNCE_MS,
  onPersisted,
  editingSessions = createNoteEditingSessions(),
}: UseNoteEditingSessionOptions): NoteEditingSession {
  const inactiveTitle = ref("");
  const inactiveBody = ref("");
  const surfaceStatus = ref<NoteEditingStatus | null>(null);
  const surfaceError = ref<string | null>(null);
  const active = shallowRef<NoteEditingDocumentLease>();
  let openRun = 0;
  let disposed = false;

  const path = computed(() => active.value?.editing.path.value ?? null);
  const title = computed(() => active.value?.editing.title.value ?? inactiveTitle.value);
  const body = computed(() => active.value?.editing.body.value ?? inactiveBody.value);
  const status = computed(
    () => surfaceStatus.value ?? active.value?.editing.status.value ?? ("idle" as const),
  );
  const error = computed(() => surfaceError.value ?? active.value?.editing.error.value ?? null);

  async function open(nextPath: string): Promise<NoteOpenResult> {
    const normalized = normalizeVfsPath(nextPath);
    const run = ++openRun;
    clearSurfaceState();

    if (!(await persistCurrent()) || run !== openRun || disposed) {
      return "failed";
    }

    if (active.value?.editing.path.value === normalized) {
      return "opened";
    }

    surfaceStatus.value = "loading";
    const candidate = editingSessions.acquire(normalized, {
      vfs,
      debounceMs,
      ...(onPersisted === undefined ? {} : { onPersisted }),
    });
    const result = await candidate.open();

    if (run !== openRun || disposed) {
      candidate.release({ flush: false });
      return "failed";
    }

    if (result !== "opened") {
      surfaceStatus.value = "error";
      surfaceError.value =
        candidate.editing.error.value ?? "Notes could not open the requested note.";
      candidate.release({ flush: false });
      return result;
    }

    const previous = active.value;
    active.value = candidate;
    clearSurfaceState();
    previous?.release({ flush: false });
    return "opened";
  }

  async function refresh(nextPath: string): Promise<NoteRefreshResult> {
    const normalized = normalizeVfsPath(nextPath);
    if (active.value?.editing.path.value !== normalized) {
      return await open(normalized);
    }

    clearSurfaceState();
    return await active.value.refresh();
  }

  function prepareForMutation(): Promise<boolean> {
    openRun += 1;
    clearSurfaceState();
    return active.value?.editing.prepareForMutation() ?? Promise.resolve(true);
  }

  function usePersisted(nextPath: string, source: string): void {
    const normalized = normalizeVfsPath(nextPath);
    openRun += 1;
    const previous = active.value;
    const candidate = editingSessions.acquire(normalized, {
      vfs,
      debounceMs,
      ...(onPersisted === undefined ? {} : { onPersisted }),
    });
    candidate.usePersisted(source);
    active.value = candidate;
    clearSurfaceState();
    previous?.release({ flush: false });
  }

  function clear(): void {
    openRun += 1;
    const previous = active.value;
    active.value = undefined;
    inactiveTitle.value = "";
    inactiveBody.value = "";
    clearSurfaceState();
    previous?.release({ flush: false });
  }

  function setTitle(value: string): void {
    clearSurfaceState();
    active.value?.editing.setTitle(value);
  }

  function setBody(value: string): void {
    clearSurfaceState();
    active.value?.editing.setBody(value);
  }

  async function flush(): Promise<boolean> {
    clearSurfaceState();
    return (await active.value?.editing.flush()) ?? false;
  }

  function dispose({ flush: shouldFlush = true }: { flush?: boolean } = {}): void {
    if (disposed) {
      return;
    }

    disposed = true;
    openRun += 1;
    const previous = active.value;
    active.value = undefined;
    previous?.release({ flush: shouldFlush });
  }

  function persistCurrent(): Promise<boolean> {
    if (active.value === undefined) {
      return Promise.resolve(true);
    }

    return active.value.editing.prepareForMutation();
  }

  function clearSurfaceState(): void {
    surfaceStatus.value = null;
    surfaceError.value = null;
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

export function createNoteEditingSessions(): NoteEditingSessions {
  const entries = new Map<VfsPath, NoteEditingDocumentEntry>();

  function acquire(
    nextPath: string,
    {
      vfs,
      debounceMs = NOTES_AUTOSAVE_DEBOUNCE_MS,
      onPersisted,
    }: {
      readonly vfs: NoteEditingVfsClient;
      readonly debounceMs?: number;
      readonly onPersisted?: (event: NotePersistedEvent) => void;
    },
  ): NoteEditingDocumentLease {
    const path = normalizeVfsPath(nextPath);
    let entry = entries.get(path);
    if (entry === undefined) {
      entry = createEntry(debounceMs);
      entries.set(path, entry);
    }

    const token = Symbol(path);
    entry.clients.set(token, vfs);
    if (onPersisted !== undefined) {
      entry.persistedListeners.set(token, onPersisted);
    }

    let released = false;

    async function open(): Promise<NoteOpenResult> {
      if (entry!.editing.path.value === path) {
        return "opened";
      }
      if (entry!.opening !== undefined) {
        return await entry!.opening;
      }

      const operation = entry!.editing.open(path);
      entry!.opening = operation;
      try {
        return await operation;
      } finally {
        if (entry!.opening === operation) {
          entry!.opening = undefined;
        }
      }
    }

    function release({ flush = true }: { flush?: boolean } = {}): void {
      if (released) {
        return;
      }
      released = true;

      const shouldRetire = entry!.clients.size === 1;
      const finalFlush = shouldRetire && flush ? entry!.editing.flush() : undefined;
      entry!.persistedListeners.delete(token);
      if (finalFlush === undefined) {
        entry!.clients.delete(token);
      }

      if (!shouldRetire) {
        return;
      }

      const completion = finalFlush ?? Promise.resolve(true);
      void completion
        .catch(() => false)
        .then(() => {
          entry!.clients.delete(token);
          if (entry!.clients.size > 0 || entries.get(path) !== entry) {
            return;
          }

          entry!.editing.dispose({ flush: false });
          entries.delete(path);
        });
    }

    return {
      editing: entry.editing,
      open,
      refresh: () => entry!.editing.refresh(path),
      usePersisted: (source) => entry!.editing.usePersisted(path, source),
      release,
    };
  }

  function createEntry(debounceMs: number): NoteEditingDocumentEntry {
    const clients = new Map<symbol, NoteEditingVfsClient>();
    const persistedListeners = new Map<symbol, (event: NotePersistedEvent) => void>();
    const editing = createNoteDocumentSession({
      vfs: multiplexVfs(clients),
      debounceMs,
      onPersisted: (event) => {
        for (const listener of persistedListeners.values()) {
          listener(event);
        }
      },
    });

    return {
      clients,
      persistedListeners,
      editing,
      opening: undefined,
    };
  }

  return { acquire };
}

function multiplexVfs(clients: Map<symbol, NoteEditingVfsClient>): NoteEditingVfsClient {
  function current(): NoteEditingVfsClient {
    let selected: NoteEditingVfsClient | undefined;
    for (const client of clients.values()) {
      selected = client;
    }
    if (selected === undefined) {
      throw new Error("Note editing session has no active VFS adapter.");
    }
    return selected;
  }

  return {
    readText: (path) => current().readText(path),
    writeText: (path, text, options) => current().writeText(path, text, options),
  };
}

function createNoteDocumentSession({
  vfs,
  debounceMs = NOTES_AUTOSAVE_DEBOUNCE_MS,
  onPersisted,
}: Omit<UseNoteEditingSessionOptions, "editingSessions">): NoteEditingSession {
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
    if ((path.value !== null && !(await persistCurrent())) || run !== loadRun || disposed) {
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
