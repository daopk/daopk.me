import { defineStore } from "pinia";
import { ref } from "vue";

import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import {
  TOKEN_OVERRIDES_KV_NAMESPACE,
  TOKEN_OVERRIDES_KV_PRIMARY_KEY,
} from "~/core/storage/constants";
import {
  createPersistedState,
  type PersistedStateOrigin,
} from "~/core/storage/createPersistedState";

const PERSIST_DEBOUNCE_MS = 250;

interface TokenOverridesHydrateHooks {
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
  const hooksRef = ref<TokenOverridesHydrateHooks | undefined>();

  const overrides = ref<Record<string, string>>({});

  function snapshot(): Record<string, string> {
    return { ...overrides.value };
  }

  const persistence = createPersistedState<Record<string, string>>({
    primaryKey: TOKEN_OVERRIDES_KV_PRIMARY_KEY,
    version: 1,
    debounceMs: PERSIST_DEBOUNCE_MS,
    snapshot,
    resolve: (candidate, origin) => {
      if (candidate === null && origin === "remote") {
        return undefined;
      }
      return { value: coerceOverrides(candidate) };
    },
    apply: applyKvPayload,
    onRemoteReconciled: () => {
      hooksRef.value?.onStorageSynced?.();
    },
  });

  function applyKvPayload(next: Record<string, string>, origin: PersistedStateOrigin): void {
    const prev = overrides.value;
    const changed = diffKeys(prev, next);
    if (changed.length === 0) {
      return;
    }

    overrides.value = next;

    if (origin === "remote") {
      hooksRef.value?.onTokensChanged?.(changed);
    }
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
  }

  function unset(key: string): void {
    if (!(key in overrides.value)) {
      return;
    }
    const next = { ...overrides.value };
    delete next[key];
    overrides.value = next;
    hooksRef.value?.onTokensChanged?.([key]);
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
  }

  function reset(): void {
    const prev = overrides.value;
    const changed = Object.keys(prev);
    if (changed.length === 0) {
      return;
    }
    overrides.value = {};
    hooksRef.value?.onTokensChanged?.(changed);
  }

  function flush(): void {
    persistence.flush();
  }

  function hydrate(initialHooks?: TokenOverridesHydrateHooks): void {
    hooksRef.value = initialHooks;

    persistence.hydrate(
      initialHooks?.storageNamespace ?? activeProfileKvNamespace(TOKEN_OVERRIDES_KV_NAMESPACE),
    );
  }

  function dispose(): void {
    persistence.dispose();
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
