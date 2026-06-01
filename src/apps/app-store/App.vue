<script setup lang="ts">
import { onUnmounted, shallowRef } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  ScrollArea,
  ToolbarTitle,
  useAppChrome,
} from "~/components/kit";
import { Button } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { FIRST_PARTY_APP_IDS } from "~/core/apps/firstParty/registry";
import { ExternalLink as LaunchIcon } from "~/icons/lucide";
import type { AppManifest } from "~/types/app";

useAppChrome({ title: () => "App Store" });

const kernel = useKernel();
const apps = shallowRef<readonly AppManifest[]>(visibleFirstPartyApps());

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

function launchApp(manifestId: string): void {
  kernel.events.emit("app.launch.requested", {
    manifestId,
    source: "api",
  });
}
</script>

<template>
  <AppFrame class="app-store" layout="flex-column" aria-label="App Store">
    <AppToolbar class="app-store__toolbar" density="comfortable">
      <ToolbarTitle title="App Store" subtitle="First-party apps" />
    </AppToolbar>

    <ScrollArea class="app-store__body" safe-area>
      <EmptyState v-if="apps.length === 0" class="app-store__center">
        No first-party apps available.
      </EmptyState>

      <ul v-else class="app-store__list">
        <li v-for="app in apps" :key="app.id" class="app-store__item">
          <component :is="app.icon" class="app-store__icon" aria-hidden="true" />

          <span class="app-store__copy">
            <span class="app-store__name">
              <span class="app-store__name-text">{{ app.name }}</span>
              <span v-if="app.version" class="app-store__version">v{{ app.version }}</span>
            </span>
            <span class="app-store__category">
              {{ app.category }}
            </span>
          </span>

          <Button
            class="app-store__launch"
            size="sm"
            variant="primary"
            :icon-start="LaunchIcon"
            @click="launchApp(app.id)"
          >
            Open
          </Button>
        </li>
      </ul>
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
  gap: var(--space-md);
  padding: var(--space-md);
}

.app-store__center {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
  padding: var(--space-xl) 0;
}

.app-store__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
}

.app-store__item {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
}

.app-store__icon {
  block-size: 40px;
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  inline-size: 40px;
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
  align-items: baseline;
  display: flex;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.app-store__name-text {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-store__version {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  font-size: 12px;
}

.app-store__category {
  color: var(--color-fg-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}

.app-store__launch {
  flex: 0 0 auto;
}
</style>
