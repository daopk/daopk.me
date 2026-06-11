<script setup lang="ts">
import { computed, onUnmounted, shallowRef, watch } from "vue";

import { ActionRow, EmptyState, GroupLabel, Panel, SectionHeader } from "~/components/kit";
import Switch from "~/components/ui/Switch.vue";
import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import { useKernel } from "~/composables/useKernel";
import { useSettings } from "~/composables/useSettings";
import type { AppManifest } from "~/types/app";

const HIDDEN_PREFIX = "_";

const kernel = useKernel();
const settings = useSettings();
const { locale, t } = useSettingsI18n();

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const currentDockAutoHide = computed(() => settings.dockAutoHide);
const apps = shallowRef<readonly AppManifest[]>(visibleApps());

const stopRegistered = kernel.events.on("app.registered", refreshApps);
const stopUnregistered = kernel.events.on("app.unregistered", refreshApps);

watch(locale, refreshApps);

onUnmounted(() => {
  stopRegistered();
  stopUnregistered();
});

function setDockAutoHide(next: boolean): void {
  if (next === currentDockAutoHide.value) {
    return;
  }
  kernel.settings.set("dockAutoHide", next);
}

function visibleApps(): AppManifest[] {
  return kernel.apps
    .list()
    .filter((manifest) => manifest.hidden !== true && !manifest.id.startsWith(HIDDEN_PREFIX))
    .sort((left, right) => left.name.localeCompare(right.name, locale.value));
}

function refreshApps(): void {
  apps.value = visibleApps();
}

function isPinned(manifestId: string): boolean {
  return settings.dockPinnedAppIds.includes(manifestId);
}

function setPinned(manifestId: string, next: boolean): void {
  const current = settings.dockPinnedAppIds;
  const pinned = current.includes(manifestId);

  if (next === pinned) {
    return;
  }

  kernel.settings.set(
    "dockPinnedAppIds",
    next ? [...current, manifestId] : current.filter((pinnedId) => pinnedId !== manifestId),
  );
}

function categoryLabel(category: AppManifest["category"]): string {
  switch (category) {
    case "system":
      return t("settings.dock.category.system");
    case "productivity":
      return t("settings.dock.category.productivity");
    case "media":
      return t("settings.dock.category.media");
    case "dev":
      return t("settings.dock.category.dev");
    case "other":
      return t("settings.dock.category.other");
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}
</script>

<template>
  <article class="dock-settings" :aria-label="t('settings.dock.ariaLabel')">
    <SectionHeader
      v-if="props.showHeader"
      size="page"
      :title="t('settings.dock.title')"
      :subtitle="t('settings.dock.subtitle')"
    />

    <Panel
      as="section"
      class="dock-settings__group"
      variant="plain"
      padding="none"
      aria-labelledby="dock-autohide-group-label"
    >
      <GroupLabel id="dock-autohide-group-label" as="h3">
        {{ t("settings.dock.visibility") }}
      </GroupLabel>
      <ActionRow as="div" class="dock-settings__toggle-row">
        <template #copy>
          <span class="dock-settings__toggle-copy">
            <span id="dock-autohide-label" class="dock-settings__toggle-label">
              {{ t("settings.dock.autoHideLabel") }}
            </span>
            <span class="dock-settings__toggle-hint">
              {{ t("settings.dock.autoHideHint") }}
            </span>
          </span>
        </template>
        <Switch
          :model-value="currentDockAutoHide"
          aria-labelledby="dock-autohide-label"
          @update:model-value="setDockAutoHide"
        />
      </ActionRow>
    </Panel>

    <Panel
      as="section"
      class="dock-settings__group"
      variant="plain"
      padding="none"
      aria-labelledby="dock-pinned-group-label"
    >
      <GroupLabel id="dock-pinned-group-label" as="h3">
        {{ t("settings.dock.pinnedApps") }}
      </GroupLabel>

      <EmptyState v-if="apps.length === 0" class="dock-settings__empty">
        {{ t("settings.dock.noApps") }}
      </EmptyState>

      <ul v-else class="dock-settings__app-list">
        <li v-for="app in apps" :key="app.id" class="dock-settings__app-item">
          <div class="dock-settings__app-identity">
            <component :is="app.icon" class="dock-settings__app-icon" aria-hidden="true" />
            <span class="dock-settings__app-copy">
              <span :id="`dock-pin-${app.id}-label`" class="dock-settings__app-name">
                {{ app.name }}
              </span>
              <span class="dock-settings__app-category">{{ categoryLabel(app.category) }}</span>
            </span>
          </div>

          <Switch
            class="dock-settings__pin-switch"
            :model-value="isPinned(app.id)"
            :aria-labelledby="`dock-pin-${app.id}-label`"
            @update:model-value="setPinned(app.id, $event)"
          />
        </li>
      </ul>
    </Panel>
  </article>
</template>

<style scoped lang="scss">
.dock-settings {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.dock-settings__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.dock-settings__toggle-row,
.dock-settings__app-item {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  padding: var(--space-md);
}

.dock-settings__empty {
  color: var(--color-fg-muted);
  font-size: 14px;
}

.dock-settings__app-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
}

.dock-settings__app-item {
  min-block-size: 58px;
  padding-block: var(--space-sm);
}

.dock-settings__app-identity {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.dock-settings__app-icon {
  block-size: 38px;
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  inline-size: 38px;
}

.dock-settings__app-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.dock-settings__app-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dock-settings__app-category {
  color: var(--color-fg-muted);
  font-size: 11px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}

.dock-settings__pin-switch {
  flex: 0 0 auto;
}

.dock-settings__toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.dock-settings__toggle-label {
  font-size: 13px;
  font-weight: 600;
}

.dock-settings__toggle-hint {
  color: var(--color-fg-muted);
  font-size: 11px;
  line-height: 1.4;
}

@media (max-width: 520px) {
  .dock-settings {
    padding: var(--space-lg) var(--space-md);
  }
}
</style>
