import { computed, ref, unref, type ComputedRef, type MaybeRef, type Ref } from "vue";

import {
  basename,
  dirname,
  joinVfsPath,
  normalizeVfsPath,
  splitFilename,
  toErrorMessage,
  VfsError,
  type TrashItem,
  type VfsDirEntry,
  type VfsPath,
  type VfsStat,
} from "@daopk/sdk";

export type FinderViewMode = "list" | "grid";

export interface FinderVfsClient {
  stat(path: string): Promise<VfsStat | null>;
  list(path: string): Promise<readonly VfsDirEntry[] | null>;
  read(path: string): Promise<Uint8Array | null>;
  write(
    path: string,
    bytes: Uint8Array,
    options?: { overwrite?: boolean; mimeType?: string },
  ): Promise<VfsStat | null>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<VfsStat | null>;
  remove(path: string, options?: { recursive?: boolean }): Promise<boolean>;
}

export interface FinderTrashClient {
  moveToTrash(path: string): Promise<TrashItem | null>;
}

export interface FinderBreadcrumb {
  readonly label: string;
  readonly path: string;
}

export interface FinderBindings {
  readonly cwd: Ref<string>;
  readonly entries: Ref<readonly VfsDirEntry[]>;
  readonly selectedPath: Ref<string | null>;
  readonly selectedEntry: ComputedRef<VfsDirEntry | null>;
  readonly selectedIndex: ComputedRef<number>;
  readonly breadcrumbs: ComputedRef<readonly FinderBreadcrumb[]>;
  readonly currentDirectory: Ref<VfsStat | null>;
  readonly currentDirectoryReadonly: ComputedRef<boolean>;
  readonly viewMode: Ref<FinderViewMode>;
  readonly loading: Ref<boolean>;
  readonly mutating: Ref<boolean>;
  readonly error: Ref<string | null>;
  refresh(): Promise<boolean>;
  reveal(path: string, revealPath?: string): Promise<boolean>;
  openDirectory(path: string): Promise<boolean>;
  openSelected(): Promise<boolean>;
  createFolder(): Promise<boolean>;
  duplicateFile(path: string): Promise<boolean>;
  deleteEntry(path: string): Promise<boolean>;
  goUp(): Promise<boolean>;
  setError(message: string | null): void;
  select(path: string | null): void;
  selectByIndex(index: number): void;
  moveSelection(delta: number): void;
  setViewMode(mode: FinderViewMode): void;
}

export interface UseFinderOptions {
  readonly vfs: FinderVfsClient;
  readonly trash?: FinderTrashClient;
  readonly initialPath?: string;
  readonly initialReveal?: string;
  readonly autoSelectFirstEntry?: MaybeRef<boolean>;
}

export function useFinder({
  vfs,
  trash,
  initialPath = "/",
  initialReveal,
  autoSelectFirstEntry = true,
}: UseFinderOptions): FinderBindings {
  const cwd = ref<string>(safeNormalize(initialPath));
  const entries = ref<readonly VfsDirEntry[]>([]);
  const selectedPath = ref<string | null>(null);
  const currentDirectory = ref<VfsStat | null>(null);
  const viewMode = ref<FinderViewMode>("list");
  const loading = ref(false);
  const mutating = ref(false);
  const error = ref<string | null>(null);
  const selectionByDirectory = new Map<string, string>();
  let loadRun = 0;
  let pendingInitialReveal = safeNormalizeOptional(initialReveal);
  let pendingInitialTarget = true;

  const selectedEntry = computed<VfsDirEntry | null>(
    () => entries.value.find((entry) => entry.path === selectedPath.value) ?? null,
  );

  const selectedIndex = computed<number>(() =>
    entries.value.findIndex((entry) => entry.path === selectedPath.value),
  );

  const breadcrumbs = computed<readonly FinderBreadcrumb[]>(() => buildBreadcrumbs(cwd.value));
  const currentDirectoryReadonly = computed(() => currentDirectory.value?.readonly === true);

  async function loadDirectory(
    path: string,
    revealPath?: string | null,
    existingRun?: number,
  ): Promise<boolean> {
    const run = existingRun ?? ++loadRun;
    let normalized: VfsPath;

    try {
      normalized = normalizeVfsPath(path);
    } catch (loadError) {
      if (run === loadRun) {
        error.value = messageFromError(loadError);
      }

      return false;
    }

    loading.value = true;
    error.value = null;

    try {
      const [nextStat, nextEntries] = await Promise.all([
        vfs.stat(normalized),
        vfs.list(normalized),
      ]);
      if (run !== loadRun) {
        return false;
      }

      if (nextStat === null) {
        error.value = "Finder does not have permission to read this folder.";
        return false;
      }
      if (nextStat.kind !== "directory") {
        error.value = "That path is not a folder.";
        return false;
      }
      if (nextEntries === null) {
        error.value = "Finder does not have permission to read this folder.";
        return false;
      }

      const shouldAutoSelectFirstEntry = unref(autoSelectFirstEntry);
      const preferredPath =
        revealPath ??
        (shouldAutoSelectFirstEntry
          ? normalized === cwd.value
            ? selectedPath.value
            : selectionByDirectory.get(normalized)
          : null);
      cwd.value = normalized;
      currentDirectory.value = nextStat;
      entries.value = nextEntries;
      selectedPath.value = chooseSelection(nextEntries, preferredPath, shouldAutoSelectFirstEntry);

      return true;
    } catch (loadError) {
      if (run === loadRun) {
        error.value = messageFromError(loadError);
      }

      return false;
    } finally {
      if (run === loadRun) {
        loading.value = false;
      }
    }
  }

  function rememberSelection(): void {
    if (selectedPath.value !== null) {
      selectionByDirectory.set(cwd.value, selectedPath.value);
    }
  }

  function select(path: string | null): void {
    if (path === null) {
      selectedPath.value = null;
      selectionByDirectory.delete(cwd.value);
      return;
    }

    let normalized: VfsPath;
    try {
      normalized = normalizeVfsPath(path);
    } catch {
      return;
    }

    const entry = entries.value.find((candidate) => candidate.path === normalized);
    if (entry === undefined) {
      return;
    }

    selectedPath.value = entry.path;
    selectionByDirectory.set(cwd.value, entry.path);
  }

  function selectByIndex(index: number): void {
    if (entries.value.length === 0) {
      select(null);
      return;
    }

    const clamped = Math.min(Math.max(index, 0), entries.value.length - 1);
    select(entries.value[clamped]?.path ?? null);
  }

  function moveSelection(delta: number): void {
    if (entries.value.length === 0) {
      return;
    }

    const current = selectedIndex.value;
    const next = current < 0 ? (delta < 0 ? entries.value.length - 1 : 0) : current + delta;
    selectByIndex(next);
  }

  async function openDirectory(path: string): Promise<boolean> {
    const entry = entries.value.find((candidate) => candidate.path === path);
    if (entry !== undefined && entry.kind !== "directory") {
      select(entry.path);
      return false;
    }

    rememberSelection();
    return await loadDirectory(path);
  }

  async function reveal(path: string, revealPath?: string): Promise<boolean> {
    const normalizedReveal = safeNormalizeOptional(revealPath);
    rememberSelection();
    if (normalizedReveal === null) {
      return await loadTarget(path);
    }

    return await loadDirectory(path, normalizedReveal);
  }

  async function refresh(): Promise<boolean> {
    const revealPath = pendingInitialReveal;
    pendingInitialReveal = null;
    if (pendingInitialTarget) {
      pendingInitialTarget = false;
      if (revealPath === null) {
        return await loadTarget(cwd.value);
      }
    }

    return await loadDirectory(cwd.value, revealPath);
  }

  async function loadTarget(path: string): Promise<boolean> {
    const run = ++loadRun;
    let normalized: VfsPath;

    try {
      normalized = normalizeVfsPath(path);
    } catch (loadError) {
      if (run === loadRun) {
        error.value = messageFromError(loadError);
      }

      return false;
    }

    loading.value = true;
    error.value = null;

    try {
      const targetStat = await vfs.stat(normalized);
      if (run !== loadRun) {
        return false;
      }
      if (targetStat === null) {
        error.value = "Finder does not have permission to read this folder.";
        return false;
      }

      if (targetStat.kind === "directory") {
        return await loadDirectory(normalized, null, run);
      }

      return await loadDirectory(dirname(normalized), normalized, run);
    } catch (loadError) {
      if (run === loadRun) {
        error.value = messageFromError(loadError);
      }

      return false;
    } finally {
      if (run === loadRun) {
        loading.value = false;
      }
    }
  }

  async function openSelected(): Promise<boolean> {
    const entry = selectedEntry.value;
    if (entry?.kind !== "directory") {
      return false;
    }

    return await openDirectory(entry.path);
  }

  async function createFolder(): Promise<boolean> {
    if (!canMutateCurrentDirectory()) {
      return false;
    }

    return await runMutation(async () => {
      const path = nextFolderPath();
      const stat = await vfs.mkdir(path, { recursive: false });
      if (stat === null) {
        failMutation("Finder does not have permission to create folders here.");
        return false;
      }

      return await refreshAfterMutation(stat.path);
    });
  }

  async function duplicateFile(path: string): Promise<boolean> {
    if (!canMutateCurrentDirectory()) {
      return false;
    }

    const normalized = normalizeVfsPath(path);
    const entry = entries.value.find((candidate) => candidate.path === normalized);
    if (entry === undefined) {
      failMutation("Finder could not find that file.");
      return false;
    }
    if (entry.kind !== "file") {
      failMutation("Finder can only duplicate files right now.");
      return false;
    }
    if (entry.readonly) {
      failMutation("Finder cannot duplicate a read-only file.");
      return false;
    }

    return await runMutation(async () => {
      const bytes = await vfs.read(normalized);
      if (bytes === null) {
        failMutation("Finder does not have permission to read this file.");
        return false;
      }

      const duplicatePath = nextDuplicatePath(normalized);
      const stat = await vfs.write(duplicatePath, bytes, {
        overwrite: false,
        ...(entry.mimeType === undefined ? {} : { mimeType: entry.mimeType }),
      });
      if (stat === null) {
        failMutation("Finder does not have permission to duplicate files here.");
        return false;
      }

      return await refreshAfterMutation(stat.path);
    });
  }

  async function deleteEntry(path: string): Promise<boolean> {
    if (!canMutateCurrentDirectory()) {
      return false;
    }

    const normalized = normalizeVfsPath(path);
    const deleteIndex = entries.value.findIndex((entry) => entry.path === normalized);
    const entry = entries.value[deleteIndex];
    if (entry === undefined) {
      failMutation("Finder could not find that item.");
      return false;
    }
    if (entry.readonly) {
      failMutation("Finder cannot delete a read-only item.");
      return false;
    }

    const fallbackPath = nextSelectionAfterDelete(entries.value, deleteIndex);
    return await runMutation(async () => {
      if (trash === undefined) {
        failMutation("Finder cannot move items to Trash right now.");
        return false;
      }

      const trashed = await trash.moveToTrash(normalized);
      if (trashed === null) {
        failMutation("Finder does not have permission to move this item to Trash.");
        return false;
      }

      return await refreshAfterMutation(fallbackPath ?? undefined);
    });
  }

  async function goUp(): Promise<boolean> {
    const normalized = normalizeVfsPath(cwd.value);
    if (normalized === "/") {
      return false;
    }

    rememberSelection();
    return await loadDirectory(dirname(normalized));
  }

  function setError(message: string | null): void {
    error.value = message;
  }

  function canMutateCurrentDirectory(): boolean {
    if (loading.value || mutating.value) {
      return false;
    }
    if (currentDirectoryReadonly.value) {
      failMutation("This folder is read-only.");
      return false;
    }

    return true;
  }

  async function runMutation(operation: () => Promise<boolean>): Promise<boolean> {
    mutating.value = true;
    error.value = null;
    try {
      return await operation();
    } catch (mutationError) {
      failMutation(messageFromError(mutationError));
      return false;
    } finally {
      mutating.value = false;
    }
  }

  function failMutation(message: string): void {
    error.value = message;
  }

  async function refreshAfterMutation(revealPath?: string): Promise<boolean> {
    pendingInitialReveal = null;
    return await loadDirectory(cwd.value, revealPath ?? null);
  }

  function nextFolderPath(): string {
    const existing = new Set(entries.value.map((entry) => entry.path));
    let candidate = joinVfsPath(cwd.value, "Untitled Folder");
    let suffix = 2;

    while (existing.has(candidate)) {
      candidate = joinVfsPath(cwd.value, `Untitled Folder ${suffix}`);
      suffix += 1;
    }

    return candidate;
  }

  function nextDuplicatePath(path: string): string {
    const parent = dirname(normalizeVfsPath(path));
    const { stem, extension } = splitFilename(basename(normalizeVfsPath(path)));
    const existing = new Set(entries.value.map((entry) => entry.path));
    let candidate = joinVfsPath(parent, `${stem} copy${extension}`);
    let suffix = 2;

    while (existing.has(candidate)) {
      candidate = joinVfsPath(parent, `${stem} copy ${suffix}${extension}`);
      suffix += 1;
    }

    return candidate;
  }

  function nextSelectionAfterDelete(
    items: readonly VfsDirEntry[],
    deleteIndex: number,
  ): string | null {
    if (deleteIndex < 0) {
      return null;
    }

    return items[deleteIndex + 1]?.path ?? items[deleteIndex - 1]?.path ?? null;
  }

  return {
    cwd,
    entries,
    selectedPath,
    selectedEntry,
    selectedIndex,
    breadcrumbs,
    currentDirectory,
    currentDirectoryReadonly,
    viewMode,
    loading,
    mutating,
    error,
    refresh,
    reveal,
    openDirectory,
    openSelected,
    createFolder,
    duplicateFile,
    deleteEntry,
    goUp,
    setError,
    select,
    selectByIndex,
    moveSelection,
    setViewMode(mode): void {
      viewMode.value = mode;
    },
  };
}

function safeNormalize(path: string): string {
  try {
    return normalizeVfsPath(path);
  } catch {
    return "/";
  }
}

function safeNormalizeOptional(path: string | undefined): string | null {
  if (path === undefined) {
    return null;
  }

  try {
    return normalizeVfsPath(path);
  } catch {
    return null;
  }
}

function chooseSelection(
  entries: readonly VfsDirEntry[],
  preferredPath: string | null | undefined,
  autoSelectFirstEntry = true,
) {
  if (preferredPath && entries.some((entry) => entry.path === preferredPath)) {
    return preferredPath;
  }

  return autoSelectFirstEntry ? (entries[0]?.path ?? null) : null;
}

function buildBreadcrumbs(path: string): readonly FinderBreadcrumb[] {
  const normalized = normalizeVfsPath(path);
  const crumbs: FinderBreadcrumb[] = [{ label: "/", path: "/" }];

  if (normalized === "/") {
    return crumbs;
  }

  let current = normalizeVfsPath("/");
  for (const segment of normalized.split("/").filter(Boolean)) {
    current = joinVfsPath(current, segment);
    crumbs.push({ label: basename(current), path: current });
  }

  return crumbs;
}

function messageFromError(error: unknown): string {
  if (error instanceof VfsError) {
    switch (error.code) {
      case "INVALID_PATH":
        return "That path is not valid.";
      case "NOT_FOUND":
        return "Finder could not find that path.";
      case "NOT_DIRECTORY":
        return "That path is not a folder.";
      case "PERMISSION_DENIED":
        return "Finder does not have permission to read this folder.";
      case "MOUNT_NOT_FOUND":
        return "No filesystem is mounted for that path.";
      case "ADAPTER_UNAVAILABLE":
        return "That filesystem is unavailable right now.";
      default:
        return error.message;
    }
  }

  return toErrorMessage(error);
}
