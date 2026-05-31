<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";

import { AppFrame } from "~/components/kit";
import { Button, Dialog } from "~/components/ui";
import { useActiveShell } from "~/composables/useActiveShell";
import { useVfs } from "~/composables/useVfs";
import { useKernel } from "~/composables/useKernel";
import { isEditableVfsTextFile } from "~/core/vfs/fileTypes";
import { AppContextInjectionKey } from "~/types/app";
import type { VfsDirEntry } from "~/core/vfs/nodes";

import FinderEntries from "./components/FinderEntries.vue";
import FinderPreviewPane from "./components/FinderPreviewPane.vue";
import FinderToolbar from "./components/FinderToolbar.vue";
import { isPdfEntry, isSlideDeckEntry } from "./display";
import { openSuggestionsForEntry, type FinderOpenSuggestion } from "./openSuggestions";
import { useFinderPreview } from "./useFinderPreview";
import { useFinder } from "./useFinder";

const ctx = inject(AppContextInjectionKey, null);
const kernel = useKernel();
const vfs = useVfs();
const { isMobile } = useActiveShell();
const finder = useFinder({
  vfs,
  trash: {
    moveToTrash: (path) =>
      ctx === null
        ? Promise.resolve(null)
        : kernel.trash.moveToTrash(path, { handleId: ctx.handleId }),
  },
  initialPath: typeof ctx?.args.path === "string" ? ctx.args.path : "/",
  initialReveal: typeof ctx?.args.reveal === "string" ? ctx.args.reveal : undefined,
  autoSelectFirstEntry: computed(() => !isMobile.value),
});
const preview = useFinderPreview({ vfs });

const {
  breadcrumbs,
  cwd,
  entries,
  error,
  loading,
  selectedEntry,
  selectedIndex,
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

const deleteDialogOpen = ref(false);
const pendingDeleteEntry = ref<VfsDirEntry | null>(null);
const deletingEntry = ref(false);
const stopRevealRequests = kernel.events.on("finder.reveal.requested", (payload) => {
  void finder.reveal(payload.path, payload.reveal);
});

const activeDescendant = computed(() =>
  selectedIndex.value < 0 ? undefined : `finder-entry-${selectedIndex.value}`,
);
const mutationDisabled = computed(
  () => loading.value || finder.mutating.value || finder.currentDirectoryReadonly.value,
);
const deleteDescription = computed(() => {
  const entry = pendingDeleteEntry.value;
  if (entry === null) {
    return "The item can be restored from Trash.";
  }

  return `Move "${entry.name}" to Trash?`;
});

onMounted(() => {
  void finder.refresh();
});

onUnmounted(() => {
  stopRevealRequests?.();
});

watch(
  [selectedEntry, isMobile],
  ([entry, mobile]) => {
    void preview.load(mobile ? null : entry);
  },
  { immediate: true },
);

watch(
  isMobile,
  (mobile) => {
    if (mobile) {
      finder.select(null);
    }
  },
  { immediate: true },
);

function onEntryClick(entry: VfsDirEntry): void {
  finder.select(entry.path);
}

function onEntryContextMenu(entry: VfsDirEntry): void {
  finder.select(entry.path);
}

function onEntryDoubleClick(entry: VfsDirEntry): void {
  openEntry(entry);
}

function onBreadcrumb(path: string): void {
  void finder.openDirectory(path);
}

function openInEditor(entry: VfsDirEntry): void {
  if (entry.kind !== "file" || !isEditableVfsTextFile(entry)) {
    return;
  }

  kernel.events.emit("app.launch.requested", {
    manifestId: "editor",
    source: "api",
    args: { path: entry.path },
  });
}

function openWithSuggestion(entry: VfsDirEntry, suggestion: FinderOpenSuggestion): void {
  const currentSuggestion = openSuggestionsForEntry(entry).find(
    (item) => item.id === suggestion.id,
  );
  if (currentSuggestion === undefined) {
    return;
  }

  if (currentSuggestion.id === "editor") {
    openInEditor(entry);
    return;
  }
  if (currentSuggestion.id === "pdf-viewer") {
    openPdf(entry);
    return;
  }
  if (currentSuggestion.id === "slides") {
    openSlides(entry);
    return;
  }

  kernel.events.emit("app.launch.requested", {
    manifestId: currentSuggestion.manifestId,
    source: "api",
    args: currentSuggestion.args,
  });

  if (currentSuggestion.id === "notes" && typeof currentSuggestion.args.path === "string") {
    kernel.events.emit("notes.open.requested", {
      source: "api",
      path: currentSuggestion.args.path,
    });
  }
}

function openSelectedEntry(): void {
  const entry = selectedEntry.value;
  if (entry !== null) {
    openEntry(entry);
  }
}

function openEntry(entry: VfsDirEntry): void {
  if (entry.kind === "directory") {
    void finder.openDirectory(entry.path);
    return;
  }

  if (isPdfEntry(entry)) {
    openPdf(entry);
    return;
  }

  if (isSlideDeckEntry(entry)) {
    openSlides(entry);
  }
}

function openPdf(entry: VfsDirEntry): void {
  kernel.events.emit("app.launch.requested", {
    manifestId: "pdf-viewer",
    source: "api",
    args: { path: entry.path },
  });
}

function openSlides(entry: VfsDirEntry): void {
  if (!isSlideDeckEntry(entry)) {
    return;
  }

  kernel.events.emit("app.launch.requested", {
    manifestId: "slides",
    source: "api",
    args: { path: entry.path },
  });
  kernel.events.emit("slides.open.requested", {
    source: "api",
    path: entry.path,
  });
}

function duplicateEntry(entry: VfsDirEntry): void {
  if (entry.kind !== "file") {
    return;
  }

  void finder.duplicateFile(entry.path);
}

function requestDeleteEntry(entry: VfsDirEntry): void {
  pendingDeleteEntry.value = entry;
  deleteDialogOpen.value = true;
}

function cancelDeleteEntry(): void {
  if (deletingEntry.value) {
    return;
  }

  deleteDialogOpen.value = false;
  pendingDeleteEntry.value = null;
}

async function confirmDeleteEntry(): Promise<void> {
  if (pendingDeleteEntry.value === null || deletingEntry.value) {
    return;
  }

  const entry = pendingDeleteEntry.value;
  deletingEntry.value = true;
  try {
    await finder.deleteEntry(entry.path);
  } finally {
    deletingEntry.value = false;
    deleteDialogOpen.value = false;
    pendingDeleteEntry.value = null;
  }
}

function createFolder(): void {
  void finder.createFolder();
}

async function copyPath(path: string): Promise<void> {
  const writeText = navigator.clipboard?.writeText;
  if (writeText === undefined) {
    finder.setError("Clipboard is unavailable.");
    return;
  }

  try {
    await writeText.call(navigator.clipboard, path);
    finder.setError(null);
  } catch {
    finder.setError("Finder could not copy the path.");
  }
}
</script>

<template>
  <AppFrame as="section" class="finder" layout="flex-column" aria-label="Finder">
    <FinderToolbar
      :breadcrumbs="breadcrumbs"
      :cwd="cwd"
      :view-mode="viewMode"
      @breadcrumb="onBreadcrumb"
      @go-up="finder.goUp"
      @refresh="finder.refresh"
      @set-view-mode="finder.setViewMode"
    />

    <div class="finder__body">
      <FinderEntries
        :active-descendant="activeDescendant"
        :cwd="cwd"
        :entries="entries"
        :error="error"
        :loading="loading"
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

    <Dialog
      v-model:open="deleteDialogOpen"
      title="Move item to Trash?"
      :description="deleteDescription"
      @close="cancelDeleteEntry"
    >
      <div class="finder__dialog-actions">
        <Button size="sm" :disabled="deletingEntry" @click="cancelDeleteEntry">Cancel</Button>
        <Button size="sm" variant="primary" :loading="deletingEntry" @click="confirmDeleteEntry">
          Move to Trash
        </Button>
      </div>
    </Dialog>
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

.finder__body {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 32%);
  min-block-size: 0;
}

.finder__dialog-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .finder__body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
  }
}
</style>
