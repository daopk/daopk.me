<script setup lang="ts">
import { onUnmounted, ref, shallowRef } from "vue";

import {
  Badge,
  EmptyState,
  IconButton,
  SectionHeader,
  StatusBanner,
  TextInput,
} from "~/components/kit";
import InstallConsentDialog from "~/components/app/InstallConsentDialog.vue";
import { Button, Dialog } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { appSettingsLaunchArgs, hasAppSettings } from "~/core/apps/appSettings";
import { useInstalledAppsStore } from "~/core/apps/InstalledAppsStore";
import {
  installExternalApp,
  type InstallConsentInfo,
  uninstallExternalApp,
} from "~/core/apps/installExternalApp";
import {
  Download,
  ExternalLink as LaunchIcon,
  Settings as SettingsIcon,
  Trash2,
} from "~/icons/lucide";
import type { AppManifest } from "~/types/app";

const HIDDEN_PREFIX = "_";

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const kernel = useKernel();
const installedAppsStore = useInstalledAppsStore();

const apps = shallowRef<readonly AppManifest[]>(visibleApps());

const stopRegistered = kernel.events.on("app.registered", refreshApps);
const stopUnregistered = kernel.events.on("app.unregistered", refreshApps);

const installUrl = ref("");
const installing = ref(false);
const installError = ref("");

const consentOpen = ref(false);
const consentInfo = ref<InstallConsentInfo | null>(null);
let consentResolve: ((value: boolean) => void) | null = null;

const uninstallOpen = ref(false);
const uninstallTarget = ref<AppManifest | null>(null);
const uninstalling = ref(false);

onUnmounted(() => {
  stopRegistered();
  stopUnregistered();
  settleConsent(false);
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

function isExternal(id: string): boolean {
  return installedAppsStore.isExternalApp(id);
}

function launchApp(manifestId: string): void {
  kernel.events.emit("app.launch.requested", { manifestId, source: "api" });
}

function openAppSettings(manifestId: string): void {
  kernel.events.emit("app.launch.requested", {
    manifestId,
    source: "api",
    args: appSettingsLaunchArgs(),
  });
}

function settleConsent(value: boolean): void {
  consentOpen.value = false;
  const resolve = consentResolve;
  consentResolve = null;
  resolve?.(value);
}

function requestConsent(info: InstallConsentInfo): Promise<boolean> {
  consentInfo.value = info;
  consentOpen.value = true;
  return new Promise<boolean>((resolve) => {
    consentResolve = resolve;
  });
}

async function submitInstall(): Promise<void> {
  const url = installUrl.value.trim();
  if (installing.value || url === "") {
    return;
  }
  installing.value = true;
  installError.value = "";

  const result = await installExternalApp(url, { kernel, confirm: requestConsent });

  installing.value = false;
  if (result.ok) {
    installUrl.value = "";
  } else if (result.reason !== "declined") {
    installError.value = result.error;
  }
}

function requestUninstall(app: AppManifest): void {
  uninstallTarget.value = app;
  uninstallOpen.value = true;
}

function cancelUninstall(): void {
  if (uninstalling.value) {
    return;
  }
  uninstallOpen.value = false;
  uninstallTarget.value = null;
}

async function confirmUninstall(): Promise<void> {
  const target = uninstallTarget.value;
  if (!target || uninstalling.value) {
    return;
  }
  uninstalling.value = true;
  await uninstallExternalApp(target.id, { kernel });
  uninstalling.value = false;
  uninstallOpen.value = false;
  uninstallTarget.value = null;
}
</script>

<template>
  <section class="apps-settings" aria-label="Apps settings">
    <SectionHeader v-if="props.showHeader" size="page" title="Apps" />

    <form class="apps-settings__install" @submit.prevent="submitInstall">
      <label class="apps-settings__install-label" for="apps-install-url">Install from URL</label>
      <div class="apps-settings__install-row">
        <TextInput
          id="apps-install-url"
          v-model="installUrl"
          class="apps-settings__install-input"
          type="url"
          inputmode="url"
          autocomplete="off"
          :spellcheck="false"
          :disabled="installing"
          placeholder="https://example.com/app.json"
        />
        <Button
          type="submit"
          variant="primary"
          :icon-start="Download"
          :loading="installing"
          :disabled="installUrl.trim() === ''"
        >
          Install
        </Button>
      </div>
      <StatusBanner
        v-if="installError"
        as="p"
        class="apps-settings__install-error"
        tone="error"
        role="alert"
      >
        {{ installError }}
      </StatusBanner>
    </form>

    <EmptyState v-if="apps.length === 0" class="apps-settings__empty">
      No apps available.
    </EmptyState>

    <ul v-else class="apps-settings__list">
      <li v-for="app in apps" :key="app.id" class="apps-settings__item">
        <div class="apps-settings__identity">
          <component :is="app.icon" class="apps-settings__icon" aria-hidden="true" />
          <span class="apps-settings__copy">
            <span class="apps-settings__name">
              <span class="apps-settings__name-text">{{ app.name }}</span>
              <Badge v-if="isExternal(app.id)" class="apps-settings__badge" tone="accent">
                External
              </Badge>
            </span>
            <span class="apps-settings__category">
              {{ app.category
              }}<span v-if="app.version" class="apps-settings__version"> · v{{ app.version }}</span>
            </span>
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
          <IconButton
            v-if="isExternal(app.id)"
            class="apps-settings__uninstall-action"
            :icon="Trash2"
            :label="`Uninstall ${app.name}`"
            variant="subtle"
            @click="requestUninstall(app)"
          />
        </div>
      </li>
    </ul>

    <InstallConsentDialog
      v-model:open="consentOpen"
      :info="consentInfo"
      @confirm="settleConsent(true)"
      @cancel="settleConsent(false)"
    />

    <Dialog
      v-model:open="uninstallOpen"
      :title="uninstallTarget ? `Uninstall ${uninstallTarget.name}?` : 'Uninstall app?'"
      :dismissible="!uninstalling"
      @close="cancelUninstall"
    >
      <div class="apps-settings__uninstall-dialog">
        <StatusBanner as="p" tone="warning" role="alert">
          This closes the app, removes it from this browser, revokes its permissions, and unpins it
          from the dock.
        </StatusBanner>
        <div class="apps-settings__dialog-actions">
          <Button size="sm" :disabled="uninstalling" @click="cancelUninstall">Cancel</Button>
          <Button
            size="sm"
            variant="danger"
            :icon-start="Trash2"
            :loading="uninstalling"
            @click="confirmUninstall"
          >
            Uninstall
          </Button>
        </div>
      </div>
    </Dialog>
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

.apps-settings__install {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.apps-settings__install-label {
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
}

.apps-settings__install-row {
  display: flex;
  gap: var(--space-sm);
}

.apps-settings__install-input {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.apps-settings__install-error {
  font-size: 13px;
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

.apps-settings__name {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.apps-settings__name-text {
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apps-settings__badge {
  flex: 0 0 auto;
}

.apps-settings__category {
  color: var(--color-fg-muted);
  flex: 1 1 auto;
  font-size: 12px;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}

.apps-settings__version {
  text-transform: none;
}

.apps-settings__actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
}

.apps-settings__settings-action,
.apps-settings__launch-action,
.apps-settings__uninstall-action {
  flex: 0 0 auto;
}

.apps-settings__uninstall-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.apps-settings__dialog-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
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
