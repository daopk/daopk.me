import { defineStore } from "pinia";
import { ref, shallowRef, type Ref } from "vue";

import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import { KVStore } from "~/core/storage/KVStore";
import {
  SPOTLIGHT_KV_NAMESPACE,
  SPOTLIGHT_KV_PRIMARY_KEY,
  SPOTLIGHT_RECENTS_CAP,
} from "~/core/storage/constants";
import type { SearchKind } from "~/types/search";
export type SpotlightRecentKind = Extract<SearchKind, "command" | "app">;

/**
 * One persisted recent entry. Intentionally minimal — Spotlight
 * resolves `kind`+`id` back to the live manifest at render time so
 * titles, icons, and the run target stay current.
 */
export interface SpotlightRecentEntry {
  kind: SpotlightRecentKind;
  id: string;
  usedAt: number;
}

interface SpotlightState {
  entries: SpotlightRecentEntry[];
}

const DEFAULT_STATE: SpotlightState = { entries: [] };

function coerceState(candidate: unknown): SpotlightState {
  if (typeof candidate !== "object" || candidate === null) {
    return { ...DEFAULT_STATE };
  }
  const c = candidate as Partial<SpotlightState>;
  if (!Array.isArray(c.entries)) {
    return { ...DEFAULT_STATE };
  }
  const cleaned: SpotlightRecentEntry[] = [];
  for (const entry of c.entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Partial<SpotlightRecentEntry>;
    if (
      (e.kind === "command" || e.kind === "app") &&
      typeof e.id === "string" &&
      e.id.length > 0 &&
      typeof e.usedAt === "number" &&
      Number.isFinite(e.usedAt)
    ) {
      cleaned.push({ kind: e.kind, id: e.id, usedAt: e.usedAt });
    }
  }
  return { entries: cleaned.slice(0, SPOTLIGHT_RECENTS_CAP) };
}

interface SpotlightRecentsHydrateHooks {
  onChanged?: () => void;
  onStorageSynced?: () => void;
  storageNamespace?: string;
}

export const useSpotlightRecentsStore = defineStore("kernel-spotlight-recents", () => {
  const kvRef = shallowRef<KVStore<SpotlightState>>();
  const hooksRef = ref<SpotlightRecentsHydrateHooks | undefined>();
  const entries: Ref<readonly SpotlightRecentEntry[]> = ref([]);

  let suppressWrite = false;
  let disposeKv: undefined | (() => void);

  function persist(): void {
    const store = kvRef.value;
    if (!store || suppressWrite) return;
    store.set(SPOTLIGHT_KV_PRIMARY_KEY, { entries: [...entries.value] });
  }

  function applyState(next: SpotlightState): void {
    suppressWrite = true;
    entries.value = [...next.entries];
    suppressWrite = false;
    hooksRef.value?.onChanged?.();
  }

  function handleRemoteKvNotification(): void {
    hooksRef.value?.onStorageSynced?.();
    const store = kvRef.value;
    const raw = store?.get(SPOTLIGHT_KV_PRIMARY_KEY);
    if (raw === null || raw === undefined) {
      applyState({ ...DEFAULT_STATE });
      return;
    }
    applyState(coerceState(raw));
  }

  /**
   * Promote (or insert) `(kind, id)` to the head of recents and persist.
   * Always stamps `Date.now()` — there is intentionally no timestamp
   * override; tests that need deterministic times use Vitest's
   * `vi.useFakeTimers()` + `vi.setSystemTime()`. Returns `null` when
   * the store has been disposed (no-op, no in-memory drift).
   */
  function push(kind: SpotlightRecentKind, id: string): SpotlightRecentEntry | null {
    if (!kvRef.value) {
      return null;
    }
    const entry: SpotlightRecentEntry = { kind, id, usedAt: Date.now() };
    const filtered = entries.value.filter((e) => !(e.kind === kind && e.id === id));
    const next = [entry, ...filtered].slice(0, SPOTLIGHT_RECENTS_CAP);
    entries.value = next;
    persist();
    hooksRef.value?.onChanged?.();
    return entry;
  }

  function clear(): void {
    if (entries.value.length === 0) return;
    entries.value = [];
    persist();
    hooksRef.value?.onChanged?.();
  }

  function list(): readonly SpotlightRecentEntry[] {
    return entries.value;
  }

  function hydrate(initialHooks?: SpotlightRecentsHydrateHooks): void {
    hooksRef.value = initialHooks;

    disposeKv?.();
    disposeKv = undefined;

    kvRef.value?.dispose();
    kvRef.value = new KVStore<SpotlightState>(
      initialHooks?.storageNamespace ?? activeProfileKvNamespace(SPOTLIGHT_KV_NAMESPACE),
      {
        version: 1,
        onRemoteChange(): void {
          handleRemoteKvNotification();
        },
      },
    );

    const persisted = kvRef.value.get(SPOTLIGHT_KV_PRIMARY_KEY);
    const loaded = persisted !== null ? coerceState(persisted) : { ...DEFAULT_STATE };

    suppressWrite = true;
    entries.value = [...loaded.entries];
    suppressWrite = false;

    disposeKv = (): void => {
      kvRef.value?.dispose();
      kvRef.value = undefined;
    };
  }

  function dispose(): void {
    disposeKv?.();
    disposeKv = undefined;
    hooksRef.value = undefined;
  }

  /**
   * True between a successful `hydrate()` call and the next `dispose()`.
   * Consumers (e.g. `useSpotlight()`) check this to avoid re-running
   * hydrate's KVStore teardown/recreate on every host mount, which
   * would briefly drop the cross-tab listener.
   */
  function isHydrated(): boolean {
    return kvRef.value !== undefined;
  }

  return {
    entries,
    push,
    clear,
    list,
    hydrate,
    isHydrated,
    dispose,
  };
});
