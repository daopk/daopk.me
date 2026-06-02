import { computed, ref, type ComputedRef, type Ref } from "vue";

import type { VfsDirEntry } from "@daopk/sdk";

export interface FinderDeleteDialogBindings {
  readonly deleteDialogOpen: Ref<boolean>;
  readonly pendingDeleteEntry: Ref<VfsDirEntry | null>;
  readonly deletingEntry: Ref<boolean>;
  readonly deleteDescription: ComputedRef<string>;
  cancelDeleteEntry(): void;
  confirmDeleteEntry(): Promise<void>;
  requestDeleteEntry(entry: VfsDirEntry): void;
}

export interface UseFinderDeleteDialogOptions {
  deleteEntry(path: string): Promise<boolean>;
}

export function useFinderDeleteDialog({
  deleteEntry,
}: UseFinderDeleteDialogOptions): FinderDeleteDialogBindings {
  const deleteDialogOpen = ref(false);
  const pendingDeleteEntry = ref<VfsDirEntry | null>(null);
  const deletingEntry = ref(false);

  const deleteDescription = computed(() => {
    const entry = pendingDeleteEntry.value;
    if (entry === null) {
      return "The item can be restored from Trash.";
    }

    return `Move "${entry.name}" to Trash?`;
  });

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
      await deleteEntry(entry.path);
    } finally {
      deletingEntry.value = false;
      deleteDialogOpen.value = false;
      pendingDeleteEntry.value = null;
    }
  }

  return {
    deleteDialogOpen,
    pendingDeleteEntry,
    deletingEntry,
    deleteDescription,
    cancelDeleteEntry,
    confirmDeleteEntry,
    requestDeleteEntry,
  };
}
