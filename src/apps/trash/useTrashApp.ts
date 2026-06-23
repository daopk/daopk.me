import { computed, inject, onMounted, onUnmounted, ref, type Component } from "vue";

import { useKernel } from "~/composables/useKernel";
import { FinderFileIcon, FinderFolderIcon } from "~/icons/fluentColor";
import { AppContextInjectionKey } from "~/types/app";
import type { TrashItem } from "~/types/trash";
import { toErrorMessage } from "~/utils/errors";
import { formatDateTime } from "~/utils/format";

export function useTrashApp() {
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

  return {
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
    itemCountLabel,
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
  };
}
