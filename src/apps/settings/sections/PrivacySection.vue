<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { SettingsPrivacyIcon as ShieldIcon } from "~/icons/fluentColor";
import { X as RevokeIcon } from "~/icons/lucide";

import { ActionRow, EmptyState, Panel, SectionHeader } from "~/components/kit";
import { Button, Switch } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { permissionLabel } from "~/core/permissions/copy";
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
  const verb = entry.granted ? "Allowed to" : "Blocked from";
  return `${verb} ${permissionLabel(entry.permission)}`;
}

function describeWhen(decidedAt: number): string {
  const ms = Date.now() - decidedAt;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(decidedAt).toLocaleDateString();
}

function revoke(entry: PermissionLedgerEntry): void {
  kernel.permissions.revoke(entry.manifestId, entry.permission);
}

function setTelemetryEnabled(next: boolean): void {
  kernel.settings.set("telemetryEnabled", next);
}
</script>

<template>
  <article class="privacy" aria-label="Privacy settings">
    <SectionHeader v-if="props.showHeader" class="privacy__header">
      <h2 class="privacy__title">Privacy</h2>
      <p class="privacy__hint">
        Apps you've granted (or denied) sensitive capabilities. Revoke any decision to make the app
        ask again the next time it tries.
      </p>
    </SectionHeader>

    <ActionRow as="section" class="privacy__telemetry" aria-labelledby="privacy-telemetry-title">
      <template #copy>
        <div class="privacy__telemetry-text">
          <h3 id="privacy-telemetry-title" class="privacy__telemetry-title">Product telemetry</h3>
          <p class="privacy__telemetry-copy">
            Off by default. When enabled, WebOS records command counters and boot timing only; the
            current transport does not send data anywhere.
          </p>
        </div>
      </template>
      <Switch
        :model-value="telemetryEnabled"
        :aria-label="telemetryEnabled ? 'Disable product telemetry' : 'Enable product telemetry'"
        @update:model-value="setTelemetryEnabled"
      />
    </ActionRow>

    <EmptyState v-if="groups.length === 0" class="privacy__empty" aria-live="polite">
      <template #icon>
        <ShieldIcon class="privacy__empty-icon" aria-hidden="true" />
      </template>
      <p class="privacy__empty-text">
        No remembered permission decisions yet. They'll appear here after an app prompts you and you
        pick "Allow and remember" or "Don't allow".
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
              :icon-start="RevokeIcon"
              :aria-label="`Revoke ${describeDecision(row).toLowerCase()} for ${group.appName}`"
              @click="revoke(row)"
              >Revoke</Button
            >
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

.privacy__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.privacy__title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.privacy__hint {
  color: var(--color-fg-muted);
  font-size: 13px;
  margin: 0;
  max-inline-size: 60ch;
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
