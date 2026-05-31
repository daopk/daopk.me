<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, type Component } from "vue";

import { AppFrame, AppToolbar, DataTable, EmptyState, StatusBanner } from "~/components/kit";
import { Button, Dialog } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { AlertCircle, RefreshCw, RotateCw, Trash2 } from "~/icons/lucide";
import { FinderFileIcon, FinderFolderIcon } from "~/icons/fluentColor";
import { toErrorMessage } from "~/utils/errors";
import { formatBytes, formatDateTime } from "~/utils/format";
import { AppContextInjectionKey } from "~/types/app";
import type { TrashItem } from "~/types/trash";

const kernel = useKernel();
const ctx = inject(AppContextInjectionKey, null);
const items = ref<readonly TrashItem[]>([]);
const loading = ref(false);
const mutatingId = ref<string | null>(null);
const emptying = ref(false);
const error = ref<string | null>(null);
const pendingPermanentDelete = ref<TrashItem | null>(null);
const permanentDeleteDialogOpen = ref(false);
const emptyDialogOpen = ref(false);

const stopTrashChanges = kernel.events.on("trash.changed", () => {
  void refresh();
});

const hasItems = computed(() => items.value.length > 0);
const sortedItems = computed(() =>
  [...items.value].sort((a, b) => b.deletedAt - a.deletedAt || a.name.localeCompare(b.name)),
);
const fileCount = computed(() => items.value.filter((item) => item.kind === "file").length);
const folderCount = computed(() => items.value.length - fileCount.value);
const totalBytes = computed(() =>
  items.value.reduce((total, item) => total + (item.kind === "file" ? item.size : 0), 0),
);
const itemCountLabel = computed(
  () => `${items.value.length} item${items.value.length === 1 ? "" : "s"}`,
);
const permanentDeleteDescription = computed(() => {
  const item = pendingPermanentDelete.value;
  if (item === null) {
    return "This item will be deleted permanently. This cannot be undone.";
  }

  return `Permanently delete "${item.name}"? This cannot be undone.`;
});
const emptyDialogDescription = computed(
  () =>
    `Permanently delete ${itemCountLabel.value.toLowerCase()} from Trash? This cannot be undone.`,
);

onMounted(() => {
  void refresh();
});

onUnmounted(() => {
  stopTrashChanges();
});

async function refresh(): Promise<void> {
  const handleId = ctx?.handleId;
  if (handleId === undefined) {
    error.value = "Trash is missing its app context.";
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const next = await kernel.trash.list({ handleId });
    if (next === null) {
      error.value = "Trash does not have permission to read deleted items.";
      return;
    }

    items.value = next;
  } catch (refreshError) {
    error.value = toErrorMessage(refreshError);
  } finally {
    loading.value = false;
  }
}

async function restore(item: TrashItem): Promise<void> {
  const handleId = ctx?.handleId;
  if (handleId === undefined || mutatingId.value !== null || emptying.value) {
    return;
  }

  mutatingId.value = item.id;
  error.value = null;
  try {
    const restored = await kernel.trash.restore(item.id, { handleId });
    if (!restored) {
      error.value = "Trash could not restore this item.";
    }
  } catch (restoreError) {
    error.value = toErrorMessage(restoreError);
  } finally {
    mutatingId.value = null;
    await refresh();
  }
}

function requestRemovePermanently(item: TrashItem): void {
  if (mutatingId.value !== null || emptying.value) {
    return;
  }

  pendingPermanentDelete.value = item;
  permanentDeleteDialogOpen.value = true;
}

function cancelPermanentDelete(): void {
  if (mutatingId.value !== null) {
    return;
  }

  permanentDeleteDialogOpen.value = false;
  pendingPermanentDelete.value = null;
}

async function confirmRemovePermanently(): Promise<void> {
  const item = pendingPermanentDelete.value;
  if (item === null || mutatingId.value !== null || emptying.value) {
    return;
  }

  await removePermanently(item);
  permanentDeleteDialogOpen.value = false;
  pendingPermanentDelete.value = null;
}

async function removePermanently(item: TrashItem): Promise<void> {
  const handleId = ctx?.handleId;
  if (handleId === undefined || mutatingId.value !== null || emptying.value) {
    return;
  }

  mutatingId.value = item.id;
  error.value = null;
  try {
    const removed = await kernel.trash.remove(item.id, { handleId });
    if (!removed) {
      error.value = "Trash could not delete this item permanently.";
    }
  } catch (removeError) {
    error.value = toErrorMessage(removeError);
  } finally {
    mutatingId.value = null;
    await refresh();
  }
}

function requestEmptyTrash(): void {
  if (!hasItems.value || emptying.value || mutatingId.value !== null) {
    return;
  }

  emptyDialogOpen.value = true;
}

function cancelEmptyTrash(): void {
  if (emptying.value) {
    return;
  }

  emptyDialogOpen.value = false;
}

async function confirmEmptyTrash(): Promise<void> {
  if (emptying.value || mutatingId.value !== null) {
    return;
  }

  await emptyTrash();
  emptyDialogOpen.value = false;
}

async function emptyTrash(): Promise<void> {
  const handleId = ctx?.handleId;
  if (handleId === undefined || emptying.value || mutatingId.value !== null) {
    return;
  }

  emptying.value = true;
  error.value = null;
  try {
    const emptied = await kernel.trash.empty({ handleId });
    if (!emptied) {
      error.value = "Trash could not empty deleted items.";
    }
  } catch (emptyError) {
    error.value = toErrorMessage(emptyError);
  } finally {
    emptying.value = false;
    await refresh();
  }
}

function formatDeletedAt(timestamp: number): string {
  return formatDateTime(timestamp);
}

function kindLabel(item: TrashItem): string {
  return item.kind === "directory" ? "Folder" : "File";
}

function itemIcon(item: TrashItem): Component {
  return item.kind === "directory" ? FinderFolderIcon : FinderFileIcon;
}

function datetimeValue(timestamp: number): string {
  return new Date(timestamp).toISOString();
}
</script>

<template>
  <AppFrame class="trash" layout="flex-column" aria-label="Trash">
    <AppToolbar class="trash__toolbar" density="comfortable" wrap>
      <template #end>
        <div class="trash__actions">
          <Button size="sm" :icon-start="RefreshCw" :loading="loading" @click="refresh">
            Refresh
          </Button>
          <Button
            size="sm"
            variant="danger"
            :icon-start="Trash2"
            :disabled="!hasItems"
            :loading="emptying"
            @click="requestEmptyTrash"
          >
            Empty Trash...
          </Button>
        </div>
      </template>
    </AppToolbar>

    <dl v-if="hasItems" class="trash__summary" aria-label="Trash summary">
      <div>
        <dt>Items</dt>
        <dd>{{ items.length }}</dd>
      </div>
      <div>
        <dt>Files</dt>
        <dd>{{ fileCount }}</dd>
      </div>
      <div>
        <dt>Folders</dt>
        <dd>{{ folderCount }}</dd>
      </div>
      <div>
        <dt>Total size</dt>
        <dd>{{ formatBytes(totalBytes) }}</dd>
      </div>
    </dl>

    <main class="trash__content">
      <StatusBanner v-if="error" class="trash__notice" tone="error" role="alert">
        <AlertCircle class="trash__notice-icon" aria-hidden="true" />
        <span>{{ error }}</span>
      </StatusBanner>

      <EmptyState v-if="loading && items.length === 0" class="trash__state">
        Loading deleted items...
      </EmptyState>
      <EmptyState
        v-else-if="items.length === 0"
        class="trash__empty"
        title="No deleted items."
        description="Nothing to restore or remove."
      />

      <DataTable v-else class="trash__table" label="Deleted items">
        <div class="trash__row trash__row--header" role="row">
          <span role="columnheader">Name</span>
          <span role="columnheader">Original Location</span>
          <span role="columnheader">Kind</span>
          <span role="columnheader">Size</span>
          <span role="columnheader">Deleted</span>
          <span role="columnheader">Actions</span>
        </div>

        <div v-for="item in sortedItems" :key="item.id" class="trash__row" role="row">
          <span
            class="trash__cell trash__cell--name"
            role="cell"
            data-label="Name"
            :title="item.name"
          >
            <span class="trash__item-main">
              <component :is="itemIcon(item)" class="trash__item-icon" aria-hidden="true" />
              <span class="trash__item-name">{{ item.name }}</span>
            </span>
          </span>
          <span
            class="trash__cell trash__cell--path"
            role="cell"
            data-label="Original Location"
            :title="item.originalPath"
          >
            {{ item.originalPath }}
          </span>
          <span class="trash__cell trash__cell--meta" role="cell" data-label="Kind">
            {{ kindLabel(item) }}
          </span>
          <span class="trash__cell trash__cell--meta" role="cell" data-label="Size">
            {{ item.kind === "file" ? formatBytes(item.size) : "-" }}
          </span>
          <span class="trash__cell trash__cell--meta" role="cell" data-label="Deleted">
            <time :datetime="datetimeValue(item.deletedAt)">{{
              formatDeletedAt(item.deletedAt)
            }}</time>
          </span>
          <span class="trash__cell trash__cell--actions" role="cell" data-label="Actions">
            <span class="trash__item-actions">
              <Button
                size="sm"
                :icon-start="RotateCw"
                :loading="mutatingId === item.id"
                :disabled="emptying"
                @click="restore(item)"
              >
                Restore
              </Button>
              <Button
                size="sm"
                variant="danger"
                :icon-start="Trash2"
                :aria-label="`Delete ${item.name} permanently`"
                :loading="mutatingId === item.id"
                :disabled="emptying"
                @click="requestRemovePermanently(item)"
              >
                Delete...
              </Button>
            </span>
          </span>
        </div>
      </DataTable>
    </main>

    <Dialog
      v-model:open="permanentDeleteDialogOpen"
      title="Delete permanently?"
      :description="permanentDeleteDescription"
      :dismissible="mutatingId === null"
      @close="cancelPermanentDelete"
    >
      <div class="trash__dialog-actions">
        <Button size="sm" :disabled="mutatingId !== null" @click="cancelPermanentDelete">
          Cancel
        </Button>
        <Button
          size="sm"
          variant="danger"
          :icon-start="Trash2"
          :loading="mutatingId === pendingPermanentDelete?.id"
          @click="confirmRemovePermanently"
        >
          Delete Permanently
        </Button>
      </div>
    </Dialog>

    <Dialog
      v-model:open="emptyDialogOpen"
      title="Empty Trash?"
      :description="emptyDialogDescription"
      :dismissible="!emptying"
      @close="cancelEmptyTrash"
    >
      <div class="trash__dialog-actions">
        <Button size="sm" :disabled="emptying" @click="cancelEmptyTrash">Cancel</Button>
        <Button
          size="sm"
          variant="danger"
          :icon-start="Trash2"
          :loading="emptying"
          @click="confirmEmptyTrash"
        >
          Empty Trash
        </Button>
      </div>
    </Dialog>
  </AppFrame>
</template>

<style scoped lang="scss">
.trash {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-size: 13px;
  inline-size: 100%;
  min-block-size: 0;
  padding-block-end: var(--mobile-shell-app-bottom-padding, 0px);
  padding-inline-end: var(--mobile-shell-app-safe-area-right, 0px);
  padding-inline-start: var(--mobile-shell-app-safe-area-left, 0px);
}

.trash__toolbar {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-md);
  justify-content: space-between;
  min-block-size: 52px;
  padding: var(--space-sm) var(--space-md);
}

.trash__actions {
  align-items: center;
  display: inline-flex;
  gap: var(--space-xs);
}

.trash__summary {
  background: color-mix(in srgb, var(--color-fg) 3%, transparent);
  border-block-end: 1px solid var(--color-border);
  display: grid;
  flex: 0 0 auto;
  gap: 1px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

.trash__summary div {
  background: var(--color-bg);
  display: grid;
  gap: 2px;
  min-inline-size: 0;
  padding: var(--space-sm) var(--space-md);
}

.trash__summary dt {
  color: var(--color-fg-muted);
  font-size: 11px;
  margin: 0;
  text-transform: uppercase;
}

.trash__summary dd {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.trash__notice,
.trash__state,
.trash__empty {
  color: var(--color-fg-muted);
  padding: var(--space-lg);
}

.trash__notice {
  align-items: center;
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  border-block-end: 1px solid var(--color-border);
  color: var(--color-error-soft);
  display: flex;
  gap: var(--space-sm);
}

.trash__notice-icon {
  block-size: 16px;
  flex: 0 0 auto;
  inline-size: 16px;
}

.trash__empty {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}

.trash__empty h2 {
  color: var(--color-fg);
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.trash__empty p {
  margin: var(--space-xs) 0 0;
}

.trash__table {
  align-content: start;
  display: grid;
  flex: 1 1 auto;
  grid-auto-rows: minmax(46px, auto);
  min-block-size: 0;
  overflow: auto;
}

.trash__row {
  align-items: center;
  border-block-end: 1px solid var(--color-border);
  display: grid;
  gap: var(--space-sm);
  grid-template-columns:
    minmax(150px, 1.3fr) minmax(140px, 1.15fr) 52px 54px minmax(108px, 0.85fr)
    156px;
  min-inline-size: 724px;
  padding: var(--space-xs) var(--space-md);
  transition: background-color 120ms var(--ease);
}

.trash__row:hover {
  background: color-mix(in srgb, var(--color-fg) 3%, transparent);
}

.trash__row--header {
  background: color-mix(in srgb, var(--color-bg-subtle) 86%, var(--color-bg));
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

.trash__row--header:hover {
  background: color-mix(in srgb, var(--color-bg-subtle) 86%, var(--color-bg));
}

.trash__cell {
  min-inline-size: 0;
}

.trash__item-main {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.trash__item-icon {
  block-size: 22px;
  flex: 0 0 auto;
  inline-size: 22px;
}

.trash__item-name,
.trash__cell--path,
.trash__cell--meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash__item-name {
  color: var(--color-fg);
  font-weight: 600;
}

.trash__cell--path,
.trash__cell--meta {
  color: var(--color-fg-muted);
}

.trash__cell--path {
  font-family: var(--font-mono);
  font-size: 12px;
}

.trash__item-actions {
  align-items: center;
  display: inline-flex;
  gap: var(--space-xs);
  justify-content: flex-end;
  min-inline-size: max-content;
}

.trash__dialog-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
  margin-block-start: var(--space-md);
}

@media (prefers-reduced-motion: reduce) {
  .trash__row {
    transition: none;
  }
}

@media (max-width: 760px) {
  .trash__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .trash__actions {
    justify-content: flex-start;
  }

  .trash__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .trash__table {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-sm);
  }

  .trash__row {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    display: grid;
    gap: var(--space-sm);
    grid-template-columns: minmax(0, 1fr);
    min-inline-size: 0;
    padding: var(--space-sm);
  }

  .trash__row--header {
    display: none;
  }

  .trash__cell {
    align-items: start;
    display: grid;
    gap: var(--space-sm);
    grid-template-columns: 108px minmax(0, 1fr);
  }

  .trash__cell::before {
    color: var(--color-fg-muted);
    content: attr(data-label);
    font-size: 12px;
    font-weight: 600;
  }

  .trash__item-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 420px) {
  .trash__actions,
  .trash__item-actions,
  .trash__dialog-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .trash__summary {
    grid-template-columns: 1fr;
  }

  .trash__cell {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
