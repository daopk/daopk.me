import { defineStore } from "pinia";
import { ref, shallowRef, type Ref } from "vue";

import { validateExternalManifest } from "~/core/apps/externalManifest";
import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import { APPS_KV_NAMESPACE, APPS_KV_PRIMARY_KEY } from "~/core/storage/constants";
import { KVStore } from "~/core/storage/KVStore";
import type { ExternalAppManifest } from "~/types/externalApp";

/** A persisted installed external app: its source URL + the validated manifest. */
export interface InstalledAppRecord {
  /** Absolute URL the manifest JSON was fetched from (used by update/uninstall). */
  manifestUrl: string;
  manifest: ExternalAppManifest;
}

interface InstalledAppsPersistedState {
  apps: Record<string, InstalledAppRecord>;
}

/**
 * Called after a CROSS-TAB KV change mutates the in-memory state, so the caller
 * (kernel/boot) can reconcile the app registry: register newly-added apps and
 * unregister removed ones. Local `add`/`remove` do NOT fire this — the
 * install/uninstall service owns registry changes for the acting tab.
 */
export type InstalledAppsReconcile = (records: readonly InstalledAppRecord[]) => void;

export interface InstalledAppsHydrateOptions {
  storageNamespace?: string;
  onReconcile?: InstalledAppsReconcile;
}

const DEFAULT_STATE: InstalledAppsPersistedState = { apps: {} };

function coerceState(candidate: unknown): InstalledAppsPersistedState {
  if (typeof candidate !== "object" || candidate === null) {
    return { apps: {} };
  }
  const c = candidate as Partial<InstalledAppsPersistedState>;
  if (typeof c.apps !== "object" || c.apps === null) {
    return { apps: {} };
  }
  const cleaned: Record<string, InstalledAppRecord> = {};
  for (const [id, rawRecord] of Object.entries(c.apps)) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof rawRecord !== "object" || rawRecord === null) continue;
    const r = rawRecord as Partial<InstalledAppRecord>;
    if (typeof r.manifestUrl !== "string" || r.manifestUrl.length === 0) continue;
    const validation = validateExternalManifest(r.manifest);
    if (!validation.ok) continue;
    // Canonicalize on the manifest id so a tampered key cannot shadow an app.
    if (validation.manifest.id !== id) continue;
    cleaned[validation.manifest.id] = {
      manifestUrl: r.manifestUrl,
      manifest: validation.manifest,
    };
  }
  return { apps: cleaned };
}

export const useInstalledAppsStore = defineStore("kernel-installed-apps", () => {
  const kvRef = shallowRef<KVStore<InstalledAppsPersistedState>>();
  const apps: Ref<Readonly<Record<string, InstalledAppRecord>>> = ref({});

  let suppressWrite = false;
  let disposeKv: undefined | (() => void);
  let reconcile: InstalledAppsReconcile | undefined;

  function persist(): void {
    const store = kvRef.value;
    if (!store || suppressWrite) return;
    const snapshot: Record<string, InstalledAppRecord> = {};
    for (const [id, record] of Object.entries(apps.value)) {
      snapshot[id] = record;
    }
    store.set(APPS_KV_PRIMARY_KEY, { apps: snapshot });
  }

  function applyState(next: InstalledAppsPersistedState): void {
    suppressWrite = true;
    apps.value = { ...next.apps };
    suppressWrite = false;
  }

  function handleRemoteKvNotification(): void {
    const store = kvRef.value;
    const raw = store?.get(APPS_KV_PRIMARY_KEY);
    applyState(raw === null || raw === undefined ? { apps: {} } : coerceState(raw));
    reconcile?.(list());
  }

  function has(id: string): boolean {
    return apps.value[id] !== undefined;
  }

  /** Membership in this store is the single source of truth for "is external". */
  function isExternalApp(id: string): boolean {
    return has(id);
  }

  function get(id: string): InstalledAppRecord | undefined {
    return apps.value[id];
  }

  function list(): readonly InstalledAppRecord[] {
    return Object.values(apps.value);
  }

  function add(record: InstalledAppRecord): void {
    if (!kvRef.value) return;
    apps.value = { ...apps.value, [record.manifest.id]: record };
    persist();
  }

  function remove(id: string): boolean {
    if (!kvRef.value) return false;
    if (apps.value[id] === undefined) return false;
    const next = { ...apps.value };
    delete next[id];
    apps.value = next;
    persist();
    return true;
  }

  function hydrate(options?: InstalledAppsHydrateOptions): void {
    disposeKv?.();
    disposeKv = undefined;
    reconcile = options?.onReconcile;

    kvRef.value?.dispose();
    kvRef.value = new KVStore<InstalledAppsPersistedState>(
      options?.storageNamespace ?? activeProfileKvNamespace(APPS_KV_NAMESPACE),
      {
        version: 1,
        onRemoteChange(): void {
          handleRemoteKvNotification();
        },
      },
    );

    const persisted = kvRef.value.get(APPS_KV_PRIMARY_KEY);
    const loaded = persisted !== null ? coerceState(persisted) : { ...DEFAULT_STATE };

    suppressWrite = true;
    apps.value = { ...loaded.apps };
    suppressWrite = false;

    disposeKv = (): void => {
      kvRef.value?.dispose();
      kvRef.value = undefined;
    };
  }

  function dispose(): void {
    disposeKv?.();
    disposeKv = undefined;
    reconcile = undefined;
  }

  function isHydrated(): boolean {
    return kvRef.value !== undefined;
  }

  return {
    apps,
    has,
    isExternalApp,
    get,
    list,
    add,
    remove,
    hydrate,
    isHydrated,
    dispose,
  };
});
