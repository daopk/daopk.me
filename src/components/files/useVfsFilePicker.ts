import { computed, nextTick, ref, watch, type Ref } from "vue";

import { compareEntries } from "~/core/vfs/entrySort";
import { normalizeVfsPath, type VfsPath } from "~/core/vfs/path";
import { File, FileText, Folder, FolderOpen } from "~/icons/lucide";
import { useVfs, type VfsDirEntry } from "~/runtime/sdk";
import { formatBytes, formatDateTime } from "~/utils/format";
import { toErrorMessage } from "~/utils/errors";

export type VfsFileAcceptPredicate = (entry: VfsDirEntry) => boolean;

export interface VfsFilePickerEmit {
  confirm: (path: string) => void;
  cancel: () => void;
  close: () => void;
}

export interface UseVfsFilePickerOptions {
  isOpen: Readonly<Ref<boolean>>;
  initialPath: Readonly<Ref<string>>;
  accept: Readonly<Ref<VfsFileAcceptPredicate | undefined>>;
  /** Template ref to the listbox element, owned by the SFC for focus management. */
  entriesRef: Ref<HTMLElement | null>;
  emit: VfsFilePickerEmit;
}

interface VfsFilePickerBreadcrumb {
  readonly label: string;
  readonly path: VfsPath;
}

/**
 * Navigation, selection, and confirm/cancel logic for the VFS file picker.
 * Extracted from `VfsFilePickerDialog.vue` so the SFC keeps only its template
 * + props/emits wiring. The dialog passes its reactive props (open state,
 * initial path, accept predicate) plus thin emit callbacks; this composable
 * owns the directory listing, keyboard-driven selection, breadcrumbs, the live
 * region message, and focus restoration.
 */
export function useVfsFilePicker(options: UseVfsFilePickerOptions) {
  const { isOpen, initialPath, accept, entriesRef, emit } = options;

  const vfs = useVfs();
  const cwd = ref<VfsPath>(normalizeVfsPath("/home"));
  const entries = ref<readonly VfsDirEntry[]>([]);
  const selectedPath = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let loadRun = 0;
  let restoreFocusEl: HTMLElement | null = null;

  const selectedEntry = computed<VfsDirEntry | null>(
    () => entries.value.find((entry) => entry.path === selectedPath.value) ?? null,
  );
  const selectedIndex = computed(() =>
    entries.value.findIndex((entry) => entry.path === selectedPath.value),
  );
  const selectedAccepted = computed(() => {
    const entry = selectedEntry.value;
    return entry?.kind === "file" && acceptsEntry(entry);
  });
  const breadcrumbs = computed(() => buildBreadcrumbs(cwd.value));
  const liveMessage = computed(() => {
    if (loading.value) {
      return `Loading ${cwd.value}...`;
    }
    if (error.value !== null) {
      return error.value;
    }

    const entry = selectedEntry.value;
    if (entry === null) {
      return entries.value.length === 0 ? "This folder is empty." : "Select a file.";
    }
    if (entry.kind === "directory") {
      return "Folders are for navigation.";
    }
    if (!acceptsEntry(entry)) {
      return "Editor can open text or Markdown files.";
    }

    return entry.path;
  });

  watch(
    isOpen,
    (open) => {
      if (!open) {
        return;
      }

      restoreFocusEl =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void openInitialDirectory();
    },
    { immediate: true },
  );

  async function openInitialDirectory(): Promise<void> {
    const run = ++loadRun;
    const initial = resolveInitialDirectory(initialPath.value);

    await loadDirectory(initial, { run, fallbackHome: initial !== "/home" });
    if (run === loadRun && isOpen.value) {
      await nextTick();
      entriesRef.value?.focus({ preventScroll: true });
    }
  }

  function resolveInitialDirectory(path: string): VfsPath {
    try {
      return normalizeVfsPath(path);
    } catch {
      return normalizeVfsPath("/home");
    }
  }

  async function loadDirectory(
    path: string,
    loadOptions: { readonly run?: number; readonly fallbackHome?: boolean } = {},
  ): Promise<boolean> {
    const run = loadOptions.run ?? ++loadRun;
    let normalized: VfsPath;
    try {
      normalized = normalizeVfsPath(path);
    } catch (loadError) {
      if (run === loadRun) {
        error.value = messageFromError(loadError);
      }
      return false;
    }

    cwd.value = normalized;
    loading.value = true;
    error.value = null;

    try {
      const nextEntries = await vfs.list(normalized);
      if (run !== loadRun) {
        return false;
      }

      if (nextEntries === null) {
        if (loadOptions.fallbackHome === true && normalized !== "/home") {
          return await loadDirectory("/home", { run, fallbackHome: false });
        }
        error.value = "File picker does not have permission to read this folder.";
        entries.value = [];
        selectedPath.value = null;
        return false;
      }

      const sorted = [...nextEntries].sort(compareEntries);
      entries.value = sorted;
      selectedPath.value = chooseSelection(sorted, selectedPath.value);
      return true;
    } catch (loadError) {
      if (run !== loadRun) {
        return false;
      }
      if (loadOptions.fallbackHome === true && normalized !== "/home") {
        return await loadDirectory("/home", { run, fallbackHome: false });
      }

      error.value = messageFromError(loadError);
      entries.value = [];
      selectedPath.value = null;
      return false;
    } finally {
      if (run === loadRun) {
        loading.value = false;
      }
    }
  }

  function acceptsEntry(entry: VfsDirEntry): boolean {
    return accept.value?.(entry) ?? entry.kind === "file";
  }

  function chooseSelection(
    nextEntries: readonly VfsDirEntry[],
    preferredPath: string | null,
  ): string | null {
    if (preferredPath !== null && nextEntries.some((entry) => entry.path === preferredPath)) {
      return preferredPath;
    }
    return nextEntries[0]?.path ?? null;
  }

  function select(entry: VfsDirEntry): void {
    selectedPath.value = entry.path;
  }

  function selectByIndex(index: number): void {
    if (entries.value.length === 0) {
      selectedPath.value = null;
      return;
    }

    const clamped = Math.min(Math.max(index, 0), entries.value.length - 1);
    selectedPath.value = entries.value[clamped]?.path ?? null;
  }

  function moveSelection(delta: number): void {
    if (entries.value.length === 0) {
      return;
    }

    const current = selectedIndex.value;
    const next = current < 0 ? (delta < 0 ? entries.value.length - 1 : 0) : current + delta;
    selectByIndex(next);
  }

  function activateEntry(entry: VfsDirEntry): void {
    select(entry);
    if (entry.kind === "directory") {
      void loadDirectory(entry.path);
      return;
    }
    if (acceptsEntry(entry)) {
      confirm(entry.path);
    }
  }

  function confirm(path = selectedEntry.value?.path): void {
    const entry = entries.value.find((candidate) => candidate.path === path);
    if (entry?.kind !== "file" || !acceptsEntry(entry)) {
      return;
    }

    emit.confirm(entry.path);
    emit.close();
    restoreFocus();
  }

  function cancel(): void {
    emit.cancel();
    emit.close();
    restoreFocus();
  }

  function onDialogOpen(next: boolean): void {
    if (!next) {
      cancel();
    }
  }

  function onBrowserKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveSelection(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveSelection(-1);
        break;
      case "Home":
        event.preventDefault();
        selectByIndex(0);
        break;
      case "End":
        event.preventDefault();
        selectByIndex(entries.value.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        if (selectedEntry.value !== null) {
          activateEntry(selectedEntry.value);
        }
        break;
    }
  }

  function restoreFocus(): void {
    const el = restoreFocusEl;
    restoreFocusEl = null;
    if (el === null || !document.contains(el)) {
      return;
    }

    void nextTick(() => {
      el.focus({ preventScroll: true });
    });
  }

  function buildBreadcrumbs(path: VfsPath): readonly VfsFilePickerBreadcrumb[] {
    if (path === "/") {
      return [{ label: "Root", path }];
    }

    const parts = path.split("/").filter(Boolean);
    const crumbs: VfsFilePickerBreadcrumb[] = [{ label: "Root", path: normalizeVfsPath("/") }];
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      crumbs.push({ label: part, path: normalizeVfsPath(current) });
    }

    return crumbs;
  }

  function entryIcon(entry: VfsDirEntry) {
    if (entry.kind === "directory") {
      return selectedPath.value === entry.path ? FolderOpen : Folder;
    }
    return acceptsEntry(entry) ? FileText : File;
  }

  function entryKind(entry: VfsDirEntry): string {
    if (entry.kind === "directory") {
      return "Folder";
    }
    if (entry.kind === "file" && acceptsEntry(entry)) {
      return "Text";
    }
    return "File";
  }

  function entrySize(entry: VfsDirEntry): string {
    return entry.kind === "file" ? formatBytes(entry.size) : "-";
  }

  function entryDate(entry: VfsDirEntry): string {
    return entry.updatedAt > 0 ? formatDateTime(entry.updatedAt) : "-";
  }

  function activeDescendant(): string | undefined {
    return selectedIndex.value < 0 ? undefined : `vfs-picker-entry-${selectedIndex.value}`;
  }

  function messageFromError(errorValue: unknown): string {
    return toErrorMessage(errorValue);
  }

  return {
    cwd,
    entries,
    selectedPath,
    loading,
    error,
    selectedAccepted,
    breadcrumbs,
    liveMessage,
    loadDirectory,
    acceptsEntry,
    select,
    activateEntry,
    confirm,
    cancel,
    onDialogOpen,
    onBrowserKeydown,
    entryIcon,
    entryKind,
    entrySize,
    entryDate,
    activeDescendant,
  };
}
