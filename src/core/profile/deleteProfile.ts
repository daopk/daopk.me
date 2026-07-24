import { debugWarn } from "~/core/debug";
import { ProfileStore } from "~/core/profile/ProfileStore";
import { profileIdbName } from "~/core/profile/storageScope";

const PROFILE_DATABASE_DOMAINS = ["vfs", "trash", "wallpapers"] as const;

export async function deleteProfile(profileId: string): Promise<boolean> {
  await deleteProfileStorage(profileId);

  const store = new ProfileStore();
  try {
    return store.remove(profileId);
  } finally {
    store.dispose();
  }
}

export async function deleteProfileStorage(profileId: string): Promise<void> {
  deleteProfileLocalStorage(profileId);
  await Promise.all(
    PROFILE_DATABASE_DOMAINS.map((domain) => deleteIndexedDb(profileIdbName(profileId, domain))),
  );
}

function deleteProfileLocalStorage(profileId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const prefix = `profiles:${profileId}:`;
  const keys: string[] = [];

  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }

    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch (error: unknown) {
    debugWarn("[profiles]", "profile localStorage deletion failed", profileId, error);
    throw error;
  }
}

function deleteIndexedDb(dbName: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);

    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => {
      debugWarn("[profiles]", "profile IndexedDB deletion failed", dbName, request.error);
      reject(request.error ?? new Error(`IndexedDB delete failed: ${dbName}`));
    };
  });
}
