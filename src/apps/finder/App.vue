<script setup lang="ts">
import { AppFrame, Progress } from "@daopk/kit";

import FinderDeleteDialog from "./components/FinderDeleteDialog.vue";
import FinderEntries from "./components/FinderEntries.vue";
import FinderPreviewPane from "./components/FinderPreviewPane.vue";
import FinderToolbar from "./components/FinderToolbar.vue";
import { useFinderController } from "./composables/useFinderController";

const controller = useFinderController();
const { finder, preview } = controller;
const {
  activeDescendant,
  cancelDeleteEntry,
  confirmDeleteEntry,
  copyPath,
  createFolder,
  deleteDescription,
  deleteDialogOpen,
  deletingEntry,
  duplicateEntry,
  isMobile,
  mutationDisabled,
  onBreadcrumb,
  onEntryClick,
  onEntryContextMenu,
  onEntryDoubleClick,
  openEntry,
  openSelectedEntry,
  openWithSuggestion,
  requestDeleteEntry,
} = controller;

const {
  breadcrumbs,
  cwd,
  entries,
  error,
  loading,
  loadingPath,
  selectedEntry,
  selectedPath,
  viewMode,
} = finder;
const {
  html: previewHtml,
  imageUrl: previewImageUrl,
  kind: previewKind,
  loading: previewLoading,
  message: previewMessage,
  path: previewPath,
  text: previewText,
  title: previewTitle,
} = preview;
</script>

<template>
  <AppFrame as="section" class="finder" layout="flex-column" aria-label="Finder">
    <div class="finder__chrome">
      <FinderToolbar
        :breadcrumbs="breadcrumbs"
        :cwd="cwd"
        :view-mode="viewMode"
        @breadcrumb="onBreadcrumb"
        @go-up="finder.goUp"
        @refresh="finder.refresh"
        @set-view-mode="finder.setViewMode"
      />
      <Progress
        v-if="loading"
        class="finder__loading-bar"
        :value="null"
        size="sm"
        label="Loading folder"
      />
    </div>

    <div class="finder__body">
      <FinderEntries
        :active-descendant="activeDescendant"
        :cwd="cwd"
        :entries="entries"
        :error="error"
        :loading="loading"
        :loading-path="loadingPath"
        :mutation-disabled="mutationDisabled"
        :selected-path="selectedPath"
        :view-mode="viewMode"
        @copy-path="copyPath"
        @create-folder="createFolder"
        @duplicate-entry="duplicateEntry"
        @entry-click="onEntryClick"
        @entry-context-menu="onEntryContextMenu"
        @entry-double-click="onEntryDoubleClick"
        @go-up="finder.goUp"
        @move-selection="finder.moveSelection"
        @open-entry="openEntry"
        @open-with-suggestion="openWithSuggestion"
        @open-selected="openSelectedEntry"
        @refresh="finder.refresh"
        @request-delete-entry="requestDeleteEntry"
        @select-by-index="finder.selectByIndex"
      />

      <FinderPreviewPane
        v-if="!isMobile"
        :html="previewHtml"
        :image-url="previewImageUrl"
        :kind="previewKind"
        :loading="previewLoading"
        :message="previewMessage"
        :path="previewPath"
        :selected-entry="selectedEntry"
        :text="previewText"
        :title="previewTitle"
      />
    </div>

    <FinderDeleteDialog
      :description="deleteDescription"
      :loading="deletingEntry"
      :open="deleteDialogOpen"
      @cancel="cancelDeleteEntry"
      @confirm="confirmDeleteEntry"
    />
  </AppFrame>
</template>

<style scoped lang="scss">
.finder {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-size: 13px;
  inline-size: 100%;
  min-block-size: 0;
}

.finder__chrome {
  flex: 0 0 auto;
  position: relative;
}

.finder__loading-bar {
  border-radius: 0;
  inset-block-end: 0;
  inset-inline: 0;
  position: absolute;
}

.finder__body {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 32%);
  min-block-size: 0;
}

@media (max-width: 640px) {
  .finder__body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
  }
}
</style>
