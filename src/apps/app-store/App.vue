<script setup vapor lang="ts">
import Icon from "~/icons/Icon.vue";
import { computed } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  ScrollArea,
  ToolbarTitle,
  useAppChrome,
} from "~/components/kit";
import { Alert, Badge, Button } from "~/components/ui";
import AppIcon from "~/components/AppIcon.vue";
import UpdateIcon from "~icons/lucide/download";
import LaunchIcon from "~icons/lucide/external-link";
import RefreshCw from "~icons/lucide/refresh-cw";

import { useAppStoreController } from "./useAppStoreController";

useAppChrome({ title: () => "App Store" });

const {
  appReleaseLabel,
  apps,
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
} = useAppStoreController();

const statusColor = computed(() => {
  switch (statusTone.value) {
    case "success":
      return "green" as const;
    case "warning":
      return "yellow" as const;
    case "error":
      return "red" as const;
    case "info":
      return "blue" as const;
  }
  return "blue" as const;
});
</script>

<template>
  <AppFrame class="app-store" layout="flex-column" aria-label="App Store">
    <AppToolbar class="app-store__toolbar" density="comfortable" wrap>
      <ToolbarTitle title="App Store" subtitle="First-party apps" />
      <template #end>
        <Button
          class="app-store__check"
          size="sm"
          :loading="checkState.kind === 'checking'"
          @click="checkForUpdates"
        >
          <template #left><Icon :icon="RefreshCw" size="14" aria-hidden="true" /></template>
          Check updates
        </Button>
      </template>
    </AppToolbar>

    <ScrollArea class="app-store__body" safe-area>
      <Alert
        v-if="checkState.kind !== 'idle'"
        class="app-store__status"
        :color="statusColor"
        variant="surface"
        :role="checkState.kind === 'error' ? 'alert' : 'status'"
      >
        {{ statusMessage }}
      </Alert>

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
                <AppIcon :icon="app.icon" class="app-store__icon" aria-hidden="true" />
                <span class="app-store__copy">
                  <span class="app-store__name">{{ app.name }}</span>
                  <span class="app-store__version">{{ appReleaseLabel(app) }}</span>
                </span>
              </div>

              <div class="app-store__meta">
                <span class="app-store__category">{{ group.label }}</span>
                <Badge
                  v-if="updateEntryFor(app)"
                  class="app-store__badge"
                  color="blue"
                  variant="subtle"
                >
                  {{ catalogEntryReleaseLabel(updateEntryFor(app)) }}
                </Badge>
              </div>

              <Button
                v-if="updateEntryFor(app)"
                class="app-store__action app-store__update"
                size="sm"
                variant="solid"
                :loading="isUpdating(app.id)"
                @click="updateApp(app)"
              >
                <template #left><Icon :icon="UpdateIcon" size="14" aria-hidden="true" /></template>
                Update
              </Button>
              <Button
                v-else
                class="app-store__action app-store__launch"
                size="sm"
                @click="launchApp(app.id)"
              >
                <template #left><Icon :icon="LaunchIcon" size="14" aria-hidden="true" /></template>
                Open
              </Button>
            </li>
          </ul>
        </section>
      </div>
    </ScrollArea>
  </AppFrame>
</template>

<style scoped lang="scss" src="./styles/app-store.scss"></style>
