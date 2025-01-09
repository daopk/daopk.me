import { defineStore } from "pinia";
import { ref, shallowRef, type Ref } from "vue";

import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import { PERMISSIONS_KV_NAMESPACE, PERMISSIONS_KV_PRIMARY_KEY } from "~/core/storage/constants";
import { KVStore } from "~/core/storage/KVStore";
import type { AppPermission } from "~/types/app";
import type {
  PermissionLedgerEntry,
  PersistedPermissionDecision,
  PersistedPermissionState,
} from "~/types/permissions";

interface PermissionPersistedState {
  decisions: PersistedPermissionState;
}

export interface PermissionStoreHydrateOptions {
  storageNamespace?: string;
}

const DEFAULT_STATE: PermissionPersistedState = { decisions: {} };

function coerceState(candidate: unknown): PermissionPersistedState {
  if (typeof candidate !== "object" || candidate === null) {
    return { decisions: {} };
  }
  const c = candidate as Partial<PermissionPersistedState>;
  if (typeof c.decisions !== "object" || c.decisions === null) {
    return { decisions: {} };
  }
  const cleaned: PersistedPermissionState = {};
  for (const [manifestId, rawPerms] of Object.entries(c.decisions)) {
    if (typeof manifestId !== "string" || manifestId.length === 0) continue;
    if (typeof rawPerms !== "object" || rawPerms === null) continue;
    const perPermission: Partial<Record<AppPermission, PersistedPermissionDecision>> = {};
    let kept = 0;
    for (const [permission, rawDecision] of Object.entries(rawPerms)) {
      if (typeof rawDecision !== "object" || rawDecision === null) continue;
      const d = rawDecision as Partial<PersistedPermissionDecision>;
      if (typeof d.granted !== "boolean") continue;
      if (typeof d.decidedAt !== "number" || !Number.isFinite(d.decidedAt)) continue;
      // We intentionally do NOT validate `permission` against the
      perPermission[permission as AppPermission] = {
        granted: d.granted,
        decidedAt: d.decidedAt,
      };
      kept += 1;
    }
    if (kept > 0) {
      cleaned[manifestId] = perPermission;
    }
  }
  return { decisions: cleaned };
}

export const usePermissionStore = defineStore("kernel-permissions", () => {
  const kvRef = shallowRef<KVStore<PermissionPersistedState>>();
  // must call `set` / `remove` to mutate, never push into the ref.
  const decisions: Ref<Readonly<PersistedPermissionState>> = ref({});

  let suppressWrite = false;
  let disposeKv: undefined | (() => void);

  function persist(): void {
    const store = kvRef.value;
    if (!store || suppressWrite) return;
    // synchronously so a shallow clone would be safe in practice,
    const snapshot: PersistedPermissionState = {};
    for (const [manifestId, perms] of Object.entries(decisions.value)) {
      snapshot[manifestId] = { ...perms };
    }
    store.set(PERMISSIONS_KV_PRIMARY_KEY, { decisions: snapshot });
  }

  function applyState(next: PermissionPersistedState): void {
    suppressWrite = true;
    decisions.value = { ...next.decisions };
    suppressWrite = false;
  }

  function handleRemoteKvNotification(): void {
    const store = kvRef.value;
    const raw = store?.get(PERMISSIONS_KV_PRIMARY_KEY);
    if (raw === null || raw === undefined) {
      applyState({ decisions: {} });
      return;
    }
    applyState(coerceState(raw));
  }

  function get(
    manifestId: string,
    permission: AppPermission,
  ): PersistedPermissionDecision | undefined {
    return decisions.value[manifestId]?.[permission];
  }

  function set(
    manifestId: string,
    permission: AppPermission,
    granted: boolean,
    now: number = Date.now(),
  ): void {
    if (!kvRef.value) return;
    const existing = decisions.value[manifestId]?.[permission];
    if (existing !== undefined && existing.granted === granted) {
      return;
    }
    const nextInner: Partial<Record<AppPermission, PersistedPermissionDecision>> = {
      ...decisions.value[manifestId],
      [permission]: { granted, decidedAt: now },
    };
    decisions.value = {
      ...decisions.value,
      [manifestId]: nextInner,
    };
    persist();
  }

  function remove(manifestId: string, permission: AppPermission): boolean {
    if (!kvRef.value) return false;
    const inner = decisions.value[manifestId];
    if (inner === undefined || inner[permission] === undefined) {
      return false;
    }
    const nextInner = { ...inner };
    delete nextInner[permission];
    const nextOuter = { ...decisions.value };
    if (Object.keys(nextInner).length === 0) {
      delete nextOuter[manifestId];
    } else {
      nextOuter[manifestId] = nextInner;
    }
    decisions.value = nextOuter;
    persist();
    return true;
  }

  function list(filter?: { manifestId?: string }): readonly PermissionLedgerEntry[] {
    const out: PermissionLedgerEntry[] = [];
    for (const [manifestId, perms] of Object.entries(decisions.value)) {
      if (filter?.manifestId !== undefined && filter.manifestId !== manifestId) continue;
      for (const [permission, decision] of Object.entries(perms)) {
        if (decision === undefined) continue;
        out.push({
          manifestId,
          permission: permission as AppPermission,
          granted: decision.granted,
          decidedAt: decision.decidedAt,
        });
      }
    }
    return out;
  }

  function hydrate(options?: PermissionStoreHydrateOptions): void {
    disposeKv?.();
    disposeKv = undefined;

    kvRef.value?.dispose();
    kvRef.value = new KVStore<PermissionPersistedState>(
      options?.storageNamespace ?? activeProfileKvNamespace(PERMISSIONS_KV_NAMESPACE),
      {
        version: 1,
        onRemoteChange(): void {
          handleRemoteKvNotification();
        },
      },
    );

    const persisted = kvRef.value.get(PERMISSIONS_KV_PRIMARY_KEY);
    const loaded = persisted !== null ? coerceState(persisted) : { ...DEFAULT_STATE };

    suppressWrite = true;
    decisions.value = { ...loaded.decisions };
    suppressWrite = false;

    disposeKv = (): void => {
      kvRef.value?.dispose();
      kvRef.value = undefined;
    };
  }

  function dispose(): void {
    disposeKv?.();
    disposeKv = undefined;
  }

  function isHydrated(): boolean {
    return kvRef.value !== undefined;
  }

  return {
    decisions,
    get,
    set,
    remove,
    list,
    hydrate,
    isHydrated,
    dispose,
  };
});
