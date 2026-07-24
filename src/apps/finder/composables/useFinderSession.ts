import { computed, inject, onMounted, onScopeDispose, ref, watch, type ComputedRef } from "vue";

import {
  AppContextInjectionKey,
  isEditableVfsTextFile,
  useKernel,
  useVfs,
  type VfsDirEntry,
} from "@daopk/sdk";
import { useToast } from "@daopk/ui";

import { useActiveShell } from "~/composables/useActiveShell";

import {
  openSuggestionsForEntry,
  type FinderOpenSuggestion,
  type FinderOpenSuggestionId,
} from "../utils/openSuggestions";
import { useFinder, type FinderBreadcrumb, type FinderViewMode } from "./useFinder";
import { useFinderPreview, type FinderPreviewKind } from "./useFinderPreview";

export interface FinderToolbarState {
  readonly breadcrumbs: readonly FinderBreadcrumb[];
  readonly cwd: string;
  readonly viewMode: FinderViewMode;
}

export interface FinderEntriesState {
  readonly activeDescendant?: string;
  readonly cwd: string;
  readonly entries: readonly VfsDirEntry[];
  readonly error: string | null;
  readonly loadingPath: string | null;
  readonly mutationDisabled: boolean;
  readonly selectedPath: string | null;
  readonly viewMode: FinderViewMode;
}

export interface FinderPreviewPaneState {
  readonly html: string;
  readonly imageUrl: string;
  readonly kind: FinderPreviewKind;
  readonly loading: boolean;
  readonly message: string;
  readonly path: string | null;
  readonly selectedEntry: VfsDirEntry | null;
  readonly text: string;
  readonly title: string;
}

export interface FinderDeleteConfirmationState {
  readonly description: string;
  readonly loading: boolean;
  readonly open: boolean;
}

export interface FinderSessionState {
  readonly deleteConfirmation: FinderDeleteConfirmationState;
  readonly entries: FinderEntriesState;
  readonly loading: boolean;
  readonly previewPane: FinderPreviewPaneState | null;
  readonly toolbar: FinderToolbarState;
}

export type FinderSessionIntent =
  | { readonly type: "cancel-delete" }
  | { readonly type: "confirm-delete" }
  | { readonly type: "copy-path"; readonly path: string }
  | { readonly type: "create-folder" }
  | { readonly type: "duplicate-entry"; readonly path: string }
  | { readonly type: "go-up" }
  | { readonly type: "move-selection"; readonly delta: number }
  | { readonly type: "navigate"; readonly path: string }
  | { readonly type: "open-entry"; readonly path: string }
  | {
      readonly type: "open-with-suggestion";
      readonly path: string;
      readonly suggestionId: FinderOpenSuggestionId;
    }
  | { readonly type: "open-selected-entry" }
  | { readonly type: "refresh" }
  | { readonly type: "request-delete"; readonly path: string }
  | { readonly type: "select-by-index"; readonly index: number }
  | { readonly type: "select-entry"; readonly path: string }
  | { readonly type: "set-view-mode"; readonly viewMode: FinderViewMode };

export interface FinderSession {
  readonly state: ComputedRef<FinderSessionState>;
  send(intent: FinderSessionIntent): void;
}

/**
 * Owns Finder interaction policy. The app renders the published state and
 * translates UI events into intents; navigation, selection, preview, opening,
 * clipboard feedback, and delete confirmation stay behind this interface.
 */
export function useFinderSession(): FinderSession {
  const ctx = inject(AppContextInjectionKey, null);
  const kernel = useKernel();
  const vfs = useVfs();
  const { isMobile } = useActiveShell();
  const toast = useToast();
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
  const pendingDeleteEntry = ref<VfsDirEntry | null>(null);
  const deletingEntry = ref(false);

  const mutationDisabled = computed(
    () => finder.loading.value || finder.mutating.value || finder.currentDirectoryReadonly.value,
  );
  const deleteDescription = computed(() => {
    const entry = pendingDeleteEntry.value;
    return entry === null
      ? "The item can be restored from Trash."
      : `Move "${entry.name}" to Trash?`;
  });

  const state = computed<FinderSessionState>(() => ({
    loading: finder.loading.value,
    toolbar: {
      breadcrumbs: finder.breadcrumbs.value,
      cwd: finder.cwd.value,
      viewMode: finder.viewMode.value,
    },
    entries: {
      activeDescendant:
        finder.selectedIndex.value < 0 ? undefined : `finder-entry-${finder.selectedIndex.value}`,
      cwd: finder.cwd.value,
      entries: finder.entries.value,
      error: finder.error.value,
      loadingPath: finder.loadingPath.value,
      mutationDisabled: mutationDisabled.value,
      selectedPath: finder.selectedPath.value,
      viewMode: finder.viewMode.value,
    },
    previewPane: isMobile.value
      ? null
      : {
          html: preview.html.value,
          imageUrl: preview.imageUrl.value,
          kind: preview.kind.value,
          loading: preview.loading.value,
          message: preview.message.value,
          path: preview.path.value,
          selectedEntry: finder.selectedEntry.value,
          text: preview.text.value,
          title: preview.title.value,
        },
    deleteConfirmation: {
      description: deleteDescription.value,
      loading: deletingEntry.value,
      open: pendingDeleteEntry.value !== null,
    },
  }));

  const stopRevealRequests = kernel.events.on("finder.reveal.requested", (payload) => {
    void finder.reveal(payload.path, payload.reveal);
  });

  onMounted(() => {
    void finder.refresh();
  });
  onScopeDispose(stopRevealRequests);

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

  function entryAt(path: string): VfsDirEntry | undefined {
    return finder.entries.value.find((entry) => entry.path === path);
  }

  function openEntry(path: string): void {
    const entry = entryAt(path);
    if (entry === undefined) {
      return;
    }
    if (entry.kind === "directory") {
      void finder.openDirectory(entry.path);
      return;
    }

    const suggestion = openSuggestionsForEntry(entry)[0];
    if (suggestion !== undefined) {
      openResolvedSuggestion(entry, suggestion);
    }
  }

  function openSelectedEntry(): void {
    const entry = finder.selectedEntry.value;
    if (entry !== null) {
      openEntry(entry.path);
    }
  }

  function openWithSuggestion(path: string, suggestionId: FinderOpenSuggestionId): void {
    const entry = entryAt(path);
    if (entry === undefined) {
      return;
    }

    const suggestion = openSuggestionsForEntry(entry).find((item) => item.id === suggestionId);
    if (suggestion !== undefined) {
      openResolvedSuggestion(entry, suggestion);
    }
  }

  function openResolvedSuggestion(entry: VfsDirEntry, suggestion: FinderOpenSuggestion): void {
    if (suggestion.id === "editor") {
      if (entry.kind === "file" && isEditableVfsTextFile(entry)) {
        kernel.events.emit("editor.open.requested", {
          source: "api",
          path: entry.path,
        });
      }
      return;
    }
    if (suggestion.id === "pdf-viewer") {
      kernel.events.emit("pdf-viewer.open.requested", {
        source: "api",
        path: entry.path,
      });
      return;
    }
    if (
      suggestion.id === "blog" &&
      typeof suggestion.args.path === "string" &&
      typeof suggestion.args.slug === "string"
    ) {
      kernel.events.emit("blog.post.open.requested", {
        source: "api",
        path: suggestion.args.path,
        slug: suggestion.args.slug,
      });
      return;
    }

    kernel.events.emit("app.launch.requested", {
      manifestId: suggestion.manifestId,
      source: "api",
      args: suggestion.args,
    });

    if (suggestion.id === "notes" && typeof suggestion.args.path === "string") {
      kernel.events.emit("notes.open.requested", {
        source: "api",
        path: suggestion.args.path,
      });
    }
  }

  async function copyPath(path: string): Promise<void> {
    const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
    if (clipboard === null || clipboard === undefined) {
      finder.setError("Clipboard is unavailable.");
      return;
    }

    try {
      await clipboard.writeText(path);
      finder.setError(null);
      toast.info({ title: "Path copied", description: path });
    } catch {
      finder.setError("Finder could not copy the path.");
    }
  }

  function requestDelete(path: string): void {
    const entry = entryAt(path);
    if (entry === undefined || mutationDisabled.value || entry.readonly) {
      return;
    }
    pendingDeleteEntry.value = entry;
  }

  function cancelDelete(): void {
    if (!deletingEntry.value) {
      pendingDeleteEntry.value = null;
    }
  }

  async function confirmDelete(): Promise<void> {
    const entry = pendingDeleteEntry.value;
    if (entry === null || deletingEntry.value) {
      return;
    }

    deletingEntry.value = true;
    try {
      const moved = await finder.deleteEntry(entry.path);
      if (moved) {
        toast.success({
          title: "Moved to Trash",
          description: `"${entry.name}" moved to Trash.`,
        });
      }
    } finally {
      deletingEntry.value = false;
      pendingDeleteEntry.value = null;
    }
  }

  function send(intent: FinderSessionIntent): void {
    switch (intent.type) {
      case "cancel-delete":
        cancelDelete();
        break;
      case "confirm-delete":
        void confirmDelete();
        break;
      case "copy-path":
        void copyPath(intent.path);
        break;
      case "create-folder":
        void finder.createFolder();
        break;
      case "duplicate-entry":
        void finder.duplicateFile(intent.path);
        break;
      case "go-up":
        void finder.goUp();
        break;
      case "move-selection":
        finder.moveSelection(intent.delta);
        break;
      case "navigate":
        void finder.openDirectory(intent.path);
        break;
      case "open-entry":
        openEntry(intent.path);
        break;
      case "open-selected-entry":
        openSelectedEntry();
        break;
      case "open-with-suggestion":
        openWithSuggestion(intent.path, intent.suggestionId);
        break;
      case "refresh":
        void finder.refresh();
        break;
      case "request-delete":
        requestDelete(intent.path);
        break;
      case "select-by-index":
        finder.selectByIndex(intent.index);
        break;
      case "select-entry":
        finder.select(intent.path);
        break;
      case "set-view-mode":
        finder.setViewMode(intent.viewMode);
        break;
    }
  }

  return { state, send };
}
