<script setup vapor lang="ts">
import Icon from "~/icons/Icon.vue";
import { nextTick, onMounted, onUnmounted, ref, watch, type VaporComponent } from "vue";

import Copy from "~icons/lucide/copy";
import FolderOpen from "~icons/lucide/folder-open";
import FolderPlus from "~icons/lucide/folder-plus";
import Loader2 from "~icons/lucide/loader-2";
import RefreshCw from "~icons/lucide/refresh-cw";
import Trash2 from "~icons/lucide/trash-2";
import { EmptyState, ScrollArea } from "@daopk/kit";
import { useKernel, type VfsDirEntry } from "@daopk/sdk";
import { Alert, Badge, ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@daopk/ui";

import AppIcon from "~/components/AppIcon.vue";

import type { FinderEntriesState, FinderSessionIntent } from "../composables/useFinderSession";
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
  readonly state: FinderEntriesState;
}>();

const emit = defineEmits<{
  intent: [intent: FinderSessionIntent];
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
  () => [props.state.entries, props.state.viewMode] as const,
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
  if (el === null || props.state.viewMode !== "grid") {
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
  return !props.state.mutationDisabled && !entry.readonly;
}

function isLoadingCloudEntry(entry: VfsDirEntry): boolean {
  return props.state.loadingPath === entry.path && isCloudDriveEntry(entry);
}

function openSuggestionIconFor(suggestion: FinderOpenSuggestion): VaporComponent | null {
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

  emit("intent", { type: "open-entry", path: entry.path });
}

function onEntryPointerCancel(event: PointerEvent): void {
  if (entryPointerStart?.pointerId === event.pointerId) {
    entryPointerStart = null;
  }
}

interface DirectEntryPointerHandlers {
  readonly pointercancel: (event: PointerEvent) => void;
  readonly pointerdown: (event: PointerEvent) => void;
  readonly pointerup: (event: PointerEvent) => void;
}

const directEntryPointerHandlers = new WeakMap<VfsDirEntry, DirectEntryPointerHandlers>();

// Object-form v-on opts these handlers out of Vapor's document-level
// delegation so they run before the nested ContextMenu stops propagation.
function directPointerHandlers(entry: VfsDirEntry): DirectEntryPointerHandlers {
  const cached = directEntryPointerHandlers.get(entry);
  if (cached) {
    return cached;
  }

  const handlers: DirectEntryPointerHandlers = {
    pointercancel: onEntryPointerCancel,
    pointerdown: (event) => onEntryPointerDown(entry, event),
    pointerup: (event) => onEntryPointerUp(entry, event),
  };
  directEntryPointerHandlers.set(entry, handlers);
  return handlers;
}

function onEntryContextMenu(entry: VfsDirEntry): void {
  entryPointerStart = null;
  emit("intent", { type: "select-entry", path: entry.path });
}

function onBrowserKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      emit("intent", {
        type: "move-selection",
        delta: props.state.viewMode === "grid" ? gridColumns.value : 1,
      });
      break;
    case "ArrowUp":
      event.preventDefault();
      emit("intent", {
        type: "move-selection",
        delta: props.state.viewMode === "grid" ? -gridColumns.value : -1,
      });
      break;
    case "ArrowRight":
      if (props.state.viewMode === "grid") {
        event.preventDefault();
        emit("intent", { type: "move-selection", delta: 1 });
      }
      break;
    case "ArrowLeft":
      if (props.state.viewMode === "grid") {
        event.preventDefault();
        emit("intent", { type: "move-selection", delta: -1 });
      }
      break;
    case "Home":
      event.preventDefault();
      emit("intent", { type: "select-by-index", index: 0 });
      break;
    case "End":
      event.preventDefault();
      emit("intent", { type: "select-by-index", index: props.state.entries.length - 1 });
      break;
    case "Enter":
      event.preventDefault();
      emit("intent", { type: "open-selected-entry" });
      break;
    case "Backspace":
      event.preventDefault();
      emit("intent", { type: "go-up" });
      break;
  }
}
</script>

<template>
  <ContextMenu :modal="false">
    <template #trigger>
      <section class="finder__browser" aria-label="Directory browser">
        <Alert v-if="state.error" class="finder__notice" color="red" variant="surface" role="alert">
          {{ state.error }}
        </Alert>
        <EmptyState v-else-if="state.entries.length === 0" class="finder__empty">
          This folder is empty.
        </EmptyState>

        <ScrollArea v-if="state.entries.length > 0" class="finder__scroll">
          <div
            ref="entriesRef"
            class="finder__entries"
            :class="`finder__entries--${state.viewMode}`"
            role="listbox"
            tabindex="0"
            aria-label="Directory contents"
            :aria-activedescendant="state.activeDescendant"
            @keydown="onBrowserKeydown"
          >
            <ContextMenu v-for="(entry, index) in state.entries" :key="entry.path" :modal="false">
              <template #trigger>
                <div
                  :id="entryId(index)"
                  class="finder__entry"
                  :class="{ 'finder__entry--selected': state.selectedPath === entry.path }"
                  role="option"
                  :aria-selected="state.selectedPath === entry.path"
                  v-on="directPointerHandlers(entry)"
                  @click="emit('intent', { type: 'select-entry', path: entry.path })"
                  @contextmenu.stop="onEntryContextMenu(entry)"
                  @dblclick="emit('intent', { type: 'open-entry', path: entry.path })"
                >
                  <component
                    :is="isLoadingCloudEntry(entry) ? Loader2 : entryIcon(entry)"
                    class="finder__entry-icon"
                    :class="{ 'finder__entry-icon--loading': isLoadingCloudEntry(entry) }"
                    :size="state.viewMode === 'grid' ? 28 : 18"
                    aria-hidden="true"
                  />
                  <span class="finder__entry-name" :title="entry.name">{{ entry.name }}</span>
                  <span class="finder__entry-kind">{{ entryKindLabel(entry) }}</span>
                  <span class="finder__entry-size">{{
                    entry.kind === "file" ? formatBytes(entry.size) : "-"
                  }}</span>
                  <span class="finder__entry-date">{{ formatModified(entry.updatedAt) }}</span>
                  <span class="finder__entry-badge-slot">
                    <Badge
                      v-if="entry.readonly"
                      class="finder__entry-badge"
                      color="gray"
                      variant="outline"
                    >
                      Read only
                    </Badge>
                  </span>
                </div>
              </template>
              <template #items>
                <ContextMenuItem
                  v-if="entry.kind === 'directory'"
                  @select="emit('intent', { type: 'open-entry', path: entry.path })"
                >
                  <Icon
                    :icon="FolderOpen"
                    class="finder__context-icon"
                    :size="15"
                    aria-hidden="true"
                  />
                  <span>Open</span>
                </ContextMenuItem>
                <ContextMenuItem
                  v-for="suggestion in openSuggestionsForEntry(entry)"
                  :key="suggestion.id"
                  @select="
                    emit('intent', {
                      type: 'open-with-suggestion',
                      path: entry.path,
                      suggestionId: suggestion.id,
                    })
                  "
                >
                  <AppIcon
                    :icon="openSuggestionIconFor(suggestion)"
                    class="finder__context-icon finder__context-icon--app"
                    :size="16"
                    aria-hidden="true"
                  />
                  <span>{{ suggestion.label }}</span>
                </ContextMenuItem>
                <ContextMenuItem @select="emit('intent', { type: 'copy-path', path: entry.path })">
                  <Icon :icon="Copy" class="finder__context-icon" :size="15" aria-hidden="true" />
                  <span>Copy Path</span>
                </ContextMenuItem>
                <template v-if="entry.kind === 'file'">
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    :disabled="!canMutateEntry(entry)"
                    @select="emit('intent', { type: 'duplicate-entry', path: entry.path })"
                  >
                    <Icon :icon="Copy" class="finder__context-icon" :size="15" aria-hidden="true" />
                    <span>Duplicate</span>
                  </ContextMenuItem>
                </template>
                <ContextMenuSeparator />
                <ContextMenuItem
                  :disabled="!canMutateEntry(entry)"
                  @select="emit('intent', { type: 'request-delete', path: entry.path })"
                >
                  <Icon :icon="Trash2" class="finder__context-icon" :size="15" aria-hidden="true" />
                  <span>Delete...</span>
                </ContextMenuItem>
              </template>
            </ContextMenu>
          </div>
        </ScrollArea>
      </section>
    </template>
    <template #items>
      <ContextMenuItem
        :disabled="state.mutationDisabled"
        @select="emit('intent', { type: 'create-folder' })"
      >
        <Icon :icon="FolderPlus" class="finder__context-icon" :size="15" aria-hidden="true" />
        <span>New Folder</span>
      </ContextMenuItem>
      <ContextMenuItem @select="emit('intent', { type: 'refresh' })">
        <Icon :icon="RefreshCw" class="finder__context-icon" :size="15" aria-hidden="true" />
        <span>Refresh</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @select="emit('intent', { type: 'copy-path', path: state.cwd })">
        <Icon :icon="Copy" class="finder__context-icon" :size="15" aria-hidden="true" />
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
