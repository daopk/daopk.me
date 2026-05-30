<script setup lang="ts">
import { computed, inject, onUnmounted, ref, useTemplateRef, watch, type Component } from "vue";
import { ChevronRight as NavChevronIcon } from "~/icons/lucide";
import {
  SettingsAccountIcon as AccountIcon,
  SettingsAboutDeviceIcon as AboutIcon,
  SettingsAppearanceIcon as AppearanceIcon,
  SettingsBackgroundIcon as BackgroundIcon,
  SettingsComfortIcon as ComfortIcon,
  SettingsDockIcon as DockIcon,
  SettingsWidgetsIcon as AppsIcon,
  SettingsPrivacyIcon as PrivacyIcon,
} from "~/icons/fluentColor";
import { useResizeObserver } from "@vueuse/core";

import AccountSection from "./sections/AccountSection.vue";
import AboutDeviceSection from "./sections/AboutDeviceSection.vue";
import AppearanceSection from "./sections/AppearanceSection.vue";
import AppsSection from "./sections/AppsSection.vue";
import BackgroundSection from "./sections/BackgroundSection.vue";
import ComfortSection from "./sections/ComfortSection.vue";
import DockSection from "./sections/DockSection.vue";
import PrivacySection from "./sections/PrivacySection.vue";
import PwaInstallRow from "./PwaInstallRow.vue";
import ServiceWorkerUpdateRow from "./ServiceWorkerUpdateRow.vue";

import { useActiveShell } from "~/composables/useActiveShell";
import { pwaInstallController } from "~/service-worker/installController";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";
import { AppChromeInjectionKey, AppContextInjectionKey } from "~/types/app";
import { KernelInjectionKey } from "~/types/kernel";
import {
  firstSettingsSectionForShell,
  isSettingsSectionId,
  SETTINGS_SECTIONS,
  settingsSectionAppliesToShell,
  type SettingsSectionId,
} from "~/types/settings";

interface SectionEntry {
  id: SettingsSectionId;
  label: string;
  icon: Component;
  component: Component;
}

const sectionEntries: Record<SettingsSectionId, SectionEntry> = {
  appearance: {
    id: "appearance",
    label: "Appearance",
    icon: AppearanceIcon as Component,
    component: AppearanceSection,
  },
  background: {
    id: "background",
    label: "Background",
    icon: BackgroundIcon as Component,
    component: BackgroundSection,
  },
  comfort: {
    id: "comfort",
    label: "Comfort",
    icon: ComfortIcon as Component,
    component: ComfortSection,
  },
  dock: {
    id: "dock",
    label: "Dock",
    icon: DockIcon as Component,
    component: DockSection,
  },
  account: {
    id: "account",
    label: "Account",
    icon: AccountIcon as Component,
    component: AccountSection,
  },
  privacy: {
    id: "privacy",
    label: "Privacy",
    icon: PrivacyIcon as Component,
    component: PrivacySection,
  },
  apps: {
    id: "apps",
    label: "Apps",
    icon: AppsIcon as Component,
    component: AppsSection,
  },
  about: {
    id: "about",
    label: "About device",
    icon: AboutIcon as Component,
    component: AboutDeviceSection,
  },
};

const componentMap: Record<SettingsSectionId, Component> = {
  appearance: AppearanceSection,
  background: BackgroundSection,
  comfort: ComfortSection,
  dock: DockSection,
  account: AccountSection,
  privacy: PrivacySection,
  apps: AppsSection,
  about: AboutDeviceSection,
};

const NARROW_BREAKPOINT = 500;

const rootRef = useTemplateRef<HTMLElement>("rootRef");
const isNarrow = ref(false);
const appContext = inject(AppContextInjectionKey, null);
const appChrome = inject(AppChromeInjectionKey, null);
const kernel = inject(KernelInjectionKey, null);
const { shellId } = useActiveShell();

useResizeObserver(rootRef, ([entry]) => {
  if (entry) {
    isNarrow.value = entry.contentRect.width < NARROW_BREAKPOINT;
  }
});

const sections = computed<readonly SectionEntry[]>(() =>
  SETTINGS_SECTIONS.filter((section) =>
    settingsSectionAppliesToShell(section.id, shellId.value),
  ).map((section) => sectionEntries[section.id]),
);

function normalizeSection(value: unknown): SettingsSectionId {
  if (isSettingsSectionId(value) && settingsSectionAppliesToShell(value, shellId.value)) {
    return value;
  }
  return firstSettingsSectionForShell(shellId.value);
}

const activeId = ref<SettingsSectionId>(normalizeSection(appContext?.args.section));
const activeComponent = computed<Component>(() => componentMap[activeId.value]);
const activeLabel = computed(() => sectionEntries[activeId.value].label);

const narrowPanelOpen = ref(false);
const usesSectionChrome = computed(() => isNarrow.value && narrowPanelOpen.value);

const showNav = computed(() => !isNarrow.value || !narrowPanelOpen.value);
const showContent = computed(() => !isNarrow.value || narrowPanelOpen.value);
const hasPwaInstallStatus = computed(() => pwaInstallController.state.value.kind !== "hidden");
const hasServiceWorkerStatus = computed(
  () => serviceWorkerUpdateController.state.value.kind !== "idle",
);
const showNavInstallRow = computed(
  () => hasPwaInstallStatus.value && isNarrow.value && showNav.value,
);
const showContentInstallRow = computed(() => hasPwaInstallStatus.value && showContent.value);
const showNavUpdateRow = computed(
  () => hasServiceWorkerStatus.value && isNarrow.value && showNav.value,
);
const showContentUpdateRow = computed(() => hasServiceWorkerStatus.value && showContent.value);

const stopSectionListener = kernel?.events.on("settings.section.requested", ({ section }) => {
  activeId.value = normalizeSection(section);
  if (isNarrow.value) {
    narrowPanelOpen.value = true;
  }
});

onUnmounted(() => {
  stopSectionListener?.();
  appChrome?.setTitle(null);
  appChrome?.setBackAction(null);
});

watch(shellId, () => {
  if (!settingsSectionAppliesToShell(activeId.value, shellId.value)) {
    activeId.value = firstSettingsSectionForShell(shellId.value);
  }
});

function select(id: SettingsSectionId): void {
  activeId.value = normalizeSection(id);
  if (isNarrow.value) {
    narrowPanelOpen.value = true;
  }
}

function goBack(): void {
  narrowPanelOpen.value = false;
}

watch(
  () => [usesSectionChrome.value, activeLabel.value] as const,
  ([usesChrome, label]) => {
    if (usesChrome) {
      appChrome?.setTitle(label);
      appChrome?.setBackAction({
        ariaLabel: "Back to Settings",
        handler: goBack,
      });
      return;
    }

    appChrome?.setTitle(null);
    appChrome?.setBackAction(null);
  },
  { immediate: true },
);
</script>

<template>
  <section
    ref="rootRef"
    class="settings"
    :class="{ 'settings--narrow': isNarrow }"
    aria-label="Settings"
  >
    <div v-if="showNavInstallRow || showNavUpdateRow" class="settings__status-stack">
      <PwaInstallRow v-if="showNavInstallRow" />
      <ServiceWorkerUpdateRow v-if="showNavUpdateRow" />
    </div>

    <nav v-if="showNav" class="settings__nav" aria-label="Settings sections">
      <header class="settings__nav-header">
        <h2 class="settings__nav-title settings__mobile-title">Settings</h2>
      </header>

      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        class="settings__nav-item"
        :class="{ 'settings__nav-item--active': section.id === activeId }"
        :aria-current="section.id === activeId ? 'page' : undefined"
        @click="select(section.id)"
      >
        <component :is="section.icon" class="settings__nav-icon" aria-hidden="true" />
        <span class="settings__nav-label">{{ section.label }}</span>
        <component
          v-if="isNarrow"
          :is="NavChevronIcon"
          class="settings__nav-chevron"
          aria-hidden="true"
        />
      </button>
    </nav>

    <main v-if="showContent" class="settings__content">
      <div v-if="showContentInstallRow || showContentUpdateRow" class="settings__content-status">
        <PwaInstallRow v-if="showContentInstallRow" />
        <ServiceWorkerUpdateRow v-if="showContentUpdateRow" />
      </div>
      <component :is="activeComponent" class="settings__section" />
    </main>
  </section>
</template>

<style scoped lang="scss">
/* No `font-size` here on purpose — the Settings surface intentionally
   inherits `--font-size-base` from the document body so Comfort's base-size
   control produces a visible effect inside Settings itself. */
.settings {
  --settings-content-max: 1160px;

  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  inline-size: 100%;
  padding-block-end: var(--mobile-shell-app-bottom-padding, 0px);
  padding-inline-end: var(--mobile-shell-app-safe-area-right, 0px);
  padding-inline-start: var(--mobile-shell-app-safe-area-left, 0px);
}

.settings--narrow {
  background: var(--color-bg-subtle);
  grid-template-columns: 1fr;
  grid-template-rows: auto minmax(0, 1fr);
  min-block-size: 0;
}

.settings__status-stack {
  display: flex;
  flex-direction: column;
}

.settings--narrow .settings__status-stack {
  grid-row: 1;
}

.settings__nav {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-accent) 5%, transparent),
      transparent 160px
    ),
    var(--color-bg-subtle);
  border-inline-end: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  padding: var(--space-sm);
}

.settings--narrow .settings__nav {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-accent) 8%, transparent),
      transparent 180px
    ),
    var(--color-bg-subtle);
  border-inline-end: none;
  border-block-end: none;
  gap: var(--space-sm);
  grid-row: 2;
  min-block-size: 0;
  padding: var(--space-md);
}

.settings--narrow > .settings__nav:first-child {
  grid-row: 1 / -1;
}

.settings__nav-header {
  padding: var(--space-xs) var(--space-sm) var(--space-sm);
}

.settings__nav-title {
  color: var(--color-fg);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.1;
  margin: 0;
}

.settings--narrow .settings__nav-title {
  font-size: 28px;
  font-weight: 700;
}

.settings__nav-item {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: var(--space-sm);
  min-block-size: 38px;
  padding: 5px var(--space-sm) 5px 6px;
  position: relative;
  text-align: start;
  transition:
    background-color 120ms var(--ease),
    color 120ms var(--ease);
}

.settings__nav-item:hover,
.settings__nav-item:focus-visible {
  background: color-mix(in srgb, var(--color-bg-elevated) 76%, transparent);
  color: var(--color-fg);
}

.settings__nav-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.settings__nav-item--active {
  background: color-mix(in srgb, var(--color-bg-elevated) 88%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 22%, var(--color-border));
  color: var(--color-fg);
}

.settings--narrow .settings__nav-item {
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: var(--radius-md);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--color-fg) 4%, transparent);
  color: var(--color-fg);
  min-block-size: 52px;
  padding: var(--space-sm) var(--space-md) var(--space-sm) var(--space-sm);
}

.settings--narrow .settings__nav-item:hover,
.settings--narrow .settings__nav-item:focus-visible {
  background: var(--color-bg-elevated);
}

.settings--narrow .settings__nav-item--active {
  border-color: color-mix(in srgb, var(--color-accent) 36%, var(--color-border));
  color: var(--color-fg);
}

.settings__nav-icon {
  background: color-mix(in srgb, var(--color-bg-elevated) 72%, transparent);
  block-size: 34px;
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  inline-size: 34px;
  padding: 5px;
  transition:
    background-color 120ms var(--ease),
    opacity 120ms var(--ease),
    transform 120ms var(--ease);
}

.settings__nav-item:hover .settings__nav-icon,
.settings__nav-item:focus-visible .settings__nav-icon,
.settings__nav-item--active .settings__nav-icon {
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-elevated));
  opacity: 1;
  transform: translateY(-1px);
}

.settings--narrow .settings__nav-icon {
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-elevated));
  block-size: 38px;
  border-radius: var(--radius-sm);
  inline-size: 38px;
  padding: 7px;
}

.settings__nav-label {
  flex: 1 1 auto;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings__nav-chevron {
  block-size: 16px;
  color: var(--color-fg-subtle, var(--color-fg-muted));
  flex: 0 0 auto;
  inline-size: 16px;
}

.settings__content {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-fg) 2%, transparent), transparent 120px),
    var(--color-bg);
  block-size: 100%;
  inline-size: 100%;
  min-block-size: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.settings--narrow .settings__content {
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  grid-row: 2;
}

.settings--narrow > .settings__content:first-child {
  grid-row: 1 / -1;
}

.settings__content-status {
  flex: 0 0 auto;
}

.settings__section {
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--settings-content-max);
}

.settings--narrow .settings__section {
  gap: var(--space-lg);
  padding: var(--space-lg) var(--space-md);
}

.settings--narrow .settings__section :deep([class*="__title"]) {
  font-size: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .settings__nav-item {
    transition: none;
  }
}
</style>
