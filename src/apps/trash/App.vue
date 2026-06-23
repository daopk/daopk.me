<script setup lang="ts">
import {
  AppFrame,
  AppToolbar,
  DataTable,
  EmptyState,
  GroupLabel,
  ScrollArea,
  Spinner,
  StatusBanner,
} from "~/components/kit";
import { Button, Dialog, DialogActions } from "~/components/ui";
import { AlertCircle, RefreshCw, RotateCw, Trash2 } from "~/icons/lucide";
import { formatBytes } from "~/utils/format";

import { useTrashApp } from "./useTrashApp";

const {
  cancelEmptyTrash,
  cancelPermanentDelete,
  confirmEmptyTrash,
  confirmRemovePermanently,
  datetimeValue,
  emptyDialogDescription,
  emptyDialogOpen,
  emptying,
  error,
  fileCount,
  folderCount,
  formatDeletedAt,
  hasItems,
  itemIcon,
  items,
  kindLabel,
  loading,
  mutatingId,
  pendingPermanentDelete,
  permanentDeleteDescription,
  permanentDeleteDialogOpen,
  refresh,
  requestEmptyTrash,
  requestRemovePermanently,
  restore,
  sortedItems,
  totalBytes,
} = useTrashApp();
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
        <GroupLabel as="dt">Items</GroupLabel>
        <dd>{{ items.length }}</dd>
      </div>
      <div>
        <GroupLabel as="dt">Files</GroupLabel>
        <dd>{{ fileCount }}</dd>
      </div>
      <div>
        <GroupLabel as="dt">Folders</GroupLabel>
        <dd>{{ folderCount }}</dd>
      </div>
      <div>
        <GroupLabel as="dt">Total size</GroupLabel>
        <dd>{{ formatBytes(totalBytes) }}</dd>
      </div>
    </dl>

    <main class="trash__content">
      <StatusBanner v-if="error" class="trash__notice" tone="error" role="alert">
        <AlertCircle class="trash__notice-icon" aria-hidden="true" />
        <span>{{ error }}</span>
      </StatusBanner>

      <EmptyState v-if="loading && items.length === 0" class="trash__state">
        <template #icon><Spinner /></template>
        Loading deleted items...
      </EmptyState>
      <EmptyState
        v-else-if="items.length === 0"
        class="trash__empty"
        title="No deleted items."
        description="Nothing to restore or remove."
      />

      <ScrollArea v-else class="trash__scroll" axis="both">
        <DataTable class="trash__table" label="Deleted items">
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
      </ScrollArea>
    </main>

    <Dialog
      v-model:open="permanentDeleteDialogOpen"
      title="Delete permanently?"
      :description="permanentDeleteDescription"
      :dismissible="mutatingId === null"
      @close="cancelPermanentDelete"
    >
      <DialogActions>
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
      </DialogActions>
    </Dialog>

    <Dialog
      v-model:open="emptyDialogOpen"
      title="Empty Trash?"
      :description="emptyDialogDescription"
      :dismissible="!emptying"
      @close="cancelEmptyTrash"
    >
      <DialogActions>
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
      </DialogActions>
    </Dialog>
  </AppFrame>
</template>

<style scoped lang="scss" src="./styles/trash-app.scss"></style>
