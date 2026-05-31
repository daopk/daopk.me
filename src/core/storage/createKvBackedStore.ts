import { nextTick, shallowRef, type ShallowRef } from "vue";

import { KVStore } from "~/core/storage/KVStore";

export interface KvBackedStoreOptions<T> {
  /** Key inside the namespace that holds the serialized snapshot. */
  primaryKey: string;
  /** Envelope version forwarded to the KVStore. */
  version?: number;
  /**
   * Debounce window (ms) applied by `schedule()`. When omitted, `schedule()`
   * commits synchronously — matching stores that persist eagerly.
   */
  debounceMs?: number;
  /** Builds the value to persist from the store's current in-memory state. */
  snapshot: () => T;
  /** Cross-tab `storage` notification, forwarded to `KVStore.onRemoteChange`. */
  onRemoteChange?: () => void;
}

/**
 * Owns the persistence plumbing that KV-backed Pinia stores otherwise
 * copy-paste: the `KVStore` lifecycle, a suppress-watch flag, and a debounced
 * commit. The store keeps its own reactive state, coercion and hooks and drives
 * this controller from `hydrate`/`dispose` and its mutation methods.
 */
export interface KvBackedStore<T> {
  /** Underlying KVStore, available between `start()` and `dispose()`. */
  readonly kv: ShallowRef<KVStore<T> | undefined>;
  /** True while a suppressed mutation window is open. */
  readonly isSuppressed: boolean;
  /** (Re)create the KVStore for `namespace`, disposing any previous instance. */
  start(namespace: string): void;
  /** Read the persisted snapshot (or `null`). */
  read(): T | null;
  /** Commit the current snapshot now, unless suppressed or not started. */
  commit(): void;
  /** Commit, debounced when `debounceMs` is set, otherwise immediately. */
  schedule(): void;
  /** Cancel any pending debounce and commit immediately. */
  flush(): void;
  /** Cancel any pending debounced commit. */
  cancel(): void;
  /** Run a mutation with persistence suppressed, releasing synchronously. */
  runSuppressed(mutate: () => void): void;
  /** Run a mutation with suppression released on the next tick (flush:"post" watchers). */
  runSuppressedUntilNextTick(mutate: () => void): void;
  /** Dispose the KVStore and cancel pending work. */
  dispose(): void;
}

export function createKvBackedStore<T>(options: KvBackedStoreOptions<T>): KvBackedStore<T> {
  const { primaryKey, version = 1, debounceMs, snapshot, onRemoteChange } = options;

  const kv = shallowRef<KVStore<T>>();
  let suppress = false;
  let flushHandle: ReturnType<typeof globalThis.setTimeout> | undefined;

  function cancel(): void {
    if (flushHandle !== undefined) {
      clearTimeout(flushHandle);
      flushHandle = undefined;
    }
  }

  function commit(): void {
    const store = kv.value;
    if (!store || suppress) {
      return;
    }
    store.set(primaryKey, snapshot());
  }

  function schedule(): void {
    if (debounceMs === undefined) {
      commit();
      return;
    }
    cancel();
    flushHandle = globalThis.setTimeout(() => {
      flushHandle = undefined;
      commit();
    }, debounceMs);
  }

  function flush(): void {
    cancel();
    commit();
  }

  function start(namespace: string): void {
    cancel();
    kv.value?.dispose();
    kv.value = new KVStore<T>(namespace, {
      version,
      ...(onRemoteChange === undefined ? {} : { onRemoteChange }),
    });
  }

  function read(): T | null {
    return kv.value?.get(primaryKey) ?? null;
  }

  function runSuppressed(mutate: () => void): void {
    suppress = true;
    try {
      mutate();
    } finally {
      suppress = false;
    }
  }

  function runSuppressedUntilNextTick(mutate: () => void): void {
    suppress = true;
    mutate();
    void nextTick(() => {
      suppress = false;
    });
  }

  function dispose(): void {
    cancel();
    kv.value?.dispose();
    kv.value = undefined;
  }

  return {
    kv,
    get isSuppressed(): boolean {
      return suppress;
    },
    start,
    read,
    commit,
    schedule,
    flush,
    cancel,
    runSuppressed,
    runSuppressedUntilNextTick,
    dispose,
  };
}
