<script setup vapor lang="ts">
import { computed } from "vue";

import { Panel, SectionHeader } from "~/components/kit";
import { Badge, Button } from "~/components/ui";
import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import { useSettings } from "~/composables/useSettings";
import { ExternalLink as ExternalLinkIcon, RefreshCw as RefreshIcon } from "~/icons/lucide";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";

const settings = useSettings();
const { locale, t } = useSettingsI18n();
const updateState = serviceWorkerUpdateController.state;
const updateCheckState = serviceWorkerUpdateController.checkState;

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const userAgent = computed((): string => {
  if (typeof navigator === "undefined") {
    return "—";
  }
  return navigator.userAgent || "—";
});

const buildTime = computed((): string => {
  const d = new Date(__BUILD_TIME__);
  return d.toLocaleString(locale.value, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
});

const isUpdateRefreshing = computed(
  () => updateState.value.kind === "update-available" && updateState.value.refreshing,
);
const isUpdateInstalling = computed(() => updateState.value.kind === "update-installing");
const isCheckingForUpdates = computed(() => updateCheckState.value.kind === "checking");
const updateButtonVariant = computed<"solid" | "surface">(() =>
  updateState.value.kind === "update-available" || updateState.value.kind === "refresh-error"
    ? "solid"
    : "surface",
);
const updateButtonColor = computed(() =>
  updateButtonVariant.value === "solid" ? ("blue" as const) : undefined,
);
const updateButtonLabel = computed((): string => {
  if (updateState.value.kind === "refresh-error") {
    return t("settings.about.tryAgain");
  }

  if (updateState.value.kind === "update-installing") {
    return t("settings.about.updatingButton");
  }

  if (updateState.value.kind === "update-available") {
    return t("settings.about.refresh");
  }

  if (updateCheckState.value.kind === "check-error") {
    return t("settings.about.checkAgain");
  }

  return t("settings.about.checkForUpdates");
});
const softwareUpdateTone = computed<"muted" | "success" | "warning" | "danger">(() => {
  if (
    updateState.value.kind === "update-installing" ||
    updateState.value.kind === "update-available"
  ) {
    return "warning";
  }

  if (updateState.value.kind === "refresh-error" || updateCheckState.value.kind === "check-error") {
    return "danger";
  }

  if (updateCheckState.value.kind === "up-to-date") {
    return "success";
  }

  return "muted";
});
const softwareUpdateBadgeColor = computed<"gray" | "blue" | "green" | "red">(() => {
  switch (softwareUpdateTone.value) {
    case "success":
      return "green";
    case "warning":
      return "blue";
    case "danger":
      return "red";
    case "muted":
      return "gray";
  }
  return "gray";
});
const softwareUpdateStatus = computed((): string => {
  switch (updateState.value.kind) {
    case "update-installing":
      return t("settings.about.update.downloading");
    case "update-available":
      return updateState.value.refreshing
        ? t("settings.about.update.applying")
        : t("settings.about.update.available");
    case "refresh-error":
      return t("settings.about.update.failed", { message: updateState.value.message });
    case "offline-ready":
      return t("settings.about.update.readyOffline");
    case "idle":
      break;
  }

  switch (updateCheckState.value.kind) {
    case "checking":
      return t("settings.about.update.checking");
    case "up-to-date":
      return t("settings.about.update.upToDate");
    case "check-error":
      return updateCheckState.value.message;
    case "idle":
      return "";
  }

  return "";
});
const showSoftwareUpdateStatus = computed(() => softwareUpdateStatus.value.length > 0);

function runSoftwareUpdateAction(): void {
  if (updateState.value.kind === "update-installing") {
    return;
  }

  if (updateState.value.kind === "update-available" || updateState.value.kind === "refresh-error") {
    void serviceWorkerUpdateController.refresh();
    return;
  }

  void serviceWorkerUpdateController.checkForUpdate();
}
</script>

<template>
  <article class="about-device" :aria-label="t('settings.about.ariaLabel')">
    <SectionHeader
      v-if="props.showHeader"
      size="page"
      :title="t('settings.about.title')"
      :subtitle="t('settings.about.subtitle')"
    />

    <Panel as="section" class="about-device__github-card" variant="elevated" padding="lg">
      <div class="about-device__github-copy">
        <div class="about-device__github-heading">
          <h2 class="about-device__github-title">GitHub</h2>
        </div>
        <p class="about-device__github-note">{{ t("settings.about.githubNote") }}</p>
      </div>
      <a
        class="about-device__github-link"
        href="https://github.com/daopk/daopk.me"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>daopk/daopk.me</span>
        <ExternalLinkIcon class="about-device__github-link-icon" aria-hidden="true" />
      </a>
    </Panel>

    <Panel as="section" class="about-device__update-card" variant="elevated" padding="lg">
      <div class="about-device__update-copy">
        <div class="about-device__update-heading">
          <h2 class="about-device__update-title">{{ t("settings.about.softwareUpdate") }}</h2>
          <Badge
            v-if="showSoftwareUpdateStatus"
            class="about-device__update-status"
            :color="softwareUpdateBadgeColor"
            variant="subtle"
            :data-tone="softwareUpdateTone"
          >
            {{ softwareUpdateStatus }}
          </Badge>
        </div>
        <p class="about-device__update-note">
          {{ t("settings.about.updateNote") }}
        </p>
      </div>
      <Button
        class="about-device__update-action"
        size="sm"
        :variant="updateButtonVariant"
        :color="updateButtonColor"
        :disabled="isUpdateInstalling"
        :loading="isCheckingForUpdates || isUpdateRefreshing || isUpdateInstalling"
        @click="runSoftwareUpdateAction"
      >
        <template #left><RefreshIcon aria-hidden="true" /></template>
        {{ updateButtonLabel }}
      </Button>
    </Panel>

    <Panel as="dl" class="about-device__list" variant="plain" padding="none">
      <div class="about-device__row">
        <dt class="about-device__key">{{ t("settings.about.buildTime") }}</dt>
        <dd class="about-device__value">{{ buildTime }}</dd>
      </div>
      <div class="about-device__row">
        <dt class="about-device__key">{{ t("settings.about.bootCount") }}</dt>
        <dd class="about-device__value">{{ settings.bootCount }}</dd>
      </div>
      <div class="about-device__row about-device__row--block">
        <dt class="about-device__key">{{ t("settings.about.userAgent") }}</dt>
        <dd class="about-device__value about-device__value--block">
          <code class="about-device__code about-device__code--wrap">{{ userAgent }}</code>
        </dd>
      </div>
    </Panel>
  </article>
</template>

<style scoped lang="scss">
.about-device {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.about-device__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
}

.about-device__github-card,
.about-device__update-card {
  align-items: center;
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: minmax(0, 1fr) auto;
}

.about-device__github-copy,
.about-device__update-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.about-device__github-heading,
.about-device__update-heading {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.about-device__github-title,
.about-device__update-title {
  color: var(--color-fg);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.3;
  margin: 0;
}

.about-device__github-link {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  display: inline-flex;
  font-size: var(--font-size-xs);
  gap: var(--space-xs);
  justify-self: end;
  min-block-size: var(--control-height-sm);
  padding: var(--space-2xs) var(--space-sm);
  text-decoration: none;
  transition:
    border-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.about-device__github-link:hover,
.about-device__github-link:focus-visible {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.about-device__github-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.about-device__github-link-icon {
  block-size: 14px;
  flex-shrink: 0;
  inline-size: 14px;
}

.about-device__update-action {
  justify-self: end;
}

.about-device__row {
  align-items: baseline;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-md);
  grid-template-columns: 100px minmax(0, 1fr);
  padding: var(--space-md);
}

.about-device__row--block {
  align-items: flex-start;
}

.about-device__key {
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin: 0;
  text-transform: uppercase;
}

.about-device__value {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 13px;
  gap: var(--space-xs);
  margin: 0;
}

.about-device__value--block {
  display: block;
}

.about-device__sub {
  color: var(--color-fg-muted);
  font-size: 12px;
}

.about-device__update-status {
  color: var(--color-fg-muted);
  line-height: 1.4;
}

.about-device__github-note,
.about-device__update-note {
  color: var(--color-fg-muted);
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}

.about-device__update-status[data-tone="success"] {
  color: var(--color-success);
}

.about-device__update-status[data-tone="warning"] {
  color: var(--color-fg);
  font-weight: 600;
}

.about-device__update-status[data-tone="danger"] {
  color: var(--color-error);
  font-weight: 600;
}

.about-device__code {
  background: var(--color-bg-subtle);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 6px;
}

.about-device__code--wrap {
  display: inline-block;
  line-height: 1.5;
  padding: var(--space-xs) var(--space-sm);
  word-break: break-all;
}

@media (max-width: 640px) {
  .about-device__github-card,
  .about-device__update-card {
    align-items: stretch;
    grid-template-columns: 1fr;
  }

  .about-device__github-link,
  .about-device__update-action {
    justify-self: start;
  }
}
</style>
