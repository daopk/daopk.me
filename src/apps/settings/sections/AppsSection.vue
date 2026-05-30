<script setup lang="ts">
import { computed } from "vue";

import { EmptyState, ListButton, SectionHeader } from "~/components/kit";
import { useKernel } from "~/composables/useKernel";
import { appSettingsLaunchArgs, hasAppSettings } from "~/core/apps/appSettings";
import { ChevronRight as NavChevronIcon } from "~/icons/lucide";
import type { AppManifest } from "~/types/app";

const HIDDEN_PREFIX = "_";

const kernel = useKernel();

const apps = computed<readonly AppManifest[]>(() =>
  kernel.apps
    .list()
    .filter(
      (manifest) =>
        manifest.hidden !== true &&
        !manifest.id.startsWith(HIDDEN_PREFIX) &&
        hasAppSettings(manifest),
    )
    .sort((left, right) => left.name.localeCompare(right.name)),
);

function openAppSettings(manifestId: string): void {
  kernel.events.emit("app.launch.requested", {
    manifestId,
    source: "api",
    args: appSettingsLaunchArgs(),
  });
}
</script>

<template>
  <section class="apps-settings" aria-labelledby="apps-settings-title">
    <SectionHeader class="apps-settings__header">
      <h2 id="apps-settings-title" class="apps-settings__title">Apps</h2>
    </SectionHeader>

    <EmptyState v-if="apps.length === 0" class="apps-settings__empty">
      No app settings available.
    </EmptyState>

    <div v-else class="apps-settings__list">
      <ListButton
        v-for="app in apps"
        :key="app.id"
        class="apps-settings__item"
        @click="openAppSettings(app.id)"
      >
        <template #icon>
          <component :is="app.icon" class="apps-settings__icon" aria-hidden="true" />
        </template>
        <span class="apps-settings__name">{{ app.name }}</span>
        <template #end>
          <component :is="NavChevronIcon" class="apps-settings__chevron" aria-hidden="true" />
        </template>
      </ListButton>
    </div>
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
}

.apps-settings__item {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: var(--space-sm);
  min-block-size: 54px;
  padding: var(--space-sm) var(--space-md) var(--space-sm) var(--space-sm);
  text-align: start;
  transition:
    background-color 120ms var(--ease),
    border-color 120ms var(--ease);
}

.apps-settings__item:hover,
.apps-settings__item:focus-visible {
  background: var(--color-bg);
  border-color: color-mix(in srgb, var(--color-accent) 36%, var(--color-border));
}

.apps-settings__item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.apps-settings__icon {
  block-size: 38px;
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  inline-size: 38px;
}

.apps-settings__name {
  flex: 1 1 auto;
  font-weight: 550;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apps-settings__chevron {
  block-size: 16px;
  color: var(--color-fg-subtle, var(--color-fg-muted));
  flex: 0 0 auto;
  inline-size: 16px;
}

@media (max-width: 520px) {
  .apps-settings {
    padding: var(--space-lg) var(--space-md);
  }
}

@media (prefers-reduced-motion: reduce) {
  .apps-settings__item {
    transition: none;
  }
}
</style>
