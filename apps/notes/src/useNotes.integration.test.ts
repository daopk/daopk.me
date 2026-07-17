import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineVaporComponent } from "vue";

import "fake-indexeddb/auto";

import { usePermissionStore } from "~/core/permissions/PermissionStore";
import { VFS_IDB_DB_NAME } from "~/core/storage/constants";
import { kernel } from "~/core/kernel";
import type { AppManifest } from "~/types/app";
import type { KernelVfsDirectoryOptions, KernelVfsWriteOptions } from "~/types/kernel";

import { useNotes } from "./useNotes";
import type { NotesVfsClient } from "./useNotes";

// Minimal manifest: this test drives `useNotes` directly against the kernel
// VFS, so it only needs a registered `notes` handle for permission scoping —
// not the real (now independently-built) app component.
const NotesTestIcon = defineVaporComponent(() => document.createElement("svg"));
const NotesTestStub = defineVaporComponent(() => document.createElement("div"));

const notesManifest: AppManifest = {
  id: "notes",
  name: "Notes",
  version: "1.0.0",
  icon: NotesTestIcon,
  category: "productivity",
  permissions: ["vfs.read", "vfs.write"],
  component: () => Promise.resolve({ default: NotesTestStub }),
};

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
    request.onsuccess = () => resolve();
  });
}

async function bootNotesHandle(): Promise<string> {
  setActivePinia(createPinia());
  await kernel.init();
  kernel.apps.register(notesManifest);
  usePermissionStore().set("notes", "vfs.read", true);
  usePermissionStore().set("notes", "vfs.write", true);
  return (await kernel.apps.launch("notes")).id;
}

function clientFor(handleId: string): NotesVfsClient {
  const access = { handleId };

  return {
    list: (path) => kernel.vfs.list(path, access),
    readText: (path) => kernel.vfs.readText(path, access),
    writeText: (path, text, options?: Omit<KernelVfsWriteOptions, "handleId">) =>
      kernel.vfs.writeText(path, text, { ...options, ...access }),
    mkdir: (path, options?: Omit<KernelVfsDirectoryOptions, "handleId">) =>
      kernel.vfs.mkdir(path, { ...options, ...access }),
    remove: (path) => kernel.vfs.remove(path, access),
    moveToTrash: (path) => kernel.trash.moveToTrash(path, access),
  };
}

describe("Notes VFS persistence", () => {
  beforeEach(async () => {
    localStorage.clear();
    await deleteDatabase(VFS_IDB_DB_NAME);
  });

  afterEach(async () => {
    kernel.dispose();
    localStorage.clear();
    await deleteDatabase(VFS_IDB_DB_NAME);
  });

  it("persists a created note across kernel reload", async () => {
    const firstHandle = await bootNotesHandle();
    const firstNotes = useNotes({
      vfs: clientFor(firstHandle),
      now: () => new Date(2026, 4, 21, 10, 9, 8),
      debounceMs: 1,
    });

    await expect(firstNotes.loadNotes()).resolves.toBe(true);
    await expect(firstNotes.createNote()).resolves.toBe(true);
    firstNotes.setTitle("Persisted note");
    firstNotes.setDraft("Reloaded from IndexedDB.");
    await expect(firstNotes.flushAutosave()).resolves.toBe(true);
    firstNotes.dispose();
    kernel.dispose();

    const secondHandle = await bootNotesHandle();
    const secondNotes = useNotes({ vfs: clientFor(secondHandle) });

    await expect(secondNotes.loadNotes()).resolves.toBe(true);

    expect(secondNotes.notes.value).toHaveLength(1);
    expect(secondNotes.title.value).toBe("Persisted note");
    expect(secondNotes.draft.value).toBe("Reloaded from IndexedDB.");
    secondNotes.dispose();
  });
});
