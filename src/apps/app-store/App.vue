<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef } from "vue";

import {
  AppFrame,
  AppToolbar,
  Badge,
  EmptyState,
  ScrollArea,
  StatusBanner,
  ToolbarTitle,
  useAppChrome,
} from "~/components/kit";
import { Button } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { fetchFirstPartyCatalogForUpdate } from "~/core/apps/firstParty/catalog";
import { FIRST_PARTY_APP_IDS } from "~/core/apps/firstParty/registry";
import { firstPartyCatalogEntryToAppManifest } from "~/core/apps/firstParty/registerFirstPartyApps";
import type { FirstPartyCatalogEntry } from "~/core/apps/firstParty/types";
import {
  formatFirstPartyReleaseLabel,
  isFirstPartyUpdateVersion,
} from "~/core/apps/firstParty/versions";
import { Download as UpdateIcon, ExternalLink as LaunchIcon, RefreshCw } from "~/icons/lucide";
import type { AppManifest } from "~/types/app";

useAppChrome({ title: () => "App Store" });

type AppCategory = AppManifest["category"];
type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "success" }
  | { kind: "error"; message: string };
interface ProcessRestartSnapshot {
  readonly handleId: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

const CATEGORY_ORDER: readonly AppCategory[] = ["system", "productivity", "media", "dev", "other"];
const CATEGORY_LABELS: Record<AppCategory, string> = {
  system: "System",
  productivity: "Productivity",
  media: "Media",
  dev: "Developer",
  other: "Other",
};
const PROCESS_KILL_TIMEOUT_MS = 3000;

const kernel = useKernel();
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
    category,
    label: CATEGORY_LABELS[category],
    apps: apps.value.filter((app) => app.category === category),
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
  } catch (error) {
    checkState.value = {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
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
</script>

<template>
  <AppFrame class="app-store" layout="flex-column" aria-label="App Store">
    <AppToolbar class="app-store__toolbar" density="comfortable" wrap>
      <ToolbarTitle title="App Store" subtitle="First-party apps" />
      <template #end>
        <Button
          class="app-store__check"
          size="sm"
          :icon-start="RefreshCw"
          :loading="checkState.kind === 'checking'"
          @click="checkForUpdates"
        >
          Check updates
        </Button>
      </template>
    </AppToolbar>

    <ScrollArea class="app-store__body" safe-area>
      <StatusBanner
        v-if="checkState.kind !== 'idle'"
        class="app-store__status"
        :tone="statusTone"
        :role="checkState.kind === 'error' ? 'alert' : 'status'"
      >
        {{ statusMessage }}
      </StatusBanner>

      <EmptyState v-if="apps.length === 0" class="app-store__center">
        No first-party apps available.
      </EmptyState>

      <div v-else class="app-store__categories">
        <section
          v-for="group in groupedApps"
          :key="group.category"
          class="app-store__section"
          :aria-labelledby="`app-store-category-${group.category}`"
        >
          <header class="app-store__section-header">
            <h2 :id="`app-store-category-${group.category}`" class="app-store__section-title">
              {{ group.label }}
            </h2>
            <span class="app-store__section-count">{{ group.apps.length }}</span>
          </header>

          <ul class="app-store__grid">
            <li v-for="app in group.apps" :key="app.id" class="app-store__card">
              <div class="app-store__identity">
                <component :is="app.icon" class="app-store__icon" aria-hidden="true" />
                <span class="app-store__copy">
                  <span class="app-store__name">{{ app.name }}</span>
                  <span class="app-store__version">{{ appReleaseLabel(app) }}</span>
                </span>
              </div>

              <div class="app-store__meta">
                <span class="app-store__category">{{ group.label }}</span>
                <Badge v-if="updateEntryFor(app)" class="app-store__badge" tone="accent">
                  {{ catalogEntryReleaseLabel(updateEntryFor(app)) }}
                </Badge>
              </div>

              <Button
                v-if="updateEntryFor(app)"
                class="app-store__action app-store__update"
                size="sm"
                variant="primary"
                :icon-start="UpdateIcon"
                :loading="isUpdating(app.id)"
                @click="updateApp(app)"
              >
                Update
              </Button>
              <Button
                v-else
                class="app-store__action app-store__launch"
                size="sm"
                variant="secondary"
                :icon-start="LaunchIcon"
                @click="launchApp(app.id)"
              >
                Open
              </Button>
            </li>
          </ul>
        </section>
      </div>
    </ScrollArea>
  </AppFrame>
</template>

<style scoped lang="scss">
.app-store__toolbar {
  border-block-end: 1px solid var(--color-border);
}

.app-store__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-lg);
  padding: var(--space-md);
}

.app-store__check {
  flex: 0 0 auto;
}

.app-store__center {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
  padding: var(--space-xl) 0;
}

.app-store__status {
  font-size: 13px;
}

.app-store__categories {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.app-store__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.app-store__section-header {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  justify-content: space-between;
  min-inline-size: 0;
}

.app-store__section-title {
  color: var(--color-fg);
  font-size: 15px;
  font-weight: 650;
  line-height: var(--leading-tight);
  margin: 0;
}

.app-store__section-count {
  color: var(--color-fg-muted);
  font-size: 12px;
}

.app-store__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.app-store__card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-block-size: 168px;
  min-inline-size: 0;
  padding: var(--space-md);
}

.app-store__identity {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.app-store__icon {
  block-size: 42px;
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  inline-size: 42px;
  object-fit: cover;
}

.app-store__copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.app-store__name {
  color: var(--color-fg);
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-store__version {
  color: var(--color-fg-muted);
  font-size: 12px;
}

.app-store__meta {
  align-items: center;
  display: flex;
  gap: var(--space-xs);
  justify-content: space-between;
  min-inline-size: 0;
}

.app-store__category {
  color: var(--color-fg-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}

.app-store__badge {
  flex: 0 0 auto;
}

.app-store__action {
  inline-size: 100%;
  margin-block-start: auto;
}

@media (max-width: 520px) {
  .app-store__check {
    inline-size: 100%;
  }
}
</style>
