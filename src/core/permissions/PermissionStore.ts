import { defineStore } from "pinia";
import { ref, type Ref } from "vue";

import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import { PERMISSIONS_KV_NAMESPACE, PERMISSIONS_KV_PRIMARY_KEY } from "~/core/storage/constants";
import { createPersistedState } from "~/core/storage/createPersistedState";
import type { AppPermission } from "~/types/app";
import type {
  PermissionLedgerEntry,
  PersistedPermissionDecision,
  PersistedPermissionState,
} from "~/types/permissions";

interface PermissionPersistedState {
  decisions: PersistedPermissionState;
}

interface PermissionStoreHydrateOptions {
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
  // must call `set` / `remove` to mutate, never push into the ref.
  const decisions: Ref<Readonly<PersistedPermissionState>> = ref({});

  function snapshot(): PermissionPersistedState {
    const cloned: PersistedPermissionState = {};
    for (const [manifestId, perms] of Object.entries(decisions.value)) {
      cloned[manifestId] = { ...perms };
    }
    return { decisions: cloned };
  }

  const persistence = createPersistedState<PermissionPersistedState>({
    primaryKey: PERMISSIONS_KV_PRIMARY_KEY,
    version: 1,
    snapshot,
    resolve: (candidate) => ({
      value: candidate === null ? { ...DEFAULT_STATE } : coerceState(candidate),
    }),
    apply: applyState,
  });

  function applyState(next: PermissionPersistedState): void {
    decisions.value = { ...next.decisions };
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
    if (!persistence.isHydrated) return;
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
  }

  function remove(manifestId: string, permission: AppPermission): boolean {
    if (!persistence.isHydrated) return false;
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
    persistence.hydrate(
      options?.storageNamespace ?? activeProfileKvNamespace(PERMISSIONS_KV_NAMESPACE),
    );
  }

  function dispose(): void {
    persistence.dispose();
  }

  function isHydrated(): boolean {
    return persistence.isHydrated;
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
