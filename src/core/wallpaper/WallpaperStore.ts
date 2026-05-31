import { defineStore } from "pinia";
import { ref, shallowRef, type Ref } from "vue";

import { debugWarn } from "~/core/debug";
import { activeProfileIdbName, activeProfileKvNamespace } from "~/core/profile/storageScope";
import { createKvBackedStore } from "~/core/storage/createKvBackedStore";
import { IndexedDBStore } from "~/core/storage/IndexedDBStore";
import {
  WALLPAPER_BLOB_CAP_BYTES,
  WALLPAPER_COUNT_CAP,
  WALLPAPERS_IDB_DB_NAME,
  WALLPAPERS_IDB_STORE_NAME,
  WALLPAPERS_IDB_VERSION,
  WALLPAPERS_KV_NAMESPACE,
  WALLPAPERS_KV_PRIMARY_KEY,
} from "~/core/storage/constants";
import { processWallpaperFile } from "~/core/wallpaper/imageProcessor";
import type { UserWallpaperMeta, WallpaperUploadResult, WallpapersState } from "~/types/wallpaper";

const DEFAULT_STATE: WallpapersState = { index: [] };

function coerceState(candidate: unknown): WallpapersState {
  if (typeof candidate !== "object" || candidate === null) {
    return { ...DEFAULT_STATE };
  }
  const c = candidate as Partial<Record<keyof WallpapersState, unknown>>;
  if (!Array.isArray(c.index)) {
    return { ...DEFAULT_STATE };
  }
  const cleaned: UserWallpaperMeta[] = [];
  for (const entry of c.index) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const e = entry as Partial<UserWallpaperMeta>;
    if (
      typeof e.id === "string" &&
      e.id.length > 0 &&
      typeof e.name === "string" &&
      typeof e.sizeBytes === "number" &&
      Number.isFinite(e.sizeBytes) &&
      typeof e.mimeType === "string" &&
      typeof e.createdAt === "number"
    ) {
      cleaned.push({
        id: e.id,
        name: e.name,
        sizeBytes: e.sizeBytes,
        mimeType: e.mimeType,
        createdAt: e.createdAt,
      });
    }
  }
  return { index: cleaned };
}

function makeId(now: number): string {
  return `user-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface WallpaperStoreHydrateHooks {
  onIndexChanged?: () => void;
  onStorageSynced?: () => void;
  storageNamespace?: string;
  dbName?: string;
}

export const useWallpaperStore = defineStore("kernel-wallpapers", () => {
  const idbRef = shallowRef<IndexedDBStore<Blob>>();
  const hooksRef = ref<WallpaperStoreHydrateHooks | undefined>();

  const index: Ref<readonly UserWallpaperMeta[]> = ref([]);

  const persistence = createKvBackedStore<WallpapersState>({
    primaryKey: WALLPAPERS_KV_PRIMARY_KEY,
    version: 1,
    snapshot: () => ({ index: [...index.value] }),
    onRemoteChange: () => {
      handleRemoteKvNotification();
    },
  });

  function applyState(next: WallpapersState): void {
    persistence.runSuppressed(() => {
      index.value = [...next.index];
    });
    hooksRef.value?.onIndexChanged?.();
  }

  function handleRemoteKvNotification(): void {
    hooksRef.value?.onStorageSynced?.();
    const raw = persistence.read();
    if (raw === null) {
      applyState({ ...DEFAULT_STATE });
      return;
    }
    applyState(coerceState(raw));
  }

  async function upload(file: File): Promise<WallpaperUploadResult> {
    if (!idbRef.value) {
      return { ok: false, reason: "io-error", message: "Wallpaper store not initialised" };
    }

    if (!file.type.startsWith("image/")) {
      return {
        ok: false,
        reason: "invalid-type",
        message: `Unsupported file type: ${file.type || "unknown"}`,
      };
    }

    if (file.size > WALLPAPER_BLOB_CAP_BYTES) {
      return {
        ok: false,
        reason: "too-large",
        message: `File is larger than the ${Math.round(WALLPAPER_BLOB_CAP_BYTES / 1024 / 1024)} MB cap`,
      };
    }

    if (index.value.length >= WALLPAPER_COUNT_CAP) {
      return {
        ok: false,
        reason: "count-cap",
        message: `Reached the ${WALLPAPER_COUNT_CAP}-wallpaper limit. Delete one to upload more.`,
      };
    }

    const processed = await processWallpaperFile(file);
    const id = makeId(Date.now());

    try {
      await idbRef.value.set(id, processed.blob);
    } catch (error: unknown) {
      debugWarn("[WallpaperStore]", "blob set failed", error);
      return {
        ok: false,
        reason: "io-error",
        message: "Failed to save the wallpaper. Storage may be full.",
      };
    }

    const fallbackName = file.name.replace(/\.[^.]+$/, "") || "Untitled";
    const meta: UserWallpaperMeta = {
      id,
      name: fallbackName,
      sizeBytes: processed.sizeBytes,
      mimeType: processed.mimeType,
      createdAt: Date.now(),
    };

    index.value = [...index.value, meta];
    persistence.commit();
    hooksRef.value?.onIndexChanged?.();

    return { ok: true, meta };
  }

  async function remove(id: string): Promise<void> {
    if (!idbRef.value) {
      return;
    }
    try {
      await idbRef.value.remove(id);
    } catch (error: unknown) {
      debugWarn("[WallpaperStore]", "blob remove failed", id, error);
    }
    const before = index.value.length;
    index.value = index.value.filter((entry) => entry.id !== id);
    if (index.value.length !== before) {
      persistence.commit();
      hooksRef.value?.onIndexChanged?.();
    }
  }

  async function getBlob(id: string): Promise<Blob | null> {
    if (!idbRef.value) {
      return null;
    }
    try {
      return await idbRef.value.get(id);
    } catch (error: unknown) {
      debugWarn("[WallpaperStore]", "blob get failed", id, error);
      return null;
    }
  }

  function list(): readonly UserWallpaperMeta[] {
    return index.value;
  }

  function has(id: string): boolean {
    return index.value.some((entry) => entry.id === id);
  }

  async function clear(): Promise<void> {
    if (idbRef.value) {
      try {
        await idbRef.value.clear();
      } catch (error: unknown) {
        debugWarn("[WallpaperStore]", "blob clear failed", error);
      }
    }
    index.value = [];
    persistence.commit();
    hooksRef.value?.onIndexChanged?.();
  }

  function hydrate(initialHooks?: WallpaperStoreHydrateHooks): void {
    hooksRef.value = initialHooks;

    persistence.start(
      initialHooks?.storageNamespace ?? activeProfileKvNamespace(WALLPAPERS_KV_NAMESPACE),
    );

    idbRef.value?.close();
    idbRef.value = new IndexedDBStore<Blob>(
      initialHooks?.dbName ?? activeProfileIdbName(WALLPAPERS_IDB_DB_NAME, "wallpapers"),
      WALLPAPERS_IDB_STORE_NAME,
      WALLPAPERS_IDB_VERSION,
    );

    const persisted = persistence.read();
    const loaded = persisted !== null ? coerceState(persisted) : { ...DEFAULT_STATE };

    persistence.runSuppressed(() => {
      index.value = [...loaded.index];
    });
  }

  function dispose(): void {
    persistence.dispose();
    idbRef.value?.close();
    idbRef.value = undefined;
    hooksRef.value = undefined;
  }

  return {
    index,
    hydrate,
    dispose,
    upload,
    remove,
    getBlob,
    list,
    has,
    clear,
  };
});
