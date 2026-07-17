<script setup vapor lang="ts">
import { computed } from "vue";

import { Button } from "~/components/ui";
import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";

const state = serviceWorkerUpdateController.state;
const { t } = useSettingsI18n();

const isVisible = computed(() => state.value.kind !== "idle");
const isActionable = computed(
  () => state.value.kind === "update-available" || state.value.kind === "refresh-error",
);
const isRefreshing = computed(
  () => state.value.kind === "update-available" && state.value.refreshing,
);

const title = computed(() => {
  switch (state.value.kind) {
    case "update-installing":
      return t("settings.sw.updating");
    case "update-available":
      return t("settings.sw.updateAvailable");
    case "refresh-error":
      return t("settings.sw.updateFailed");
    case "offline-ready":
      return t("settings.sw.readyOffline");
    case "idle":
      return "";
  }

  return "";
});

const body = computed(() => {
  switch (state.value.kind) {
    case "update-installing":
      return t("settings.sw.downloading");
    case "update-available":
      return t("settings.sw.refreshBody");
    case "refresh-error":
      return state.value.message;
    case "idle":
    case "offline-ready":
      return "";
  }

  return "";
});

const primaryLabel = computed(() =>
  state.value.kind === "refresh-error" ? t("settings.sw.tryAgain") : t("settings.sw.refresh"),
);

function refresh(): void {
  void serviceWorkerUpdateController.refresh();
}

function dismiss(): void {
  serviceWorkerUpdateController.dismiss();
}
</script>

<template>
  <section v-if="isVisible" class="sw-update-row" :data-kind="state.kind">
    <div class="sw-update-row__copy" role="status" aria-atomic="true">
      <p class="sw-update-row__title">{{ title }}</p>
      <p v-if="body" class="sw-update-row__body">{{ body }}</p>
    </div>

    <div v-if="isActionable" class="sw-update-row__actions">
      <Button variant="solid" color="blue" size="sm" :loading="isRefreshing" @click="refresh">
        {{ primaryLabel }}
      </Button>
      <Button variant="ghost" size="sm" @click="dismiss">{{ t("settings.sw.later") }}</Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.sw-update-row {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  min-block-size: 48px;
  padding: var(--space-sm) var(--space-md);
}

.sw-update-row__copy {
  min-inline-size: 0;
}

.sw-update-row__title,
.sw-update-row__body {
  margin: 0;
}

.sw-update-row__title {
  color: var(--color-fg);
  font-size: 13px;
  font-weight: 600;
}

.sw-update-row__body {
  color: var(--color-fg-muted);
  font-size: 12px;
  line-height: 1.4;
  margin-block-start: 2px;
}

.sw-update-row__actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
}

@media (max-width: 420px) {
  .sw-update-row {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-sm);
  }
}
</style>
