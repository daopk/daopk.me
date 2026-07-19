<script setup vapor lang="ts">
import { computed, onUnmounted, ref } from "vue";
import CheckIcon from "~icons/lucide/check";

import { GroupLabel, Panel, SectionHeader } from "~/components/kit";
import { ColorSwatch, Radio, RadioGroup } from "~/components/ui";
import { useSettingsI18n, type SettingsTranslationKey } from "~/apps/settings/i18n/useSettingsI18n";
import { useKernel } from "~/composables/useKernel";
import { useTheme } from "~/composables/useTheme";
import type { ThemePreference } from "~/types/theme";

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const kernel = useKernel();
const { preference, setTheme } = useTheme();
const { t } = useSettingsI18n();

const ACCENT_PRESETS = [
  { id: "default", labelKey: "settings.appearance.accent.default", value: "#5a2d82" },
  { id: "ocean", labelKey: "settings.appearance.accent.ocean", value: "#0284c7" },
  { id: "forest", labelKey: "settings.appearance.accent.forest", value: "#15803d" },
  { id: "sunset", labelKey: "settings.appearance.accent.sunset", value: "#ea580c" },
  { id: "rose", labelKey: "settings.appearance.accent.rose", value: "#be185d" },
  { id: "slate", labelKey: "settings.appearance.accent.slate", value: "#475569" },
] as const;

type ThemeChoice = { id: ThemePreference; label: string; hint: string };

const THEME_OPTIONS: readonly {
  id: ThemePreference;
  labelKey: SettingsTranslationKey;
  hintKey: SettingsTranslationKey;
}[] = [
  {
    id: "system",
    labelKey: "settings.appearance.theme.system.label",
    hintKey: "settings.appearance.theme.system.hint",
  },
  {
    id: "light",
    labelKey: "settings.appearance.theme.light.label",
    hintKey: "settings.appearance.theme.light.hint",
  },
  {
    id: "dark",
    labelKey: "settings.appearance.theme.dark.label",
    hintKey: "settings.appearance.theme.dark.hint",
  },
];

const accentRef = ref<string | undefined>(kernel.theme.currentOverrides()["--color-accent"]);

const stopTokens = kernel.events.on("tokens.changed", (payload) => {
  if (payload.keys.includes("--color-accent")) {
    accentRef.value = kernel.theme.currentOverrides()["--color-accent"];
  }
});
onUnmounted(() => {
  stopTokens();
});

const selectedAccent = computed(() => {
  const accent = accentRef.value;
  if (!accent) {
    return "default";
  }
  const match = ACCENT_PRESETS.find((preset) => preset.value === accent);
  return match?.id ?? "custom";
});

function selectTheme(choice: ThemePreference): void {
  if (choice === preference.value) {
    return;
  }
  setTheme(choice);
}

function selectAccent(presetId: string, value: string): void {
  if (presetId === "default") {
    kernel.theme.unsetOverride("--color-accent");
    return;
  }
  kernel.theme.setOverride("--color-accent", value);
}

function selectThemeValue(value: string | number | null): void {
  if (value === "system" || value === "light" || value === "dark") {
    selectTheme(value);
  }
}

function selectAccentValue(value: string | number | null): void {
  const preset = ACCENT_PRESETS.find((entry) => entry.value === value);
  if (preset) selectAccent(preset.id, preset.value);
}

const themeOptions = computed<readonly ThemeChoice[]>(() =>
  THEME_OPTIONS.map((option) => ({
    id: option.id,
    label: t(option.labelKey),
    hint: t(option.hintKey),
  })),
);

const selectedAccentValue = computed(
  () =>
    ACCENT_PRESETS.find((preset) => preset.id === selectedAccent.value)?.value ?? accentRef.value,
);

const choiceRadioClassNames = {
  indicator: "appearance__radio-indicator",
  label: "appearance__radio-label",
} as const;
</script>

<template>
  <article class="appearance" :aria-label="t('settings.appearance.ariaLabel')">
    <SectionHeader
      v-if="props.showHeader"
      class="appearance__header"
      size="page"
      :title="t('settings.appearance.title')"
      :subtitle="t('settings.appearance.subtitle')"
    />

    <Panel
      as="section"
      class="appearance__group"
      variant="plain"
      padding="none"
      aria-labelledby="appearance-theme-label"
    >
      <GroupLabel id="appearance-theme-label" as="h3">
        {{ t("settings.appearance.theme") }}
      </GroupLabel>
      <RadioGroup
        class="appearance__theme-grid"
        :model-value="preference"
        labelledby="appearance-theme-label"
        @update:model-value="selectThemeValue"
      >
        <Radio
          v-for="option in themeOptions"
          :key="option.id"
          class="appearance__theme-card"
          :class="{ 'appearance__theme-card--active': option.id === preference }"
          :class-names="choiceRadioClassNames"
          :value="option.id"
        >
          <span class="appearance__theme-preview" :data-variant="option.id" aria-hidden="true">
            <span class="appearance__theme-preview-pane appearance__theme-preview-pane--light">
              <span class="appearance__theme-preview-chrome">
                <span class="appearance__theme-preview-dot" />
                <span class="appearance__theme-preview-dot" />
                <span class="appearance__theme-preview-dot" />
              </span>
              <span class="appearance__theme-preview-body">
                <span
                  class="appearance__theme-preview-line appearance__theme-preview-line--accent"
                />
                <span class="appearance__theme-preview-line" />
                <span class="appearance__theme-preview-chip" />
              </span>
            </span>
            <span class="appearance__theme-preview-pane appearance__theme-preview-pane--dark">
              <span class="appearance__theme-preview-chrome">
                <span class="appearance__theme-preview-dot" />
                <span class="appearance__theme-preview-dot" />
                <span class="appearance__theme-preview-dot" />
              </span>
              <span class="appearance__theme-preview-body">
                <span
                  class="appearance__theme-preview-line appearance__theme-preview-line--accent"
                />
                <span class="appearance__theme-preview-line" />
                <span class="appearance__theme-preview-chip" />
              </span>
            </span>
          </span>
          <span class="appearance__theme-meta">
            <span class="appearance__theme-label">{{ option.label }}</span>
            <span class="appearance__theme-hint">{{ option.hint }}</span>
          </span>
          <CheckIcon
            v-if="option.id === preference"
            class="appearance__theme-check"
            aria-hidden="true"
          />
        </Radio>
      </RadioGroup>
    </Panel>

    <Panel
      as="section"
      class="appearance__group"
      variant="plain"
      padding="none"
      aria-labelledby="appearance-accent-label"
    >
      <GroupLabel id="appearance-accent-label" as="h3">
        {{ t("settings.appearance.accentColor") }}
      </GroupLabel>
      <RadioGroup
        class="appearance__swatches"
        :model-value="selectedAccentValue"
        labelledby="appearance-accent-label"
        @update:model-value="selectAccentValue"
      >
        <Radio
          v-for="preset in ACCENT_PRESETS"
          :key="preset.id"
          class="appearance__swatch"
          :class="{ 'appearance__swatch--active': preset.id === selectedAccent }"
          :class-names="choiceRadioClassNames"
          :value="preset.value"
          :aria-label="t(preset.labelKey)"
          :input-attrs="{ title: t(preset.labelKey) }"
        >
          <ColorSwatch :color="preset.value" :size="32" aria-hidden="true" />
          <CheckIcon
            v-if="preset.id === selectedAccent"
            class="appearance__swatch-check"
            aria-hidden="true"
          />
        </Radio>
      </RadioGroup>
      <p v-if="selectedAccent === 'custom'" class="appearance__custom-hint">
        {{ t("settings.appearance.customAccentHint") }}
      </p>
    </Panel>
  </article>
</template>

<style scoped lang="scss">
.appearance {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.appearance__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.appearance__theme-grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

:deep(.appearance__radio-indicator) {
  display: none;
}

:deep(.appearance__radio-label) {
  display: contents;
}

.appearance__theme-card {
  align-items: stretch;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font: inherit;
  gap: var(--space-sm);
  padding: var(--space-md);
  position: relative;
  text-align: start;
  transition:
    border-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
}

.appearance__theme-card:hover,
.appearance__theme-card:focus-visible,
.appearance__theme-card:has(input:focus-visible) {
  border-color: var(--color-accent);
}

.appearance__theme-card:focus-visible,
.appearance__theme-card:has(input:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.appearance__theme-card--active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent) inset;
}

.appearance__theme-preview {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  display: grid;
  min-block-size: 58px;
  overflow: hidden;
}

.appearance__theme-preview[data-variant="light"] {
  border-color: rgb(18 18 26 / 0.12);
}

.appearance__theme-preview[data-variant="light"] .appearance__theme-preview-pane--dark,
.appearance__theme-preview[data-variant="dark"] .appearance__theme-preview-pane--light {
  display: none;
}

.appearance__theme-preview[data-variant="dark"] {
  border-color: rgb(244 245 255 / 0.1);
}

.appearance__theme-preview[data-variant="system"] {
  border-color: color-mix(in srgb, var(--color-border) 82%, transparent);
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.appearance__theme-preview[data-variant="system"] .appearance__theme-preview-pane--dark {
  border-inline-start: 1px solid rgb(244 245 255 / 0.1);
}

.appearance__theme-preview[data-variant="system"] .appearance__theme-preview-pane {
  padding: 5px;
}

.appearance__theme-preview[data-variant="system"] .appearance__theme-preview-chrome {
  display: none;
}

.appearance__theme-preview-pane {
  --preview-bg: #f8f8fc;
  --preview-surface: #ffffff;
  --preview-border: rgb(18 18 26 / 0.12);
  --preview-dot: rgb(18 18 26 / 0.28);
  --preview-line: rgb(18 18 26 / 0.34);

  background: var(--preview-bg);
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-inline-size: 0;
  padding: 6px;
}

.appearance__theme-preview-pane--dark {
  --preview-bg: #09090f;
  --preview-surface: #15151f;
  --preview-border: rgb(244 245 255 / 0.12);
  --preview-dot: rgb(244 245 255 / 0.38);
  --preview-line: rgb(244 245 255 / 0.36);
}

.appearance__theme-preview-chrome {
  display: flex;
  gap: 3px;
}

.appearance__theme-preview-dot {
  background: var(--preview-dot);
  block-size: 3px;
  border-radius: 999px;
  inline-size: 3px;
}

.appearance__theme-preview-body {
  background: var(--preview-surface);
  border: 1px solid var(--preview-border);
  border-radius: 4px;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
  min-block-size: 0;
  padding: 6px;
}

.appearance__theme-preview-line {
  background: color-mix(in srgb, var(--color-accent) 55%, transparent);
  border-radius: 999px;
  block-size: 4px;
  inline-size: 64%;
}

.appearance__theme-preview-line:not(.appearance__theme-preview-line--accent) {
  background: var(--preview-line);
  inline-size: 42%;
}

.appearance__theme-preview-chip {
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 28%, transparent);
  border-radius: 999px;
  block-size: 8px;
  inline-size: 18px;
  margin-block-start: 1px;
}

.appearance__theme-preview[data-variant="system"] .appearance__theme-preview-body {
  block-size: 100%;
  padding: 5px;
}

.appearance__theme-preview[data-variant="system"] .appearance__theme-preview-line {
  inline-size: 72%;
}

.appearance__theme-preview[data-variant="system"]
  .appearance__theme-preview-line:not(.appearance__theme-preview-line--accent) {
  inline-size: 48%;
}

.appearance__theme-preview[data-variant="system"] .appearance__theme-preview-chip {
  inline-size: 14px;
}

.appearance__theme-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.appearance__theme-label {
  font-size: 13px;
  font-weight: 600;
}

.appearance__theme-hint {
  color: var(--color-fg-muted);
  font-size: 11px;
}

.appearance__theme-check {
  block-size: 16px;
  color: var(--color-accent);
  inline-size: 16px;
  inset-block-start: var(--space-sm);
  inset-inline-end: var(--space-sm);
  position: absolute;
}

.appearance__swatches {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.appearance__swatch {
  align-items: center;
  background: transparent;
  block-size: 36px;
  border: 2px solid transparent;
  border-radius: calc(var(--rp-radius-sm) + var(--rp-border-width-medium));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
  cursor: pointer;
  display: flex;
  inline-size: 36px;
  justify-content: center;
  padding: 0;
  position: relative;
  transition:
    transform var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease);
}

.appearance__swatch:hover,
.appearance__swatch:focus-visible,
.appearance__swatch:has(input:focus-visible) {
  transform: scale(1.08);
}

.appearance__swatch:focus-visible,
.appearance__swatch:has(input:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.appearance__swatch--active {
  border-color: var(--color-fg);
}

.appearance__swatch-check {
  block-size: 16px;
  color: #fff;
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.4));
  inline-size: 16px;
  inset: 50% auto auto 50%;
  position: absolute;
  transform: translate(-50%, -50%);
}

.appearance__custom-hint {
  color: var(--color-fg-muted);
  font-size: 11px;
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .appearance__theme-card,
  .appearance__swatch {
    transition: none;
  }

  .appearance__swatch:hover,
  .appearance__swatch:focus-visible {
    transform: none;
  }
}
</style>
