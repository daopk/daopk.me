<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { EmptyState, ScrollArea, Spinner, StatusBanner } from "~/components/kit";
import { Button, Dialog, DialogActions } from "~/components/ui";
import { compareEntries } from "~/core/vfs/entrySort";
import { basename, normalizeVfsPath, type VfsPath } from "~/core/vfs/path";
import { File, FileText, Folder, FolderOpen } from "~/icons/lucide";
import { useVfs, type VfsDirEntry } from "~/runtime/sdk";
import { formatBytes, formatDateTime } from "~/utils/format";
import { toErrorMessage } from "~/utils/errors";

export type VfsFileAcceptPredicate = (entry: VfsDirEntry) => boolean;

const props = withDefaults(
  defineProps<{
    readonly open: boolean;
    readonly initialPath?: string;
    readonly title?: string;
    readonly confirmLabel?: string;
    readonly accept?: VfsFileAcceptPredicate;
  }>(),
  {
    initialPath: "/home",
    title: "Open File",
    confirmLabel: "Open",
    accept: undefined,
  },
);

const emit = defineEmits<{
  "update:open": [next: boolean];
  cancel: [];
  confirm: [path: string];
}>();

const vfs = useVfs();
const cwd = ref<VfsPath>(normalizeVfsPath("/home"));
const entries = ref<readonly VfsDirEntry[]>([]);
const selectedPath = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const entriesRef = ref<HTMLElement | null>(null);

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
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }

    restoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void openInitialDirectory();
  },
  { immediate: true },
);

async function openInitialDirectory(): Promise<void> {
  const run = ++loadRun;
  const initial = resolveInitialDirectory(props.initialPath);

  await loadDirectory(initial, { run, fallbackHome: initial !== "/home" });
  if (run === loadRun && props.open) {
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
  options: { readonly run?: number; readonly fallbackHome?: boolean } = {},
): Promise<boolean> {
  const run = options.run ?? ++loadRun;
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
      if (options.fallbackHome === true && normalized !== "/home") {
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
    if (options.fallbackHome === true && normalized !== "/home") {
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
  return props.accept?.(entry) ?? entry.kind === "file";
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

  emit("confirm", entry.path);
  emit("update:open", false);
  restoreFocus();
}

function cancel(): void {
  emit("cancel");
  emit("update:open", false);
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

function buildBreadcrumbs(
  path: VfsPath,
): ReadonlyArray<{ readonly label: string; readonly path: VfsPath }> {
  if (path === "/") {
    return [{ label: "Root", path }];
  }

  const parts = path.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; path: VfsPath }> = [
    { label: "Root", path: normalizeVfsPath("/") },
  ];
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
</script>

<template>
  <Dialog :open="open" :title="title" size="lg" class="vfs-picker" @update:open="onDialogOpen">
    <div class="vfs-picker__shell">
      <nav class="vfs-picker__breadcrumbs" aria-label="Current folder">
        <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
          <button
            type="button"
            class="vfs-picker__breadcrumb"
            :aria-current="crumb.path === cwd ? 'page' : undefined"
            :disabled="loading || crumb.path === cwd || undefined"
            @click="loadDirectory(crumb.path)"
          >
            {{ crumb.label }}
          </button>
          <span
            v-if="index < breadcrumbs.length - 1"
            class="vfs-picker__breadcrumb-separator"
            aria-hidden="true"
            >/</span
          >
        </template>
      </nav>

      <StatusBanner
        class="vfs-picker__status"
        :tone="error === null ? 'info' : 'error'"
        aria-live="polite"
      >
        {{ liveMessage }}
      </StatusBanner>

      <div class="vfs-picker__browser">
        <div v-if="loading" class="vfs-picker__loading">
          <Spinner size="sm" />
          <span>Loading...</span>
        </div>
        <EmptyState v-else-if="entries.length === 0" class="vfs-picker__empty">
          This folder is empty.
        </EmptyState>
        <ScrollArea v-else class="vfs-picker__scroll">
          <div
            ref="entriesRef"
            class="vfs-picker__entries"
            role="listbox"
            tabindex="0"
            aria-label="Files"
            :aria-activedescendant="activeDescendant()"
            @keydown="onBrowserKeydown"
          >
            <div
              v-for="(entry, index) in entries"
              :id="`vfs-picker-entry-${index}`"
              :key="entry.path"
              class="vfs-picker__entry"
              :class="{
                'vfs-picker__entry--selected': selectedPath === entry.path,
                'vfs-picker__entry--disabled': entry.kind === 'file' && !acceptsEntry(entry),
              }"
              role="option"
              :aria-selected="selectedPath === entry.path"
              :aria-disabled="entry.kind === 'file' && !acceptsEntry(entry) ? 'true' : undefined"
              @click="select(entry)"
              @dblclick="activateEntry(entry)"
            >
              <component
                :is="entryIcon(entry)"
                class="vfs-picker__entry-icon"
                :size="18"
                aria-hidden="true"
              />
              <span class="vfs-picker__entry-name" :title="entry.name || basename(entry.path)">
                {{ entry.name || basename(entry.path) }}
              </span>
              <span class="vfs-picker__entry-kind">{{ entryKind(entry) }}</span>
              <span class="vfs-picker__entry-size">{{ entrySize(entry) }}</span>
              <span class="vfs-picker__entry-date">{{ entryDate(entry) }}</span>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>

    <DialogActions>
      <Button size="sm" @click="cancel">Cancel</Button>
      <Button
        size="sm"
        variant="primary"
        :disabled="!selectedAccepted || loading"
        @click="confirm()"
      >
        {{ confirmLabel }}
      </Button>
    </DialogActions>
  </Dialog>
</template>

<style scoped lang="scss">
.vfs-picker__shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  inline-size: 100%;
  min-block-size: min(420px, calc(100vh - 180px));
  min-inline-size: 0;
}

.vfs-picker__breadcrumbs {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
  min-block-size: var(--control-height-sm);
}

.vfs-picker__breadcrumb {
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  font: inherit;
  max-inline-size: 160px;
  min-block-size: var(--control-height-sm);
  overflow: hidden;
  padding: 0 var(--space-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vfs-picker__breadcrumb:hover,
.vfs-picker__breadcrumb:focus-visible {
  background: var(--color-bg-subtle);
  color: var(--color-fg);
}

.vfs-picker__breadcrumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.vfs-picker__breadcrumb:disabled {
  color: var(--color-fg);
  cursor: default;
}

.vfs-picker__breadcrumb-separator {
  color: var(--color-fg-subtle);
}

.vfs-picker__status {
  flex: 0 0 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vfs-picker__browser {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  flex: 1 1 auto;
  min-block-size: 240px;
  min-inline-size: 0;
  overflow: hidden;
}

.vfs-picker__loading,
.vfs-picker__empty {
  align-items: center;
  block-size: 100%;
  color: var(--color-fg-muted);
  display: flex;
  gap: var(--space-xs);
  justify-content: center;
  min-block-size: 240px;
  padding: var(--space-md);
}

.vfs-picker__scroll {
  block-size: 100%;
  min-block-size: 0;
}

.vfs-picker__entries {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-block-size: 100%;
  padding: var(--space-xs);
}

.vfs-picker__entries:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.vfs-picker__entry {
  align-items: center;
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: 22px minmax(0, 1fr) minmax(56px, 0.28fr) minmax(48px, 0.22fr) minmax(
      76px,
      0.32fr
    );
  min-block-size: 34px;
  padding: 0 var(--space-sm);
  user-select: none;
}

.vfs-picker__entry:hover,
.vfs-picker__entry--selected {
  background: var(--color-bg-subtle);
}

.vfs-picker__entry--selected {
  box-shadow: inset 0 0 0 1px var(--color-accent-soft);
}

.vfs-picker__entry--disabled {
  color: var(--color-fg-muted);
}

.vfs-picker__entry-icon {
  color: var(--color-fg-muted);
}

.vfs-picker__entry-name,
.vfs-picker__entry-kind,
.vfs-picker__entry-size,
.vfs-picker__entry-date {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vfs-picker__entry-kind,
.vfs-picker__entry-size,
.vfs-picker__entry-date {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
}

@media (max-width: 560px) {
  .vfs-picker__shell {
    min-block-size: min(420px, calc(100vh - 144px));
  }

  .vfs-picker__entry {
    grid-template-columns: 22px minmax(0, 1fr) minmax(48px, auto);
  }

  .vfs-picker__entry-size,
  .vfs-picker__entry-date {
    display: none;
  }
}
</style>
