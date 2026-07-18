<script setup vapor lang="ts">
import { computed } from "vue";
import InstallIcon from "~icons/lucide/download";

import { Button } from "~/components/ui";
import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import { pwaInstallController } from "~/service-worker/installController";

const state = pwaInstallController.state;
const { t } = useSettingsI18n();

const isVisible = computed(() => state.value.kind !== "hidden");
const isNativePrompt = computed(() => state.value.kind === "native-prompt");
const isPrompting = computed(() => state.value.kind === "native-prompt" && state.value.prompting);

const title = computed(() => {
  switch (state.value.kind) {
    case "native-prompt":
      return t("settings.pwa.installWebOS");
    case "ios-tip":
      return t("settings.pwa.addToHomeScreen");
    case "hidden":
      return "";
  }

  return "";
});

const body = computed(() => {
  switch (state.value.kind) {
    case "native-prompt":
      return t("settings.pwa.nativeBody");
    case "ios-tip":
      return t("settings.pwa.iosBody");
    case "hidden":
      return "";
  }

  return "";
});

function install(): void {
  void pwaInstallController.promptInstall();
}

function dismiss(): void {
  pwaInstallController.dismiss();
}
</script>

<template>
  <section v-if="isVisible" class="pwa-install-row" :data-kind="state.kind">
    <div class="pwa-install-row__copy" role="status" aria-atomic="true">
      <p class="pwa-install-row__title">{{ title }}</p>
      <p class="pwa-install-row__body">{{ body }}</p>
    </div>

    <div class="pwa-install-row__actions">
      <Button
        v-if="isNativePrompt"
        variant="solid"
        color="blue"
        size="sm"
        :loading="isPrompting"
        @click="install"
      >
        <template #left><InstallIcon aria-hidden="true" /></template>
        {{ t("settings.pwa.install") }}
      </Button>
      <Button variant="ghost" size="sm" @click="dismiss">{{ t("settings.pwa.later") }}</Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.pwa-install-row {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  min-block-size: 48px;
  padding: var(--space-sm) var(--space-md);
}

.pwa-install-row__copy {
  min-inline-size: 0;
}

.pwa-install-row__title,
.pwa-install-row__body {
  margin: 0;
}

.pwa-install-row__title {
  color: var(--color-fg);
  font-size: 13px;
  font-weight: 600;
}

.pwa-install-row__body {
  color: var(--color-fg-muted);
  font-size: 12px;
  line-height: 1.4;
  margin-block-start: 2px;
}

.pwa-install-row__actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
}

@media (max-width: 420px) {
  .pwa-install-row {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-sm);
  }
}
</style>
