<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "~/components/ui";
import { isEditableVfsTextFile } from "~/core/vfs/fileTypes";
import type { VfsDirEntry } from "~/core/vfs/nodes";

import type { FinderViewMode } from "../useFinder";
import {
  entryIcon,
  entryKindLabel,
  formatBytes,
  formatModified,
  isPdfEntry,
  isSlideDeckEntry,
} from "../display";

const GRID_KEYBOARD_COLUMNS = 4;
const GRID_MIN_COLUMN_WIDTH = 120;

const props = defineProps<{
  readonly activeDescendant?: string;
  readonly cwd: string;
  readonly entries: readonly VfsDirEntry[];
  readonly error: string | null;
  readonly loading: boolean;
  readonly mutationDisabled: boolean;
  readonly selectedPath: string | null;
  readonly viewMode: FinderViewMode;
}>();

const emit = defineEmits<{
  copyPath: [path: string];
  createFolder: [];
  duplicateEntry: [entry: VfsDirEntry];
  entryClick: [entry: VfsDirEntry];
  entryContextMenu: [entry: VfsDirEntry];
  entryDoubleClick: [entry: VfsDirEntry];
  goUp: [];
  moveSelection: [delta: number];
  openEntry: [entry: VfsDirEntry];
  openInEditor: [entry: VfsDirEntry];
  openPdf: [entry: VfsDirEntry];
  openSlides: [entry: VfsDirEntry];
  openSelected: [];
  refresh: [];
  requestDeleteEntry: [entry: VfsDirEntry];
  selectByIndex: [index: number];
}>();

const entriesRef = ref<HTMLElement | null>(null);
const gridColumns = ref(GRID_KEYBOARD_COLUMNS);
let gridResizeObserver: ResizeObserver | undefined;
let observedEntriesEl: HTMLElement | null = null;

onMounted(() => {
  void nextTick(syncGridObserver);
});

onUnmounted(() => {
  gridResizeObserver?.disconnect();
  observedEntriesEl = null;
});

watch(
  () => [props.entries, props.viewMode] as const,
  () => {
    void nextTick(syncGridObserver);
  },
);

function syncGridObserver(): void {
  const el = entriesRef.value;
  if (typeof ResizeObserver !== "function") {
    updateGridColumns();
    return;
  }

  gridResizeObserver ??= new ResizeObserver(updateGridColumns);
  if (observedEntriesEl !== null && observedEntriesEl !== el) {
    gridResizeObserver.unobserve(observedEntriesEl);
  }
  observedEntriesEl = el;

  if (el !== null) {
    gridResizeObserver.observe(el);
  }
  updateGridColumns();
}

function updateGridColumns(): void {
  const el = entriesRef.value;
  if (el === null || props.viewMode !== "grid") {
    gridColumns.value = GRID_KEYBOARD_COLUMNS;
    return;
  }

  const templateColumns = getComputedStyle(el).gridTemplateColumns;
  const measuredColumns = templateColumns
    .split(" ")
    .filter((part) => part.length > 0 && part !== "none").length;
  const estimatedColumns = Math.floor(el.clientWidth / GRID_MIN_COLUMN_WIDTH);
  gridColumns.value = Math.max(1, measuredColumns || estimatedColumns || GRID_KEYBOARD_COLUMNS);
}

function entryId(index: number): string {
  return `finder-entry-${index}`;
}

function canMutateEntry(entry: VfsDirEntry): boolean {
  return !props.mutationDisabled && !entry.readonly;
}

function onBrowserKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      emit("moveSelection", props.viewMode === "grid" ? gridColumns.value : 1);
      break;
    case "ArrowUp":
      event.preventDefault();
      emit("moveSelection", props.viewMode === "grid" ? -gridColumns.value : -1);
      break;
    case "ArrowRight":
      if (props.viewMode === "grid") {
        event.preventDefault();
        emit("moveSelection", 1);
      }
      break;
    case "ArrowLeft":
      if (props.viewMode === "grid") {
        event.preventDefault();
        emit("moveSelection", -1);
      }
      break;
    case "Home":
      event.preventDefault();
      emit("selectByIndex", 0);
      break;
    case "End":
      event.preventDefault();
      emit("selectByIndex", props.entries.length - 1);
      break;
    case "Enter":
      event.preventDefault();
      emit("openSelected");
      break;
    case "Backspace":
      event.preventDefault();
      emit("goUp");
      break;
  }
}
</script>

<template>
  <ContextMenu :modal="false">
    <template #trigger>
      <section class="finder__browser" aria-label="Directory browser">
        <div v-if="error" class="finder__notice" role="status">{{ error }}</div>
        <div v-if="loading" class="finder__notice" role="status">Loading folder...</div>
        <div v-else-if="!error && entries.length === 0" class="finder__empty">
          This folder is empty.
        </div>

        <div
          v-if="entries.length > 0"
          ref="entriesRef"
          class="finder__entries"
          :class="`finder__entries--${viewMode}`"
          role="listbox"
          tabindex="0"
          aria-label="Directory contents"
          :aria-activedescendant="activeDescendant"
          @keydown="onBrowserKeydown"
        >
          <ContextMenu v-for="(entry, index) in entries" :key="entry.path" :modal="false">
            <template #trigger>
              <div
                :id="entryId(index)"
                class="finder__entry"
                :class="{ 'finder__entry--selected': selectedPath === entry.path }"
                role="option"
                :aria-selected="selectedPath === entry.path"
                @click="emit('entryClick', entry)"
                @contextmenu.stop="emit('entryContextMenu', entry)"
                @dblclick="emit('entryDoubleClick', entry)"
              >
                <component
                  :is="entryIcon(entry)"
                  class="finder__entry-icon"
                  :size="viewMode === 'grid' ? 28 : 18"
                  aria-hidden="true"
                />
                <span class="finder__entry-name" :title="entry.name">{{ entry.name }}</span>
                <span class="finder__entry-kind">{{ entryKindLabel(entry) }}</span>
                <span class="finder__entry-size">{{
                  entry.kind === "file" ? formatBytes(entry.size) : "-"
                }}</span>
                <span class="finder__entry-date">{{ formatModified(entry.updatedAt) }}</span>
                <span v-if="entry.readonly" class="finder__entry-badge">Read only</span>
              </div>
            </template>
            <template #items>
              <ContextMenuItem v-if="entry.kind === 'directory'" @select="emit('openEntry', entry)">
                Open
              </ContextMenuItem>
              <ContextMenuItem v-if="isSlideDeckEntry(entry)" @select="emit('openSlides', entry)">
                Open in Slides
              </ContextMenuItem>
              <ContextMenuItem
                v-if="
                  entry.kind === 'file' && isEditableVfsTextFile(entry) && !isSlideDeckEntry(entry)
                "
                @select="emit('openInEditor', entry)"
              >
                Open in Editor
              </ContextMenuItem>
              <ContextMenuItem v-if="isPdfEntry(entry)" @select="emit('openPdf', entry)">
                Open in PDF Viewer
              </ContextMenuItem>
              <ContextMenuItem @select="emit('copyPath', entry.path)">Copy Path</ContextMenuItem>
              <template v-if="entry.kind === 'file'">
                <ContextMenuSeparator />
                <ContextMenuItem
                  :disabled="!canMutateEntry(entry)"
                  @select="emit('duplicateEntry', entry)"
                >
                  Duplicate
                </ContextMenuItem>
              </template>
              <ContextMenuSeparator />
              <ContextMenuItem
                :disabled="!canMutateEntry(entry)"
                @select="emit('requestDeleteEntry', entry)"
              >
                Delete...
              </ContextMenuItem>
            </template>
          </ContextMenu>
        </div>
      </section>
    </template>
    <template #items>
      <ContextMenuItem :disabled="mutationDisabled" @select="emit('createFolder')">
        New Folder
      </ContextMenuItem>
      <ContextMenuItem @select="emit('refresh')">Refresh</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @select="emit('copyPath', cwd)">Copy Current Folder Path</ContextMenuItem>
    </template>
  </ContextMenu>
</template>

<style scoped lang="scss">
.finder__browser {
  border-inline-end: 1px solid var(--color-border);
  min-block-size: 0;
  min-inline-size: 0;
  overflow: hidden;
  padding: var(--space-sm);
}

.finder__notice,
.finder__empty {
  color: var(--color-fg-muted);
  padding: var(--space-md);
}

.finder__notice {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.finder__entries {
  block-size: 100%;
  min-block-size: 0;
  overflow: auto;
}

.finder__entries:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.finder__entries--list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.finder__entries--grid {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  grid-auto-rows: minmax(110px, auto);
}

.finder__entry {
  border-radius: var(--radius-md);
  cursor: default;
  min-inline-size: 0;
  user-select: none;
}

.finder__entries--list .finder__entry {
  align-items: center;
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: 20px minmax(120px, 1fr) 78px 64px 140px auto;
  min-block-size: 34px;
  padding: var(--space-xs) var(--space-sm);
}

.finder__entries--grid .finder__entry {
  align-items: center;
  aspect-ratio: 1 / 0.86;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  justify-content: center;
  padding: var(--space-sm);
  text-align: center;
}

.finder__entry:hover,
.finder__entry--selected {
  background: var(--color-bg-elevated);
}

.finder__entry--selected {
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.finder__entry-icon {
  flex: 0 0 auto;
}

.finder__entry-name {
  color: var(--color-fg);
  font-weight: 500;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finder__entries--grid .finder__entry-name {
  max-inline-size: 100%;
  white-space: normal;
  word-break: break-word;
}

.finder__entry-kind,
.finder__entry-size,
.finder__entry-date,
.finder__entry-badge {
  color: var(--color-fg-muted);
  font-size: 12px;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finder__entries--grid .finder__entry-date,
.finder__entries--grid .finder__entry-badge {
  display: none;
}

.finder__entry-badge {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 1px var(--space-xs);
}

@media (max-width: 640px) {
  .finder__browser {
    border-block-end: 1px solid var(--color-border);
    border-inline-end: 0;
  }

  .finder__entries--list .finder__entry {
    grid-template-columns: 20px minmax(0, 1fr) 64px;
  }

  .finder__entries--list .finder__entry-size,
  .finder__entries--list .finder__entry-date,
  .finder__entries--list .finder__entry-badge {
    display: none;
  }
}
</style>
