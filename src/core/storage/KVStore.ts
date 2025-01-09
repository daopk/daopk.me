/**
 * JSON-aware localStorage wrapper with namespace prefix, schema envelope, and memory fallback.
 * WHY `:` delimiter: matches locked persistence contract (replaces legacy `::` scaffold).
 */

import { debugWarn } from "~/core/debug";
import type { MigrationFn, Serializer, StorageWriteOptions } from "~/core/storage/types";

const JSON_SERIALIZER: Serializer<unknown> = {
  stringify: (value) => JSON.stringify(value),
  parse: (raw) => JSON.parse(raw) as unknown,
};

interface Envelope<T> {
  __v: number;
  data: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readEnvelope<T>(parsed: unknown): Envelope<T> | null {
  if (!isRecord(parsed)) {
    return null;
  }

  const v = parsed.__v;
  const data = parsed.data;

  if (typeof v !== "number" || !("data" in parsed)) {
    return null;
  }

  return { __v: v, data: data as T };
}

export interface KVStoreOptions<T> {
  serializer?: Serializer<T>;

  version?: number;
  migrate?: MigrationFn<T>;

  fallback?: "memory";
  /** Cross-tab notification — never imports kernel; kernel wires `settings.synced`. */

  onRemoteChange?: () => void;
}

export class KVStore<T = unknown> {
  private readonly namespace: string;

  private readonly serializer: Serializer<T>;

  private readonly targetVersion: number;

  private readonly migrate?: MigrationFn<T>;

  private readonly onRemoteChange?: () => void;

  private usingMemory = false;

  private readonly memory = new Map<string, string>();

  private readonly storageListener: (event: StorageEvent) => void;

  private disposed = false;

  constructor(namespace: string, options?: KVStoreOptions<T>) {
    this.namespace = namespace;
    this.serializer = (options?.serializer ?? (JSON_SERIALIZER as Serializer<T>)) as Serializer<T>;
    this.targetVersion = options?.version ?? 1;
    this.migrate = options?.migrate;
    this.onRemoteChange = options?.onRemoteChange;
    this.storageListener = (event: StorageEvent): void => {
      if (event.key === null || !event.key.startsWith(`${this.namespace}:`)) {
        return;
      }

      this.onRemoteChange?.();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("storage", this.storageListener);
    }
  }

  private scopedKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  private readRaw(physicalKey: string): string | null {
    if (this.usingMemory) {
      return this.memory.get(physicalKey) ?? null;
    }

    try {
      return window.localStorage.getItem(physicalKey);
    } catch (error: unknown) {
      this.promoteToMemoryFallback("read", error);
      return this.memory.get(physicalKey) ?? null;
    }
  }

  private writeRaw(physicalKey: string, raw: string, options?: StorageWriteOptions): void {
    if (options?.silent) {
      return;
    }

    if (this.usingMemory) {
      this.memory.set(physicalKey, raw);
      return;
    }

    try {
      window.localStorage.setItem(physicalKey, raw);
    } catch (error: unknown) {
      this.promoteToMemoryFallback("write", error);
      this.memory.set(physicalKey, raw);
    }
  }

  private removeRaw(physicalKey: string): void {
    if (this.usingMemory) {
      this.memory.delete(physicalKey);
      return;
    }

    try {
      window.localStorage.removeItem(physicalKey);
    } catch (error: unknown) {
      this.promoteToMemoryFallback("remove", error);
      this.memory.delete(physicalKey);
    }
  }

  private promoteToMemoryFallback(op: string, error: unknown): void {
    if (!this.usingMemory) {
      this.usingMemory = true;
      debugWarn("[KVStore]", `localStorage ${op} failed — using memory backend`, error);
      this.seedMemoryFromLocalStorage();
    }
  }

  private seedMemoryFromLocalStorage(): void {
    try {
      const ls = window.localStorage;

      for (let index = 0; index < ls.length; index += 1) {
        const k = ls.key(index);

        if (!k?.startsWith(`${this.namespace}:`)) {
          continue;
        }

        const v = ls.getItem(k);

        if (v !== null) {
          this.memory.set(k, v);
        }
      }
    } catch (error: unknown) {
      debugWarn("[KVStore]", "unable to mirror localStorage into memory fallback", error);
    }
  }

  private coerceValue(parsed: unknown, storedVersion: number): T | null {
    if (storedVersion !== this.targetVersion) {
      if (!this.migrate) {
        debugWarn(
          "[KVStore]",
          "version mismatch without migrate handler — resetting key semantics",
          storedVersion,
          this.targetVersion,
        );

        return null;
      }

      try {
        return this.migrate(parsed as unknown, storedVersion, this.targetVersion);
      } catch (error: unknown) {
        debugWarn("[KVStore]", "migrate threw — clearing key semantics", error);
        return null;
      }
    }

    const env = readEnvelope<T>(parsed);

    if (!env) {
      return null;
    }

    const dataUnknown = env.data;

    try {
      const wire =
        typeof dataUnknown === "string" ? dataUnknown : JSON.stringify(dataUnknown as unknown);

      return this.serializer.parse(wire);
    } catch (error: unknown) {
      debugWarn("[KVStore]", "serializer.parse failed", error);
      return null;
    }
  }

  get(key: string): T | null {
    const physical = this.scopedKey(key);
    const raw = this.readRaw(physical);

    if (raw === null) {
      return null;
    }

    let parsedOuter: unknown;

    try {
      parsedOuter = JSON.parse(raw) as unknown;
    } catch (error: unknown) {
      debugWarn("[KVStore]", "deserialize failed", physical, error);
      return null;
    }

    const envPeek = readEnvelope<unknown>(parsedOuter);

    if (!envPeek) {
      debugWarn("[KVStore]", "unknown envelope layout", physical);
      return null;
    }

    return this.coerceValue(parsedOuter, envPeek.__v);
  }

  set(key: string, value: T, options?: StorageWriteOptions): void {
    const physical = this.scopedKey(key);

    let dataWire: unknown;

    try {
      dataWire = JSON.parse(this.serializer.stringify(value)) as unknown;
    } catch (error: unknown) {
      debugWarn("[KVStore]", "serialize failed", physical, error);
      return;
    }

    const envelope: Envelope<unknown> = {
      __v: this.targetVersion,
      data: dataWire,
    };

    let raw: string;

    try {
      raw = JSON.stringify(envelope);
    } catch (error: unknown) {
      debugWarn("[KVStore]", "JSON envelope failed", physical, error);
      return;
    }

    this.writeRaw(physical, raw, options);
  }

  remove(key: string): void {
    this.removeRaw(this.scopedKey(key));
  }

  clear(): void {
    const survivors = new Map<string, string>();

    if (this.usingMemory) {
      for (const [k, v] of this.memory) {
        if (k.startsWith(`${this.namespace}:`)) {
          continue;
        }

        survivors.set(k, v);
      }

      this.memory.clear();

      for (const [k, v] of survivors) {
        this.memory.set(k, v);
      }

      return;
    }

    try {
      const ls = window.localStorage;
      const toRemove: string[] = [];

      for (let index = 0; index < ls.length; index += 1) {
        const k = ls.key(index);

        if (k?.startsWith(`${this.namespace}:`)) {
          toRemove.push(k);
        }
      }

      for (const k of toRemove) {
        ls.removeItem(k);
      }
    } catch (error: unknown) {
      this.promoteToMemoryFallback("clear", error);
      this.clear();
    }
  }

  keys(): string[] {
    const out = new Set<string>();

    if (this.usingMemory) {
      for (const k of this.memory.keys()) {
        if (k.startsWith(`${this.namespace}:`)) {
          out.add(k.slice(this.namespace.length + 1));
        }
      }

      return [...out].sort();
    }

    try {
      const ls = window.localStorage;

      for (let index = 0; index < ls.length; index += 1) {
        const k = ls.key(index);

        if (k?.startsWith(`${this.namespace}:`)) {
          out.add(k.slice(this.namespace.length + 1));
        }
      }
    } catch (error: unknown) {
      this.promoteToMemoryFallback("keys", error);
      return this.keys();
    }

    return [...out].sort();
  }

  has(key: string): boolean {
    const physical = this.scopedKey(key);

    if (this.usingMemory) {
      return this.memory.has(physical);
    }

    try {
      return window.localStorage.getItem(physical) !== null;
    } catch (error: unknown) {
      this.promoteToMemoryFallback("has", error);
      return this.memory.has(physical);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (typeof window !== "undefined") {
      window.removeEventListener("storage", this.storageListener);
    }
  }
}
