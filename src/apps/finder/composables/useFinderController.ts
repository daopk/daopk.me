import { computed, inject, onMounted, onUnmounted, watch, type ComputedRef } from "vue";

import { AppContextInjectionKey, useKernel, useVfs, type VfsDirEntry } from "@daopk/sdk";

import { useActiveShell } from "~/composables/useActiveShell";

import { useFinderClipboard, type FinderClipboardBindings } from "./useFinderClipboard";
import { useFinderDeleteDialog, type FinderDeleteDialogBindings } from "./useFinderDeleteDialog";
import { useFinder, type FinderBindings } from "./useFinder";
import { useFinderOpenActions, type FinderOpenActionBindings } from "./useFinderOpenActions";
import { useFinderPreview, type FinderPreviewBindings } from "./useFinderPreview";

export interface FinderControllerBindings
  extends FinderClipboardBindings, FinderDeleteDialogBindings, FinderOpenActionBindings {
  readonly activeDescendant: ComputedRef<string | undefined>;
  readonly finder: FinderBindings;
  readonly isMobile: ComputedRef<boolean>;
  readonly mutationDisabled: ComputedRef<boolean>;
  readonly preview: FinderPreviewBindings;
  createFolder(): void;
  duplicateEntry(entry: VfsDirEntry): void;
  onBreadcrumb(path: string): void;
  onEntryClick(entry: VfsDirEntry): void;
  onEntryContextMenu(entry: VfsDirEntry): void;
  onEntryDoubleClick(entry: VfsDirEntry): void;
}

export function useFinderController(): FinderControllerBindings {
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
  const openActions = useFinderOpenActions({ events: kernel.events, finder });
  const clipboard = useFinderClipboard({ finder });
  const deleteDialog = useFinderDeleteDialog({ deleteEntry: finder.deleteEntry });

  const activeDescendant = computed(() =>
    finder.selectedIndex.value < 0 ? undefined : `finder-entry-${finder.selectedIndex.value}`,
  );
  const mutationDisabled = computed(
    () => finder.loading.value || finder.mutating.value || finder.currentDirectoryReadonly.value,
  );

  const stopRevealRequests = kernel.events.on("finder.reveal.requested", (payload) => {
    void finder.reveal(payload.path, payload.reveal);
  });

  onMounted(() => {
    void finder.refresh();
  });

  onUnmounted(() => {
    stopRevealRequests();
  });

  watch(
    [finder.selectedEntry, isMobile],
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
    openActions.openEntry(entry);
  }

  function onBreadcrumb(path: string): void {
    void finder.openDirectory(path);
  }

  function duplicateEntry(entry: VfsDirEntry): void {
    if (entry.kind !== "file") {
      return;
    }

    void finder.duplicateFile(entry.path);
  }

  function createFolder(): void {
    void finder.createFolder();
  }

  return {
    ...clipboard,
    ...deleteDialog,
    ...openActions,
    activeDescendant,
    finder,
    isMobile,
    mutationDisabled,
    preview,
    createFolder,
    duplicateEntry,
    onBreadcrumb,
    onEntryClick,
    onEntryContextMenu,
    onEntryDoubleClick,
  };
}
