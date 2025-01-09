import { debugWarn } from "~/core/debug";
import { profileIdbName, profileKvNamespace } from "~/core/profile/storageScope";
import { IndexedDBStore } from "~/core/storage/IndexedDBStore";
import { KVStore } from "~/core/storage/KVStore";
import {
  PERMISSIONS_KV_NAMESPACE,
  PERMISSIONS_KV_PRIMARY_KEY,
  SETTINGS_KV_PRIMARY_KEY,
  SPOTLIGHT_KV_NAMESPACE,
  SPOTLIGHT_KV_PRIMARY_KEY,
  TOKEN_OVERRIDES_KV_NAMESPACE,
  TOKEN_OVERRIDES_KV_PRIMARY_KEY,
  VFS_IDB_DB_NAME,
  WALLPAPERS_IDB_DB_NAME,
  WALLPAPERS_IDB_STORE_NAME,
  WALLPAPERS_IDB_VERSION,
  WALLPAPERS_KV_NAMESPACE,
  WALLPAPERS_KV_PRIMARY_KEY,
  WIDGETS_KV_NAMESPACE,
  WIDGETS_KV_PRIMARY_KEY,
} from "~/core/storage/constants";
import { IDBAdapter, normalizeVfsPath } from "~/core/vfs";

const KV_MIGRATIONS = [
  { namespace: "settings", key: SETTINGS_KV_PRIMARY_KEY },
  { namespace: TOKEN_OVERRIDES_KV_NAMESPACE, key: TOKEN_OVERRIDES_KV_PRIMARY_KEY },
  { namespace: PERMISSIONS_KV_NAMESPACE, key: PERMISSIONS_KV_PRIMARY_KEY },
  { namespace: WIDGETS_KV_NAMESPACE, key: WIDGETS_KV_PRIMARY_KEY },
  { namespace: SPOTLIGHT_KV_NAMESPACE, key: SPOTLIGHT_KV_PRIMARY_KEY },
  { namespace: WALLPAPERS_KV_NAMESPACE, key: WALLPAPERS_KV_PRIMARY_KEY },
] as const;

export interface ProfileMigrationOptions {
  profileId: string;
  encryptionKey?: CryptoKey;
}

export async function migrateGlobalDataToProfile(options: ProfileMigrationOptions): Promise<void> {
  migrateKvNamespaces(options.profileId);
  await migrateVfs(options);
  await migrateWallpaperBlobs(options.profileId);
}

function migrateKvNamespaces(profileId: string): void {
  for (const entry of KV_MIGRATIONS) {
    const targetNamespace = profileKvNamespace(profileId, entry.namespace);
    const source = new KVStore<unknown>(entry.namespace);
    const target = new KVStore<unknown>(targetNamespace);
    const verifier = new KVStore<unknown>(targetNamespace);
    try {
      const value = source.get(entry.key);
      if (value !== null) {
        target.set(entry.key, value);
        const persisted = verifier.get(entry.key);
        if (!jsonEqual(persisted, value)) {
          throw new Error(`Profile KV migration write was not durable: ${entry.namespace}`);
        }
      }
    } catch (error: unknown) {
      debugWarn("[profiles]", "KV migration failed", entry.namespace, error);
      throw new Error(`Profile KV migration failed: ${entry.namespace}`, {
        cause: error instanceof Error ? error : undefined,
      });
    } finally {
      source.dispose();
      target.dispose();
      verifier.dispose();
    }
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function migrateVfs(options: ProfileMigrationOptions): Promise<void> {
  const source = new IDBAdapter({ id: "global-vfs-migration-source", dbName: VFS_IDB_DB_NAME });
  const target = new IDBAdapter({
    id: "profile-vfs-migration-target",
    dbName: profileIdbName(options.profileId, "vfs"),
    encryptionKey: options.encryptionKey,
  });

  try {
    const walked = await source.walk(normalizeVfsPath("/"), { maxDepth: 50 });
    const entries = [...walked].sort((a, b) => a.path.split("/").length - b.path.split("/").length);

    for (const entry of entries) {
      const path = normalizeVfsPath(entry.path);
      if (entry.kind === "directory") {
        await target.mkdir(path, { recursive: true, now: entry.updatedAt });
        continue;
      }

      if (entry.kind !== "file") {
        continue;
      }

      const read = await source.read(path);
      await target.write(path, read.bytes, {
        overwrite: true,
        now: entry.updatedAt,
        ...(entry.mimeType === undefined ? {} : { mimeType: entry.mimeType }),
      });
    }
  } catch (error: unknown) {
    debugWarn("[profiles]", "VFS migration failed", error);
    throw new Error("Profile VFS migration failed", {
      cause: error instanceof Error ? error : undefined,
    });
  } finally {
    source.dispose();
    target.dispose();
  }
}

async function migrateWallpaperBlobs(profileId: string): Promise<void> {
  const source = new IndexedDBStore<Blob>(
    WALLPAPERS_IDB_DB_NAME,
    WALLPAPERS_IDB_STORE_NAME,
    WALLPAPERS_IDB_VERSION,
  );
  const target = new IndexedDBStore<Blob>(
    profileIdbName(profileId, "wallpapers"),
    WALLPAPERS_IDB_STORE_NAME,
    WALLPAPERS_IDB_VERSION,
  );

  try {
    const keys = await source.keys();
    for (const key of keys) {
      const blob = await source.get(key);
      if (blob !== null) {
        await target.set(key, blob);
      }
    }
  } catch (error: unknown) {
    debugWarn("[profiles]", "wallpaper blob migration failed", error);
    throw new Error("Profile wallpaper migration failed", {
      cause: error instanceof Error ? error : undefined,
    });
  } finally {
    source.close();
    target.close();
  }
}
