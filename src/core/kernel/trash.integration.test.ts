import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, markRaw } from "vue";

import "fake-indexeddb/auto";

import { usePermissionStore } from "~/core/permissions/PermissionStore";
import { profileIdbName } from "~/core/profile/storageScope";
import { basename, normalizeVfsPath } from "~/core/vfs/path";
import type { AppManifest } from "~/types/app";

import { kernel } from "./index";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon = markRaw(defineVaporComponent(() => document.createElement("svg")));
let counter = 0;

function makeManifest(id: string, category: AppManifest["category"]): AppManifest {
  return {
    id,
    name: id,
    icon: StubIcon,
    category,
    component: () => Promise.resolve({ default: StubIcon }),
  };
}

function uniquePath(name: string): string {
  counter += 1;
  return `/home/trash-${Date.now()}-${counter}-${name}`;
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
    request.onsuccess = () => resolve();
  });
}

async function launchApp(id: string, category: AppManifest["category"]): Promise<string> {
  kernel.apps.register(
    makeManifest(id, category),
    category === "system" ? { source: "system" } : undefined,
  );
  return (await kernel.apps.launch(id)).id;
}

async function clearProfileDatabases(): Promise<void> {
  await Promise.all([
    deleteDatabase(profileIdbName("test-profile", "vfs")),
    deleteDatabase(profileIdbName("test-profile", "trash")),
  ]);
}

describe("kernel.trash", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await clearProfileDatabases();
    await kernel.init();
  });

  afterEach(async () => {
    kernel.dispose();
    localStorage.clear();
    await clearProfileDatabases();
  });

  it("moves files into Trash and emits source removal + trash events", async () => {
    const handleId = await launchApp("system-trash-file", "system");
    const path = uniquePath("file.txt");
    const vfsEvents: unknown[] = [];
    const trashEvents: unknown[] = [];
    const stopVfs = kernel.events.on("vfs.changed", (payload) => {
      vfsEvents.push(payload);
    });
    const stopTrash = kernel.events.on("trash.changed", (payload) => {
      trashEvents.push(payload);
    });

    await kernel.vfs.writeText(path, "hello trash", {
      handleId,
      mimeType: "text/plain;charset=utf-8",
    });
    const item = await kernel.trash.moveToTrash(path, { handleId });

    expect(item).toEqual(
      expect.objectContaining({
        name: basename(normalizeVfsPath(path)),
        originalPath: path,
        kind: "file",
        size: "hello trash".length,
      }),
    );
    await expect(kernel.vfs.stat(path, { handleId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(kernel.trash.list({ handleId })).resolves.toEqual([
      expect.objectContaining({ id: item!.id, originalPath: path }),
    ]);
    expect(vfsEvents).toContainEqual({ path, operation: "remove" });
    expect(trashEvents).toContainEqual(
      expect.objectContaining({ operation: "move", id: item!.id, originalPath: path }),
    );

    stopVfs();
    stopTrash();
  });

  it("restores folders and preserves nested file contents", async () => {
    const handleId = await launchApp("system-trash-folder", "system");
    const dir = uniquePath("folder");
    const nested = `${dir}/notes/a.md`;

    await kernel.vfs.mkdir(`${dir}/notes`, { handleId, recursive: true });
    await kernel.vfs.writeText(nested, "# Restored\n\nBody", {
      handleId,
      mimeType: "text/markdown;charset=utf-8",
    });
    const item = await kernel.trash.moveToTrash(dir, { handleId });

    await expect(kernel.vfs.stat(dir, { handleId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(kernel.trash.restore(item!.id, { handleId })).resolves.toBe(true);
    await expect(kernel.vfs.readText(nested, { handleId })).resolves.toBe("# Restored\n\nBody");
    await expect(kernel.trash.list({ handleId })).resolves.toEqual([]);
  });

  it("restores conflicts by keeping both files", async () => {
    const handleId = await launchApp("system-trash-conflict", "system");
    const path = uniquePath("conflict.txt");
    const restoredPath = path.replace(/\.txt$/, " restored.txt");

    await kernel.vfs.writeText(path, "old", { handleId });
    const item = await kernel.trash.moveToTrash(path, { handleId });
    await kernel.vfs.writeText(path, "new", { handleId });

    await expect(kernel.trash.restore(item!.id, { handleId })).resolves.toBe(true);
    await expect(kernel.vfs.readText(path, { handleId })).resolves.toBe("new");
    await expect(kernel.vfs.readText(restoredPath, { handleId })).resolves.toBe("old");
  });

  it("removes individual items and empties the remaining Trash", async () => {
    const handleId = await launchApp("system-trash-empty", "system");
    const first = uniquePath("one.txt");
    const second = uniquePath("two.txt");

    await kernel.vfs.writeText(first, "one", { handleId });
    await kernel.vfs.writeText(second, "two", { handleId });
    const firstItem = await kernel.trash.moveToTrash(first, { handleId });
    await kernel.trash.moveToTrash(second, { handleId });

    await expect(kernel.trash.remove(firstItem!.id, { handleId })).resolves.toBe(true);
    await expect(kernel.trash.list({ handleId })).resolves.toHaveLength(1);
    await expect(kernel.trash.empty({ handleId })).resolves.toBe(true);
    await expect(kernel.trash.list({ handleId })).resolves.toEqual([]);
  });

  it("returns null when the caller lacks VFS permission", async () => {
    const systemHandle = await launchApp("system-trash-permission-seeder", "system");
    const path = uniquePath("blocked.txt");
    await kernel.vfs.writeText(path, "blocked", { handleId: systemHandle });

    const handleId = await launchApp("blocked-trash-client", "productivity");
    usePermissionStore().set("blocked-trash-client", "vfs.read", false);

    await expect(kernel.trash.moveToTrash(path, { handleId })).resolves.toBeNull();
    await expect(kernel.vfs.readText(path, { handleId: systemHandle })).resolves.toBe("blocked");
  });
});
