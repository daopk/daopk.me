<script setup vapor lang="ts">
import { onBeforeUnmount, useId } from "vue";

import {
  AppFrame,
  AppToolbar,
  DataTable,
  EmptyState,
  GroupLabel,
  ScrollArea,
  Spinner,
} from "~/components/kit";
import { Alert, Button, Modal } from "~/components/ui";
import { AlertCircle, RefreshCw, RotateCw, Trash2 } from "~/icons/lucide";
import { formatBytes } from "~/utils/format";

import { useTrashApp } from "./useTrashApp";

const DIALOG_CONTENT_BASE_Z_INDEX = 1601;
const modalIdBase = useId();
const permanentDeleteModalId = `trash-permanent-delete-${modalIdBase}`;
const emptyTrashModalId = `trash-empty-${modalIdBase}`;
const modalFocusTrapOptions = {
  tabbableOptions: { displayCheck: "none" as const },
};
const modalOverlayProps = {
  color: "color-mix(in oklab, var(--color-bg) 60%, transparent)",
};

onBeforeUnmount(() => {
  const portalRoots = [permanentDeleteModalId, emptyTrashModalId]
    .map((id) => document.getElementById(id)?.parentElement)
    .filter((element): element is HTMLElement => element instanceof HTMLElement);
  queueMicrotask(() => portalRoots.forEach((root) => root.remove()));
});

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
          <Button size="sm" :loading="loading" @click="refresh">
            <template #left><RefreshCw aria-hidden="true" /></template>
            Refresh
          </Button>
          <Button
            size="sm"
            variant="solid"
            color="red"
            :disabled="!hasItems"
            :loading="emptying"
            @click="requestEmptyTrash"
          >
            <template #left><Trash2 aria-hidden="true" /></template>
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
      <Alert v-if="error" class="trash__notice" color="red" variant="surface" role="alert">
        <template #icon><AlertCircle class="trash__notice-icon" aria-hidden="true" /></template>
        <span>{{ error }}</span>
      </Alert>

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
                  :loading="mutatingId === item.id"
                  :disabled="emptying"
                  @click="restore(item)"
                >
                  <template #left><RotateCw aria-hidden="true" /></template>
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="solid"
                  color="red"
                  :aria-label="`Delete ${item.name} permanently`"
                  :loading="mutatingId === item.id"
                  :disabled="emptying"
                  @click="requestRemovePermanently(item)"
                >
                  <template #left><Trash2 aria-hidden="true" /></template>
                  Delete...
                </Button>
              </span>
            </span>
          </div>
        </DataTable>
      </ScrollArea>
    </main>

    <Modal
      :id="permanentDeleteModalId"
      v-model:open="permanentDeleteDialogOpen"
      title="Delete permanently?"
      :description="permanentDeleteDescription"
      size="420px"
      :base-z-index="DIALOG_CONTENT_BASE_Z_INDEX"
      :close-on-overlay-click="mutatingId === null"
      :close-on-escape="mutatingId === null"
      :show-close-button="false"
      :focus-trap-options="modalFocusTrapOptions"
      :overlay-props="modalOverlayProps"
      @close="cancelPermanentDelete"
    >
      <template #footer>
        <Button size="sm" :disabled="mutatingId !== null" @click="cancelPermanentDelete">
          Cancel
        </Button>
        <Button
          size="sm"
          variant="solid"
          color="red"
          :loading="mutatingId === pendingPermanentDelete?.id"
          @click="confirmRemovePermanently"
        >
          <template #left><Trash2 aria-hidden="true" /></template>
          Delete Permanently
        </Button>
      </template>
    </Modal>

    <Modal
      :id="emptyTrashModalId"
      v-model:open="emptyDialogOpen"
      title="Empty Trash?"
      :description="emptyDialogDescription"
      size="420px"
      :base-z-index="DIALOG_CONTENT_BASE_Z_INDEX"
      :close-on-overlay-click="!emptying"
      :close-on-escape="!emptying"
      :show-close-button="false"
      :focus-trap-options="modalFocusTrapOptions"
      :overlay-props="modalOverlayProps"
      @close="cancelEmptyTrash"
    >
      <template #footer>
        <Button size="sm" :disabled="emptying" @click="cancelEmptyTrash">Cancel</Button>
        <Button
          size="sm"
          variant="solid"
          color="red"
          :loading="emptying"
          @click="confirmEmptyTrash"
        >
          <template #left><Trash2 aria-hidden="true" /></template>
          Empty Trash
        </Button>
      </template>
    </Modal>
  </AppFrame>
</template>

<style scoped lang="scss" src="./styles/trash-app.scss"></style>
