/** Generic IndexedDB KV. */

import { openDB, type IDBPDatabase } from "idb";

import { debugWarn } from "~/core/debug";
import { StorageError } from "~/core/storage/types";

export interface IndexedDBValuesOptions {
  readonly limit?: number;
}

export class IndexedDBStore<T = unknown> {
  private readonly dbName: string;

  private readonly storeName: string;

  private readonly version: number;

  private latch: Promise<IDBPDatabase> | null = null;

  constructor(dbName: string, storeName: string, version: number) {
    if (!Number.isInteger(version) || version < 1) {
      throw new StorageError("IndexedDBStore requires integer db version ≥ 1", {
        code: "INVALID_VERSION",
      });
    }

    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
  }

  private ensureIdbAvailable(): void {
    if (typeof indexedDB === "undefined") {
      throw new StorageError("indexedDB unavailable in this runtime", {
        code: "IDB_UNAVAILABLE",
      });
    }
  }

  private async open(): Promise<IDBPDatabase> {
    this.ensureIdbAvailable();

    try {
      this.latch ??= openDB(this.dbName, this.version, {
        upgrade: (database, oldVersion) => {
          void oldVersion;

          if (!database.objectStoreNames.contains(this.storeName)) {
            database.createObjectStore(this.storeName);
          }
        },
      });

      return await this.latch;
    } catch (error: unknown) {
      debugWarn("[IndexedDBStore]", "open failed", this.dbName, error);
      this.latch = null;

      throw new StorageError(`IndexedDB open failed: ${String(this.dbName)}`, {
        cause: error instanceof Error ? error : undefined,
        code: "OPEN_FAILED",
      });
    }
  }

  async get(key: string): Promise<T | null> {
    try {
      const database = await this.open();

      /** Prefer structured-clone-safe values — callers avoid functions / symbols / DOM nodes. */

      const value: unknown = await database.get(this.storeName, key);

      return (value ?? null) as T | null;
    } catch (error: unknown) {
      if (error instanceof StorageError) {
        throw error;
      }

      debugWarn("[IndexedDBStore]", "get failed", key, error);

      throw new StorageError(`IndexedDB get failed: ${key}`, {
        cause: error instanceof Error ? error : undefined,
        code: "GET_FAILED",
      });
    }
  }

  async set(key: string, value: T): Promise<void> {
    try {
      const database = await this.open();

      await database.put(this.storeName, value as unknown, key);
    } catch (error: unknown) {
      if (error instanceof StorageError) {
        throw error;
      }

      debugWarn("[IndexedDBStore]", "set failed", key, error);

      throw new StorageError(`IndexedDB set failed: ${key}`, {
        cause: error instanceof Error ? error : undefined,
        code: "SET_FAILED",
      });
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const database = await this.open();

      await database.delete(this.storeName, key);
    } catch (error: unknown) {
      if (error instanceof StorageError) {
        throw error;
      }

      debugWarn("[IndexedDBStore]", "remove failed", key, error);

      throw new StorageError(`IndexedDB remove failed: ${key}`, {
        cause: error instanceof Error ? error : undefined,
        code: "REMOVE_FAILED",
      });
    }
  }

  async clear(): Promise<void> {
    try {
      const database = await this.open();

      await database.clear(this.storeName);
    } catch (error: unknown) {
      if (error instanceof StorageError) {
        throw error;
      }

      debugWarn("[IndexedDBStore]", "clear failed", error);

      throw new StorageError("IndexedDB clear failed", {
        cause: error instanceof Error ? error : undefined,
        code: "CLEAR_FAILED",
      });
    }
  }

  async keys(): Promise<string[]> {
    try {
      const database = await this.open();

      return (await database.getAllKeys(this.storeName)) as string[];
    } catch (error: unknown) {
      if (error instanceof StorageError) {
        throw error;
      }

      debugWarn("[IndexedDBStore]", "keys failed", error);

      throw new StorageError("IndexedDB keys failed", {
        cause: error instanceof Error ? error : undefined,
        code: "KEYS_FAILED",
      });
    }
  }

  async values(
    query?: IDBValidKey | IDBKeyRange,
    options: IndexedDBValuesOptions = {},
  ): Promise<T[]> {
    try {
      const database = await this.open();
      const limit = options.limit;

      if (limit !== undefined) {
        if (limit <= 0) {
          return [];
        }

        const values: T[] = [];
        const tx = database.transaction(this.storeName, "readonly");
        let cursor = await tx.store.openCursor(query);

        while (cursor !== null && values.length < limit) {
          values.push(cursor.value as T);
          cursor = await cursor.continue();
        }

        await tx.done;
        return values;
      }

      return (await database.getAll(this.storeName, query)) as T[];
    } catch (error: unknown) {
      if (error instanceof StorageError) {
        throw error;
      }

      debugWarn("[IndexedDBStore]", "values failed", error);

      throw new StorageError("IndexedDB values failed", {
        cause: error instanceof Error ? error : undefined,
        code: "VALUES_FAILED",
      });
    }
  }

  close(): void {
    void this.latch
      ?.then((db) => {
        db.close();
      })
      .catch(() => {});

    this.latch = null;
  }
}
