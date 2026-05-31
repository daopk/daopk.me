<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  ScrollArea,
  Spinner,
  StatusBanner,
  ToolbarTitle,
  useAppChrome,
} from "~/components/kit";
import InstallConsentDialog from "~/components/app/InstallConsentDialog.vue";
import { Button } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import {
  APP_STORE_REGISTRY_URL,
  type AppStoreListing,
  coerceAppStoreRegistry,
} from "~/core/apps/appStoreConfig";
import { useInstalledAppsStore } from "~/core/apps/InstalledAppsStore";
import { installExternalApp, type InstallConsentInfo } from "~/core/apps/installExternalApp";
import { Download, RefreshCw } from "~/icons/lucide";

useAppChrome({ title: () => "App Store" });

const kernel = useKernel();
const installedAppsStore = useInstalledAppsStore();

type LoadState = "loading" | "ready" | "error";

const state = ref<LoadState>("loading");
const errorMessage = ref("");
const listings = shallowRef<readonly AppStoreListing[]>([]);

const installingId = ref<string | null>(null);
const installError = ref("");

const consentOpen = ref(false);
const consentInfo = ref<InstallConsentInfo | null>(null);
let consentResolve: ((value: boolean) => void) | null = null;

onMounted(load);
onUnmounted(() => settleConsent(false));

async function load(): Promise<void> {
  state.value = "loading";
  errorMessage.value = "";
  try {
    const response = await fetch(APP_STORE_REGISTRY_URL, { credentials: "omit" });
    if (!response.ok) {
      throw new Error(`Could not load the catalog (${response.status}).`);
    }
    listings.value = coerceAppStoreRegistry(await response.json()).apps;
    state.value = "ready";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    state.value = "error";
  }
}

function isInstalled(id: string): boolean {
  return installedAppsStore.isExternalApp(id);
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

async function install(listing: AppStoreListing): Promise<void> {
  if (installingId.value !== null) {
    return;
  }
  installingId.value = listing.id;
  installError.value = "";

  const result = await installExternalApp(listing.manifestUrl, { kernel, confirm: requestConsent });

  installingId.value = null;
  if (!result.ok && result.reason !== "declined") {
    installError.value = `${listing.name}: ${result.error}`;
  }
}
</script>

<template>
  <AppFrame class="app-store" layout="flex-column" aria-label="App Store">
    <AppToolbar class="app-store__toolbar" density="comfortable">
      <ToolbarTitle title="App Store" subtitle="Install apps from the registry" />
      <template #end>
        <Button
          size="sm"
          variant="secondary"
          :icon-start="RefreshCw"
          :loading="state === 'loading'"
          @click="load"
        >
          Refresh
        </Button>
      </template>
    </AppToolbar>

    <ScrollArea class="app-store__body" safe-area>
      <StatusBanner v-if="installError" as="p" tone="error" role="alert">
        {{ installError }}
      </StatusBanner>

      <div v-if="state === 'loading'" class="app-store__center">
        <Spinner />
        <span>Loading catalog…</span>
      </div>

      <StatusBanner v-else-if="state === 'error'" tone="error">
        {{ errorMessage }}
      </StatusBanner>

      <EmptyState v-else-if="listings.length === 0" class="app-store__center">
        No apps in the catalog yet.
      </EmptyState>

      <ul v-else class="app-store__list">
        <li v-for="listing in listings" :key="listing.id" class="app-store__item">
          <img
            v-if="listing.iconUrl"
            class="app-store__icon"
            :src="listing.iconUrl"
            alt=""
            referrerpolicy="no-referrer"
            decoding="async"
            loading="lazy"
            draggable="false"
          />
          <span v-else class="app-store__icon app-store__icon--placeholder" aria-hidden="true" />

          <span class="app-store__copy">
            <span class="app-store__name">
              <span class="app-store__name-text">{{ listing.name }}</span>
              <span class="app-store__version">v{{ listing.version }}</span>
            </span>
            <span v-if="listing.description" class="app-store__description">
              {{ listing.description }}
            </span>
          </span>

          <Button
            class="app-store__install"
            size="sm"
            :variant="isInstalled(listing.id) ? 'secondary' : 'primary'"
            :icon-start="Download"
            :loading="installingId === listing.id"
            :disabled="installingId !== null && installingId !== listing.id"
            @click="install(listing)"
          >
            {{ isInstalled(listing.id) ? "Reinstall" : "Install" }}
          </Button>
        </li>
      </ul>
    </ScrollArea>

    <InstallConsentDialog
      v-model:open="consentOpen"
      :info="consentInfo"
      @confirm="settleConsent(true)"
      @cancel="settleConsent(false)"
    />
  </AppFrame>
</template>

<style scoped lang="scss">
.app-store__toolbar {
  border-block-end: 1px solid var(--color-border);
}

.app-store__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
}

.app-store__center {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
  padding: var(--space-xl) 0;
}

.app-store__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
}

.app-store__item {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
}

.app-store__icon {
  block-size: 40px;
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  inline-size: 40px;
  object-fit: cover;
}

.app-store__icon--placeholder {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
}

.app-store__copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.app-store__name {
  align-items: baseline;
  display: flex;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.app-store__name-text {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-store__version {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  font-size: 12px;
}

.app-store__description {
  color: var(--color-fg-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-store__install {
  flex: 0 0 auto;
}
</style>
