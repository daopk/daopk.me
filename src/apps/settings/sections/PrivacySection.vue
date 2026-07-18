<script setup vapor lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { SettingsPrivacyIcon as ShieldIcon } from "~/icons/fluentColor";
import { X as RevokeIcon } from "~/icons/lucide";

import { ActionRow, EmptyState, Panel, SectionHeader } from "~/components/kit";
import { Button, Switch } from "~/components/ui";
import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import { useKernel } from "~/composables/useKernel";
import type { AppPermission } from "~/types/app";
import type { PermissionLedgerEntry } from "~/types/permissions";

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

interface GroupedApp {
  manifestId: string;
  appName: string;
  rows: readonly PermissionLedgerEntry[];
}

const kernel = useKernel();
const { locale, t } = useSettingsI18n();
const telemetryEnabled = kernel.settings.use("telemetryEnabled");

const entries = ref<readonly PermissionLedgerEntry[]>(kernel.permissions.list());

function refresh(): void {
  entries.value = kernel.permissions.list();
}

const stopGranted = kernel.events.on("permission.granted", refresh);
const stopDenied = kernel.events.on("permission.denied", refresh);
const stopRevoked = kernel.events.on("permission.revoked", refresh);

onUnmounted(() => {
  stopGranted();
  stopDenied();
  stopRevoked();
});

/**
 * Resolve manifest name on each render. We DO NOT subscribe to
 * `app.registered` / `app.unregistered` because (a) the catalog only
 * changes during boot in v1, and (b) a stale name in the rare case
 * an app unregisters at runtime is harmless — the row still has the
 * manifestId fallback.
 */
function nameFor(manifestId: string): string {
  return kernel.apps.list().find((m) => m.id === manifestId)?.name ?? manifestId;
}

const groups = computed<readonly GroupedApp[]>(() => {
  const byApp = new Map<string, PermissionLedgerEntry[]>();
  for (const entry of entries.value) {
    const bucket = byApp.get(entry.manifestId) ?? [];
    bucket.push(entry);
    byApp.set(entry.manifestId, bucket);
  }
  return [...byApp.entries()]
    .map(([manifestId, rows]) => ({
      manifestId,
      appName: nameFor(manifestId),
      rows: [...rows].sort((a, b) => a.permission.localeCompare(b.permission)),
    }))
    .sort((a, b) => a.appName.localeCompare(b.appName));
});

function describeDecision(entry: PermissionLedgerEntry): string {
  return t(entry.granted ? "settings.privacy.allowedTo" : "settings.privacy.blockedFrom", {
    permission: permissionCopy(entry.permission),
  });
}

function describeWhen(decidedAt: number): string {
  const ms = Date.now() - decidedAt;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return t("settings.privacy.when.justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return t(
      min === 1 ? "settings.privacy.when.minute.one" : "settings.privacy.when.minute.other",
      { count: min },
    );
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return t(hr === 1 ? "settings.privacy.when.hour.one" : "settings.privacy.when.hour.other", {
      count: hr,
    });
  }
  const day = Math.floor(hr / 24);
  if (day < 30) {
    return t(day === 1 ? "settings.privacy.when.day.one" : "settings.privacy.when.day.other", {
      count: day,
    });
  }
  return new Date(decidedAt).toLocaleDateString(locale.value);
}

function revoke(entry: PermissionLedgerEntry): void {
  kernel.permissions.revoke(entry.manifestId, entry.permission);
}

function setTelemetryEnabled(next: boolean): void {
  kernel.settings.set("telemetryEnabled", next);
}

function permissionCopy(permission: AppPermission): string {
  switch (permission) {
    case "notifications.post":
      return t("settings.permission.notifications.post");
    case "network.fetch":
      return t("settings.permission.network.fetch");
    case "vfs.read":
      return t("settings.permission.vfs.read");
    case "vfs.write":
      return t("settings.permission.vfs.write");
    case "storage.write":
      return t("settings.permission.storage.write");
    case "shortcut.global":
      return t("settings.permission.shortcut.global");
    default: {
      const _exhaustive: never = permission;
      return _exhaustive;
    }
  }
}
</script>

<template>
  <article class="privacy" :aria-label="t('settings.privacy.ariaLabel')">
    <SectionHeader
      v-if="props.showHeader"
      size="page"
      :title="t('settings.privacy.title')"
      :subtitle="t('settings.privacy.subtitle')"
    />

    <ActionRow as="section" class="privacy__telemetry" aria-labelledby="privacy-telemetry-title">
      <template #copy>
        <div class="privacy__telemetry-text">
          <h3 id="privacy-telemetry-title" class="privacy__telemetry-title">
            {{ t("settings.privacy.telemetryTitle") }}
          </h3>
          <p class="privacy__telemetry-copy">
            {{ t("settings.privacy.telemetryCopy") }}
          </p>
        </div>
      </template>
      <Switch
        :model-value="telemetryEnabled"
        :ariaLabel="
          telemetryEnabled
            ? t('settings.privacy.disableTelemetry')
            : t('settings.privacy.enableTelemetry')
        "
        @update:model-value="setTelemetryEnabled"
      />
    </ActionRow>

    <EmptyState v-if="groups.length === 0" class="privacy__empty" aria-live="polite">
      <template #icon>
        <ShieldIcon class="privacy__empty-icon" aria-hidden="true" />
      </template>
      <p class="privacy__empty-text">
        {{ t("settings.privacy.empty") }}
      </p>
    </EmptyState>

    <ul v-else class="privacy__app-list">
      <Panel
        v-for="group in groups"
        :key="group.manifestId"
        as="li"
        class="privacy__app"
        padding="none"
        variant="elevated"
      >
        <header class="privacy__app-header">
          <h3 class="privacy__app-name">{{ group.appName }}</h3>
          <p class="privacy__app-id">{{ group.manifestId }}</p>
        </header>
        <ul class="privacy__row-list">
          <ActionRow v-for="row in group.rows" :key="row.permission" as="li" class="privacy__row">
            <template #copy>
              <div class="privacy__row-text">
                <span
                  class="privacy__row-decision"
                  :class="{ 'privacy__row-decision--denied': !row.granted }"
                >
                  {{ describeDecision(row) }}
                </span>
                <span class="privacy__row-when">{{ describeWhen(row.decidedAt) }}</span>
              </div>
            </template>
            <Button
              variant="ghost"
              size="sm"
              :aria-label="
                t('settings.privacy.revokeAria', {
                  decision: describeDecision(row).toLocaleLowerCase(locale),
                  appName: group.appName,
                })
              "
              @click="revoke(row)"
            >
              <template #left><RevokeIcon size="1em" aria-hidden="true" /></template>
              {{ t("settings.privacy.revoke") }}
            </Button>
          </ActionRow>
        </ul>
      </Panel>
    </ul>
  </article>
</template>

<style scoped lang="scss">
.privacy {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.privacy__telemetry {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-lg);
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
}

.privacy__telemetry-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.privacy__telemetry-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.privacy__telemetry-copy {
  color: var(--color-fg-muted);
  font-size: 12px;
  line-height: 1.4;
  margin: 0;
  max-inline-size: 64ch;
}

.privacy__empty {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg-muted);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-xl);
  text-align: center;
}

.privacy__empty-icon {
  block-size: 36px;
  inline-size: 36px;
  opacity: 0.9;
}

.privacy__empty-text {
  font-size: 13px;
  margin: 0;
  max-inline-size: 50ch;
}

.privacy__app-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  list-style: none;
  margin: 0;
  padding: 0;
}

.privacy__app {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg);
}

.privacy__app-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-block-end: var(--space-sm);
}

.privacy__app-name {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.privacy__app-id {
  color: var(--color-fg-muted);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
  font-size: 11px;
  margin: 0;
}

.privacy__row-list {
  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 0;
  padding: 0;
}

.privacy__row {
  align-items: center;
  border-block-start: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  padding: var(--space-sm) 0;

  &:first-child {
    border-block-start: none;
  }
}

.privacy__row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.privacy__row-decision {
  font-size: 13px;
}

.privacy__row-decision--denied {
  color: var(--color-fg-muted);
}

.privacy__row-when {
  color: var(--color-fg-muted);
  font-size: 11px;
}
</style>
