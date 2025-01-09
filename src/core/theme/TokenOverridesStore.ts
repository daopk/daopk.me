import { defineStore } from "pinia";
import { nextTick, ref, shallowRef, watch, type WatchStopHandle } from "vue";

import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import {
  TOKEN_OVERRIDES_KV_NAMESPACE,
  TOKEN_OVERRIDES_KV_PRIMARY_KEY,
} from "~/core/storage/constants";
import { KVStore } from "~/core/storage/KVStore";

const PERSIST_DEBOUNCE_MS = 250;

export interface TokenOverridesHydrateHooks {
  onTokensChanged?: (changedKeys: readonly string[]) => void;
  /** Cross-tab `storage` event — kernel emits `tokens.synced` downstream. */
  onStorageSynced?: () => void;
  storageNamespace?: string;
}

function coerceOverrides(candidate: unknown): Record<string, string> {
  if (typeof candidate !== "object" || candidate === null) {
    return {};
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(candidate as Record<string, unknown>)) {
    // strict so a malformed cross-tab message can't poison the document.
    if (typeof k !== "string" || !k.startsWith("--")) {
      continue;
    }
    if (typeof v !== "string") {
      continue;
    }
    out[k] = v;
  }
  return out;
}

function diffKeys(prev: Record<string, string>, next: Record<string, string>): string[] {
  const changed = new Set<string>();
  for (const [k, v] of Object.entries(next)) {
    if (prev[k] !== v) {
      changed.add(k);
    }
  }
  for (const k of Object.keys(prev)) {
    if (!(k in next)) {
      changed.add(k);
    }
  }
  return Array.from(changed);
}

export const useTokenOverridesStore = defineStore("kernel-token-overrides", () => {
  /** Suppress watcher feedback during cross-tab merges. */
  let suppressKvWatch = false;

  const kvRef = shallowRef<KVStore<Record<string, string>>>();

  const hooksRef = ref<TokenOverridesHydrateHooks | undefined>();

  const overrides = ref<Record<string, string>>({});

  let persistStop: WatchStopHandle | undefined;
  let disposeKv: undefined | (() => void);
  let persistFlushHandle: ReturnType<typeof globalThis.setTimeout> | undefined;

  function snapshot(): Record<string, string> {
    return { ...overrides.value };
  }

  function runPersistCommit(): void {
    const store = kvRef.value;
    if (!store || suppressKvWatch) {
      return;
    }
    store.set(TOKEN_OVERRIDES_KV_PRIMARY_KEY, snapshot());
  }

  function cancelPersistDebounced(): void {
    if (persistFlushHandle !== undefined) {
      clearTimeout(persistFlushHandle);
      persistFlushHandle = undefined;
    }
  }

  function schedulePersist(): void {
    cancelPersistDebounced();
    persistFlushHandle = globalThis.setTimeout(() => {
      persistFlushHandle = undefined;
      runPersistCommit();
    }, PERSIST_DEBOUNCE_MS);
  }

  function persistImmediate(): void {
    cancelPersistDebounced();
    runPersistCommit();
  }

  function applyKvPayload(next: Record<string, string>): void {
    const prev = overrides.value;
    const changed = diffKeys(prev, next);
    if (changed.length === 0) {
      return;
    }

    suppressKvWatch = true;
    overrides.value = next;
    void nextTick(() => {
      suppressKvWatch = false;
    });

    hooksRef.value?.onTokensChanged?.(changed);
  }

  function handleRemoteKvNotification(): void {
    // Order matters — apply the remote payload BEFORE notifying the
    // and the kernel would emit nothing (covered by the cross-tab
    const raw = kvRef.value?.get(TOKEN_OVERRIDES_KV_PRIMARY_KEY);
    if (raw) {
      applyKvPayload(coerceOverrides(raw));
    }
    hooksRef.value?.onStorageSynced?.();
  }

  function set(key: string, value: string): void {
    if (!key.startsWith("--")) {
      return;
    }
    if (overrides.value[key] === value) {
      return;
    }
    overrides.value = { ...overrides.value, [key]: value };
    hooksRef.value?.onTokensChanged?.([key]);
    schedulePersist();
  }

  function unset(key: string): void {
    if (!(key in overrides.value)) {
      return;
    }
    const next = { ...overrides.value };
    delete next[key];
    overrides.value = next;
    hooksRef.value?.onTokensChanged?.([key]);
    schedulePersist();
  }

  function setMany(patch: Record<string, string>): void {
    const next = { ...overrides.value };
    const changed: string[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!k.startsWith("--") || typeof v !== "string") {
        continue;
      }
      if (next[k] === v) {
        continue;
      }
      next[k] = v;
      changed.push(k);
    }
    if (changed.length === 0) {
      return;
    }
    overrides.value = next;
    hooksRef.value?.onTokensChanged?.(changed);
    schedulePersist();
  }

  function reset(): void {
    const prev = overrides.value;
    const changed = Object.keys(prev);
    if (changed.length === 0) {
      return;
    }
    overrides.value = {};
    hooksRef.value?.onTokensChanged?.(changed);
    schedulePersist();
  }

  function flush(): void {
    persistImmediate();
  }

  function hydrate(initialHooks?: TokenOverridesHydrateHooks): void {
    hooksRef.value = initialHooks;

    // Tear down any prior hydration so re-init (HMR, tests) starts clean.
    persistStop?.();
    persistStop = undefined;
    disposeKv?.();
    disposeKv = undefined;
    kvRef.value?.dispose();

    kvRef.value = new KVStore<Record<string, string>>(
      initialHooks?.storageNamespace ?? activeProfileKvNamespace(TOKEN_OVERRIDES_KV_NAMESPACE),
      {
        version: 1,
        onRemoteChange(): void {
          handleRemoteKvNotification();
        },
      },
    );

    const persisted = kvRef.value.get(TOKEN_OVERRIDES_KV_PRIMARY_KEY);
    const loaded = persisted !== null ? coerceOverrides(persisted) : {};

    suppressKvWatch = true;
    overrides.value = loaded;
    suppressKvWatch = false;

    persistStop = watch(
      overrides,
      (): void => {
        if (!kvRef.value || suppressKvWatch) {
          return;
        }
        schedulePersist();
      },
      { flush: "post", deep: true },
    );

    disposeKv = (): void => {
      persistStop?.();
      persistStop = undefined;
      kvRef.value?.dispose();
      kvRef.value = undefined;
    };
  }

  function dispose(): void {
    persistImmediate();
    disposeKv?.();
    disposeKv = undefined;
    hooksRef.value = undefined;
  }

  return {
    overrides,
    snapshot,
    set,
    unset,
    setMany,
    reset,
    flush,
    hydrate,
    dispose,
  };
});
