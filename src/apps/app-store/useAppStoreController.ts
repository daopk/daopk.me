import { computed, onUnmounted, ref, shallowRef } from "vue";

import { useToast } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { fetchFirstPartyCatalogForUpdate } from "~/core/apps/firstParty/catalog";
import { FIRST_PARTY_APP_IDS } from "~/core/apps/firstParty/registry";
import { firstPartyCatalogEntryToAppManifest } from "~/core/apps/firstParty/registerFirstPartyApps";
import type { FirstPartyCatalogEntry } from "~/core/apps/firstParty/types";
import {
  formatFirstPartyReleaseLabel,
  isFirstPartyUpdateVersion,
} from "~/core/apps/firstParty/versions";
import type { AppManifest } from "~/types/app";

type AppCategory = AppManifest["category"];
type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "success" }
  | { kind: "error"; message: string };

interface ProcessRestartSnapshot {
  readonly args?: Readonly<Record<string, unknown>>;
  readonly handleId: string;
}

const CATEGORY_ORDER: readonly AppCategory[] = ["system", "productivity", "media", "dev", "other"];
const CATEGORY_LABELS: Record<AppCategory, string> = {
  dev: "Developer",
  media: "Media",
  other: "Other",
  productivity: "Productivity",
  system: "System",
};
const PROCESS_KILL_TIMEOUT_MS = 3000;

export function useAppStoreController() {
  const kernel = useKernel();
  const toast = useToast();
  const apps = shallowRef<readonly AppManifest[]>(visibleFirstPartyApps());
  const updateEntries = shallowRef<ReadonlyMap<string, FirstPartyCatalogEntry>>(new Map());
  const updatingIds = shallowRef<ReadonlySet<string>>(new Set());
  const checkState = ref<CheckState>({ kind: "idle" });

  const stopRegistered = kernel.events.on("app.registered", refreshApps);
  const stopUnregistered = kernel.events.on("app.unregistered", refreshApps);

  onUnmounted(() => {
    stopRegistered();
    stopUnregistered();
  });

  function visibleFirstPartyApps(): AppManifest[] {
    return kernel.apps
      .list()
      .filter((manifest) => FIRST_PARTY_APP_IDS.has(manifest.id) && manifest.hidden !== true)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function refreshApps(): void {
    apps.value = visibleFirstPartyApps();
  }

  const groupedApps = computed(() =>
    CATEGORY_ORDER.map((category) => ({
      apps: apps.value.filter((app) => app.category === category),
      category,
      label: CATEGORY_LABELS[category],
    })).filter((group) => group.apps.length > 0),
  );

  const availableUpdateCount = computed(
    () => apps.value.filter((app) => updateEntryFor(app) !== undefined).length,
  );

  const statusTone = computed<"info" | "success" | "warning" | "error">(() => {
    if (checkState.value.kind === "error") return "error";
    if (checkState.value.kind === "success") {
      return availableUpdateCount.value > 0 ? "warning" : "success";
    }
    return "info";
  });

  const statusMessage = computed(() => {
    if (checkState.value.kind === "checking") {
      return "Checking app catalog...";
    }
    if (checkState.value.kind === "error") {
      return checkState.value.message;
    }
    if (checkState.value.kind === "success") {
      const count = availableUpdateCount.value;
      return count === 0
        ? "All apps are up to date."
        : `${count} update${count === 1 ? "" : "s"} available.`;
    }
    return "";
  });

  function updateEntryFor(app: AppManifest): FirstPartyCatalogEntry | undefined {
    const entry = updateEntries.value.get(app.id);
    if (entry === undefined) {
      return undefined;
    }
    return isFirstPartyUpdateVersion(app.version, entry.version, app.build, entry.build)
      ? entry
      : undefined;
  }

  function appReleaseLabel(app: AppManifest): string {
    return formatFirstPartyReleaseLabel(app.version, app.build);
  }

  function catalogEntryReleaseLabel(entry: FirstPartyCatalogEntry | undefined): string {
    return formatFirstPartyReleaseLabel(entry?.version, entry?.build);
  }

  function isUpdating(appId: string): boolean {
    return updatingIds.value.has(appId);
  }

  function setUpdating(appId: string, updating: boolean): void {
    const next = new Set(updatingIds.value);
    if (updating) {
      next.add(appId);
    } else {
      next.delete(appId);
    }
    updatingIds.value = next;
  }

  async function checkForUpdates(): Promise<void> {
    if (checkState.value.kind === "checking") {
      return;
    }

    checkState.value = { kind: "checking" };
    const result = await fetchFirstPartyCatalogForUpdate();
    if (!result.ok) {
      updateEntries.value = new Map();
      checkState.value = { kind: "error", message: result.error };
      return;
    }

    const currentApps = new Map(apps.value.map((app) => [app.id, app] as const));
    const nextUpdates = new Map<string, FirstPartyCatalogEntry>();
    for (const entry of result.catalog.apps) {
      if (!FIRST_PARTY_APP_IDS.has(entry.id)) {
        continue;
      }
      const current = currentApps.get(entry.id);
      if (
        current === undefined ||
        !isFirstPartyUpdateVersion(current.version, entry.version, current.build, entry.build)
      ) {
        continue;
      }
      if (firstPartyCatalogEntryToAppManifest(entry) === null) {
        continue;
      }
      nextUpdates.set(entry.id, entry);
    }

    updateEntries.value = nextUpdates;
    checkState.value = { kind: "success" };
  }

  function restartSnapshotsForApp(manifestId: string): ProcessRestartSnapshot[] {
    return Array.from(kernel.processes.list())
      .filter(([, process]) => process.manifestId === manifestId)
      .map(([handleId, process]) => ({
        handleId,
        ...(process.args === undefined ? {} : { args: Object.freeze({ ...process.args }) }),
      }));
  }

  function waitForProcessKills(snapshots: readonly ProcessRestartSnapshot[]): Promise<void> {
    if (snapshots.length === 0) {
      return Promise.resolve();
    }

    const pending = new Set(snapshots.map((snapshot) => snapshot.handleId));
    return new Promise<void>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
      let offKilled: () => void = () => {};
      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        offKilled();
        if (timer !== undefined) {
          globalThis.clearTimeout(timer);
        }
        resolve();
      };
      timer = globalThis.setTimeout(finish, PROCESS_KILL_TIMEOUT_MS);
      offKilled = kernel.events.on("app.killed", ({ handleId }) => {
        pending.delete(handleId);
        if (pending.size === 0) {
          finish();
        }
      });

      for (const snapshot of snapshots) {
        kernel.processes.kill(snapshot.handleId, "kernel");
      }
    });
  }

  function launchRestartedApp(
    manifestId: string,
    snapshots: readonly ProcessRestartSnapshot[],
  ): void {
    const [first, ...rest] = snapshots;
    if (first === undefined) {
      return;
    }

    kernel.events.emit("app.launch.requested", {
      manifestId,
      source: "api",
      ...(first.args === undefined ? {} : { args: first.args }),
    });

    for (const snapshot of rest) {
      kernel.events.emit("app.spawn.new", {
        manifestId,
        source: "api",
        ...(snapshot.args === undefined ? {} : { args: snapshot.args }),
      });
    }
  }

  async function updateApp(app: AppManifest): Promise<void> {
    const entry = updateEntryFor(app);
    if (entry === undefined || isUpdating(app.id)) {
      return;
    }

    const manifest = firstPartyCatalogEntryToAppManifest(entry);
    if (manifest === null) {
      checkState.value = { kind: "error", message: `Could not update ${app.name}.` };
      return;
    }

    setUpdating(app.id, true);
    const restartSnapshots = restartSnapshotsForApp(app.id);
    try {
      kernel.apps.register(manifest, { source: "external" });
      await waitForProcessKills(restartSnapshots);
      launchRestartedApp(app.id, restartSnapshots);
      toast.success({
        title: "App updated",
        description: `${app.name} is now ${catalogEntryReleaseLabel(entry)}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checkState.value = { kind: "error", message };
      toast.error({ title: `Couldn't update ${app.name}`, description: message });
    } finally {
      setUpdating(app.id, false);
    }
  }

  function launchApp(manifestId: string): void {
    kernel.events.emit("app.launch.requested", {
      manifestId,
      source: "api",
    });
  }

  return {
    appReleaseLabel,
    apps,
    availableUpdateCount,
    catalogEntryReleaseLabel,
    checkForUpdates,
    checkState,
    groupedApps,
    isUpdating,
    launchApp,
    statusMessage,
    statusTone,
    updateApp,
    updateEntryFor,
  };
}
