<script setup lang="ts">
import { onUnmounted, shallowRef } from "vue";

import { EmptyState, IconButton, SectionHeader } from "~/components/kit";
import { useKernel } from "~/composables/useKernel";
import { appSettingsLaunchArgs, hasAppSettings } from "~/core/apps/appSettings";
import { ExternalLink as LaunchIcon, Settings as SettingsIcon } from "~/icons/lucide";
import type { AppManifest } from "~/types/app";

const HIDDEN_PREFIX = "_";

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const kernel = useKernel();

const apps = shallowRef<readonly AppManifest[]>(visibleApps());

const stopRegistered = kernel.events.on("app.registered", refreshApps);
const stopUnregistered = kernel.events.on("app.unregistered", refreshApps);

onUnmounted(() => {
  stopRegistered();
  stopUnregistered();
});

function visibleApps(): AppManifest[] {
  return kernel.apps
    .list()
    .filter((manifest) => manifest.hidden !== true && !manifest.id.startsWith(HIDDEN_PREFIX))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function refreshApps(): void {
  apps.value = visibleApps();
}

function launchApp(manifestId: string): void {
  kernel.events.emit("app.launch.requested", {
    manifestId,
    source: "api",
  });
}

function openAppSettings(manifestId: string): void {
  kernel.events.emit("app.launch.requested", {
    manifestId,
    source: "api",
    args: appSettingsLaunchArgs(),
  });
}
</script>

<template>
  <section class="apps-settings" aria-label="Apps settings">
    <SectionHeader v-if="props.showHeader" class="apps-settings__header">
      <h2 id="apps-settings-title" class="apps-settings__title">Apps</h2>
    </SectionHeader>

    <EmptyState v-if="apps.length === 0" class="apps-settings__empty">
      No apps available.
    </EmptyState>

    <ul v-else class="apps-settings__list">
      <li v-for="app in apps" :key="app.id" class="apps-settings__item">
        <div class="apps-settings__identity">
          <component :is="app.icon" class="apps-settings__icon" aria-hidden="true" />
          <span class="apps-settings__copy">
            <span class="apps-settings__name">{{ app.name }}</span>
            <span class="apps-settings__category">{{ app.category }}</span>
          </span>
        </div>

        <div class="apps-settings__actions">
          <IconButton
            v-if="hasAppSettings(app)"
            class="apps-settings__settings-action"
            :icon="SettingsIcon"
            :label="`Open ${app.name} settings`"
            variant="subtle"
            @click="openAppSettings(app.id)"
          />
          <IconButton
            class="apps-settings__launch-action"
            :icon="LaunchIcon"
            :label="`Open ${app.name}`"
            variant="subtle"
            @click="launchApp(app.id)"
          />
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.apps-settings {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-xl);
}

.apps-settings__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.apps-settings__title {
  font-size: 20px;
  font-weight: 650;
  line-height: 1.2;
  margin: 0;
}

.apps-settings__empty {
  color: var(--color-fg-muted);
  font-size: 14px;
}

.apps-settings__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
}

.apps-settings__item {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  min-block-size: 54px;
  padding: var(--space-sm) var(--space-md) var(--space-sm) var(--space-sm);
}

.apps-settings__identity {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.apps-settings__icon {
  block-size: 38px;
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  inline-size: 38px;
}

.apps-settings__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.apps-settings__name,
.apps-settings__category {
  flex: 1 1 auto;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apps-settings__name {
  font-weight: 550;
}

.apps-settings__category {
  color: var(--color-fg-muted);
  font-size: 12px;
  text-transform: capitalize;
}

.apps-settings__actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
}

.apps-settings__settings-action,
.apps-settings__launch-action {
  flex: 0 0 auto;
}

@media (max-width: 520px) {
  .apps-settings {
    padding: var(--space-lg) var(--space-md);
  }

  .apps-settings__item {
    align-items: flex-start;
    flex-direction: column;
    padding: var(--space-md);
  }

  .apps-settings__actions {
    align-self: flex-end;
  }
}
</style>
