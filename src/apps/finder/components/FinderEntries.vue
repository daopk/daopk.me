<script setup vapor lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch, type Component } from "vue";

import { Copy, FolderOpen, FolderPlus, Loader2, RefreshCw, Trash2 } from "@daopk/icons";
import { Badge, EmptyState, ScrollArea, StatusBanner } from "@daopk/kit";
import { useKernel, type VfsDirEntry } from "@daopk/sdk";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@daopk/ui";

import AppIcon from "~/components/AppIcon.vue";

import type { FinderViewMode } from "../composables/useFinder";
import {
  entryIcon,
  entryKindLabel,
  formatBytes,
  formatModified,
  isCloudDriveEntry,
} from "../utils/display";
import { openSuggestionsForEntry, type FinderOpenSuggestion } from "../utils/openSuggestions";

const GRID_KEYBOARD_COLUMNS = 4;
const GRID_MIN_COLUMN_WIDTH = 120;
const TOUCH_TAP_MAX_DURATION_MS = 500;
const TOUCH_TAP_MAX_MOVEMENT_PX = 12;

interface EntryPointerStart {
  readonly path: string;
  readonly pointerId: number;
  readonly at: number;
  readonly x: number;
  readonly y: number;
}

const props = defineProps<{
  readonly activeDescendant?: string;
  readonly cwd: string;
  readonly entries: readonly VfsDirEntry[];
  readonly error: string | null;
  readonly loading: boolean;
  readonly loadingPath: string | null;
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
  openWithSuggestion: [entry: VfsDirEntry, suggestion: FinderOpenSuggestion];
  openSelected: [];
  refresh: [];
  requestDeleteEntry: [entry: VfsDirEntry];
  selectByIndex: [index: number];
}>();

const kernel = useKernel();

const entriesRef = ref<HTMLElement | null>(null);
const gridColumns = ref(GRID_KEYBOARD_COLUMNS);
let gridResizeObserver: ResizeObserver | undefined;
let observedEntriesEl: HTMLElement | null = null;
let entryPointerStart: EntryPointerStart | null = null;

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

function isLoadingCloudEntry(entry: VfsDirEntry): boolean {
  return props.loadingPath === entry.path && isCloudDriveEntry(entry);
}

function openSuggestionIconFor(suggestion: FinderOpenSuggestion): Component | null {
  return kernel.apps.list().find((app) => app.id === suggestion.manifestId)?.icon ?? null;
}

function isTouchLikePointer(event: PointerEvent): boolean {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

function eventTime(event: PointerEvent): number {
  return event.timeStamp > 0
    ? event.timeStamp
    : typeof performance === "undefined"
      ? Date.now()
      : performance.now();
}

function distanceBetween(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onEntryPointerDown(entry: VfsDirEntry, event: PointerEvent): void {
  if (!isTouchLikePointer(event)) {
    return;
  }

  // Entry long-press is handled by a nested context menu; keep touch starts
  // from also arming the browser background context menu.
  event.stopPropagation();

  if (event.isPrimary === false) {
    return;
  }

  entryPointerStart = {
    path: entry.path,
    pointerId: event.pointerId,
    at: eventTime(event),
    x: event.clientX,
    y: event.clientY,
  };
}

function onEntryPointerUp(entry: VfsDirEntry, event: PointerEvent): void {
  if (!isTouchLikePointer(event)) {
    return;
  }

  const pointerStart = entryPointerStart;
  entryPointerStart = null;
  if (
    entry.kind !== "directory" ||
    pointerStart === null ||
    pointerStart.pointerId !== event.pointerId ||
    pointerStart.path !== entry.path
  ) {
    return;
  }

  const tap = { x: event.clientX, y: event.clientY };
  const duration = eventTime(event) - pointerStart.at;
  const moved = distanceBetween(pointerStart, tap);
  if (duration > TOUCH_TAP_MAX_DURATION_MS || moved > TOUCH_TAP_MAX_MOVEMENT_PX) {
    return;
  }

  emit("openEntry", entry);
}

function onEntryPointerCancel(event: PointerEvent): void {
  if (entryPointerStart?.pointerId === event.pointerId) {
    entryPointerStart = null;
  }
}

const pointerBoundEntries = new WeakSet<HTMLElement>();

function bindEntryPointerHandlers(entry: VfsDirEntry, value: unknown): void {
  if (!(value instanceof HTMLElement) || pointerBoundEntries.has(value)) {
    return;
  }
  pointerBoundEntries.add(value);

  // These listeners must run on the entry before the nested ContextMenu's
  // parent trigger sees the bubbling event. Vapor delegates template events
  // at `document`, which is too late for this nested stopPropagation case.
  value.addEventListener("pointercancel", onEntryPointerCancel);
  value.addEventListener("pointerdown", (event) => onEntryPointerDown(entry, event));
  value.addEventListener("pointerup", (event) => onEntryPointerUp(entry, event));
}

function onEntryContextMenu(entry: VfsDirEntry): void {
  entryPointerStart = null;
  emit("entryContextMenu", entry);
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
        <StatusBanner v-if="error" class="finder__notice" tone="error">{{ error }}</StatusBanner>
        <EmptyState v-else-if="!error && entries.length === 0" class="finder__empty">
          This folder is empty.
        </EmptyState>

        <ScrollArea v-if="entries.length > 0" class="finder__scroll">
          <div
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
                  :ref="(value) => bindEntryPointerHandlers(entry, value)"
                  class="finder__entry"
                  :class="{ 'finder__entry--selected': selectedPath === entry.path }"
                  role="option"
                  :aria-selected="selectedPath === entry.path"
                  @click="emit('entryClick', entry)"
                  @contextmenu.stop="onEntryContextMenu(entry)"
                  @dblclick="emit('entryDoubleClick', entry)"
                >
                  <component
                    :is="isLoadingCloudEntry(entry) ? Loader2 : entryIcon(entry)"
                    class="finder__entry-icon"
                    :class="{ 'finder__entry-icon--loading': isLoadingCloudEntry(entry) }"
                    :size="viewMode === 'grid' ? 28 : 18"
                    aria-hidden="true"
                  />
                  <span class="finder__entry-name" :title="entry.name">{{ entry.name }}</span>
                  <span class="finder__entry-kind">{{ entryKindLabel(entry) }}</span>
                  <span class="finder__entry-size">{{
                    entry.kind === "file" ? formatBytes(entry.size) : "-"
                  }}</span>
                  <span class="finder__entry-date">{{ formatModified(entry.updatedAt) }}</span>
                  <span class="finder__entry-badge-slot">
                    <Badge v-if="entry.readonly" class="finder__entry-badge">Read only</Badge>
                  </span>
                </div>
              </template>
              <template #items>
                <ContextMenuItem
                  v-if="entry.kind === 'directory'"
                  @select="emit('openEntry', entry)"
                >
                  <FolderOpen class="finder__context-icon" :size="15" aria-hidden="true" />
                  <span>Open</span>
                </ContextMenuItem>
                <ContextMenuItem
                  v-for="suggestion in openSuggestionsForEntry(entry)"
                  :key="suggestion.id"
                  @select="emit('openWithSuggestion', entry, suggestion)"
                >
                  <AppIcon
                    :icon="openSuggestionIconFor(suggestion)"
                    class="finder__context-icon finder__context-icon--app"
                    :size="16"
                    aria-hidden="true"
                  />
                  <span>{{ suggestion.label }}</span>
                </ContextMenuItem>
                <ContextMenuItem @select="emit('copyPath', entry.path)">
                  <Copy class="finder__context-icon" :size="15" aria-hidden="true" />
                  <span>Copy Path</span>
                </ContextMenuItem>
                <template v-if="entry.kind === 'file'">
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    :disabled="!canMutateEntry(entry)"
                    @select="emit('duplicateEntry', entry)"
                  >
                    <Copy class="finder__context-icon" :size="15" aria-hidden="true" />
                    <span>Duplicate</span>
                  </ContextMenuItem>
                </template>
                <ContextMenuSeparator />
                <ContextMenuItem
                  :disabled="!canMutateEntry(entry)"
                  @select="emit('requestDeleteEntry', entry)"
                >
                  <Trash2 class="finder__context-icon" :size="15" aria-hidden="true" />
                  <span>Delete...</span>
                </ContextMenuItem>
              </template>
            </ContextMenu>
          </div>
        </ScrollArea>
      </section>
    </template>
    <template #items>
      <ContextMenuItem :disabled="mutationDisabled" @select="emit('createFolder')">
        <FolderPlus class="finder__context-icon" :size="15" aria-hidden="true" />
        <span>New Folder</span>
      </ContextMenuItem>
      <ContextMenuItem @select="emit('refresh')">
        <RefreshCw class="finder__context-icon" :size="15" aria-hidden="true" />
        <span>Refresh</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @select="emit('copyPath', cwd)">
        <Copy class="finder__context-icon" :size="15" aria-hidden="true" />
        <span>Copy Current Folder Path</span>
      </ContextMenuItem>
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
  margin-bottom: var(--space-sm);
}

.finder__notice {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.finder__scroll {
  block-size: 100%;
  min-block-size: 0;
}

.finder__entries {
  min-block-size: 0;
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
  grid-template-columns: 20px minmax(120px, 1fr) 78px 64px 140px 96px;
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

.finder__entry-icon--loading {
  animation: finder-entry-icon-spin 0.75s linear infinite;
  color: var(--color-accent);
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
.finder__entry-badge-slot {
  color: var(--color-fg-muted);
  font-size: 12px;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finder__entries--grid .finder__entry-date,
.finder__entries--grid .finder__entry-badge-slot {
  display: none;
}

.finder__entry-badge-slot {
  display: flex;
  justify-content: flex-end;
}

.finder__entry-badge {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 1px var(--space-xs);
  margin-right: var(--space-xs);
}

.finder__context-icon {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
}

.finder__context-icon--app {
  color: inherit;
}

@keyframes finder-entry-icon-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .finder__entry-icon--loading {
    animation-duration: 1.5s;
  }
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
  .finder__entries--list .finder__entry-badge-slot {
    display: none;
  }
}
</style>
