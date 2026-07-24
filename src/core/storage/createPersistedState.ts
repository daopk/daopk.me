import { effectScope, watch, type EffectScope } from "vue";

import { KVStore } from "~/core/storage/KVStore";

export type PersistedStateOrigin = "hydrate" | "remote";

export interface PersistedStateResolution<T> {
  value: T;
  /** Persist `value` after applying it, for coercions that migrate the stored shape. */
  rewrite?: boolean;
}

export interface PersistedStateOptions<T> {
  /** Key inside the namespace that holds the serialized snapshot. */
  primaryKey: string;
  /** Envelope version forwarded to the KVStore. */
  version?: number;
  /** Debounce window for writes. Omit to persist synchronously. */
  debounceMs?: number;
  /** Builds the value to persist from the caller's current in-memory state. */
  snapshot: () => T;
  /**
   * Keeps defaults, coercion and migrations caller-owned. Returning `undefined`
   * ignores a missing or invalid remote value without changing in-memory state.
   */
  resolve: (
    candidate: unknown,
    origin: PersistedStateOrigin,
  ) => PersistedStateResolution<T> | undefined;
  /** Applies resolved state. Persistence suppresses echo writes around this call. */
  apply: (value: T, origin: PersistedStateOrigin) => void;
  /** Runs after each matching cross-tab storage notification is reconciled. */
  onRemoteReconciled?: () => void;
}

/**
 * Owns the complete lifecycle for one reactive KV-backed snapshot: hydration,
 * watch-based writes, debounce, unload flushing, remote reconciliation and
 * teardown. Callers retain only state semantics through `resolve` and `apply`.
 */
export interface PersistedState {
  /** Flush prior work, hydrate `namespace`, and begin watching the snapshot. */
  hydrate(namespace: string): void;
  /** Commit pending state immediately. */
  flush(): void;
  /** Flush and release the watcher, browser listeners, timer and KV store. */
  dispose(): void;
  /** Whether the module currently has an active KV store and state watcher. */
  readonly isHydrated: boolean;
}

export function createPersistedState<T>(options: PersistedStateOptions<T>): PersistedState {
  const {
    primaryKey,
    version = 1,
    debounceMs,
    snapshot,
    resolve,
    apply,
    onRemoteReconciled,
  } = options;

  let kv: KVStore<T> | undefined;
  let watchScope: EffectScope | undefined;
  let flushHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
  let removeFlushListeners: (() => void) | undefined;
  let suppressWrites = false;
  let hasPendingWrite = false;

  function cancelPendingWrite(): void {
    if (flushHandle === undefined) {
      return;
    }
    globalThis.clearTimeout(flushHandle);
    flushHandle = undefined;
  }

  function commit(): void {
    if (!kv || suppressWrites || !hasPendingWrite) {
      return;
    }
    kv.set(primaryKey, snapshot());
    hasPendingWrite = false;
  }

  function scheduleCommit(): void {
    if (!kv || suppressWrites) {
      return;
    }
    hasPendingWrite = true;
    if (debounceMs === undefined) {
      commit();
      return;
    }
    cancelPendingWrite();
    flushHandle = globalThis.setTimeout(() => {
      flushHandle = undefined;
      commit();
    }, debounceMs);
  }

  function flush(): void {
    cancelPendingWrite();
    commit();
  }

  function applyResolved(candidate: unknown, origin: PersistedStateOrigin): void {
    const resolved = resolve(candidate, origin);
    if (!resolved) {
      return;
    }

    if (origin === "remote") {
      cancelPendingWrite();
      hasPendingWrite = false;
    }

    suppressWrites = true;
    try {
      apply(resolved.value, origin);
    } finally {
      suppressWrites = false;
    }

    if (resolved.rewrite) {
      hasPendingWrite = true;
      commit();
    }
  }

  function reconcileRemoteChange(): void {
    applyResolved(kv?.get(primaryKey) ?? null, "remote");
    onRemoteReconciled?.();
  }

  function registerFlushListeners(): void {
    if (
      debounceMs === undefined ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }

    const onPageHide = (): void => {
      flush();
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    removeFlushListeners = (): void => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }

  function release(flushFirst: boolean): void {
    if (flushFirst) {
      flush();
    } else {
      cancelPendingWrite();
    }
    watchScope?.stop();
    watchScope = undefined;
    removeFlushListeners?.();
    removeFlushListeners = undefined;
    kv?.dispose();
    kv = undefined;
    suppressWrites = false;
    hasPendingWrite = false;
  }

  function hydrate(namespace: string): void {
    release(true);
    kv = new KVStore<T>(namespace, {
      version,
      onRemoteChange: reconcileRemoteChange,
    });

    applyResolved(kv.get(primaryKey), "hydrate");
    const nextWatchScope = effectScope(true);
    try {
      nextWatchScope.run(() => {
        watch(snapshot, scheduleCommit, {
          deep: true,
          flush: "sync",
        });
      });
    } catch (error: unknown) {
      nextWatchScope.stop();
      release(false);
      throw error;
    }
    watchScope = nextWatchScope;
    registerFlushListeners();
  }

  function dispose(): void {
    release(true);
  }

  return {
    hydrate,
    flush,
    dispose,
    get isHydrated(): boolean {
      return kv !== undefined && watchScope?.active === true;
    },
  };
}
