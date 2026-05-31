<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { Check as CheckIcon } from "~/icons/lucide";

import { Panel, SectionHeader } from "~/components/kit";
import { useKernel } from "~/composables/useKernel";
import { useTheme } from "~/composables/useTheme";
import type { ThemePreference } from "~/types/theme";

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const kernel = useKernel();
const { preference, setTheme } = useTheme();

const ACCENT_PRESETS = [
  { id: "default", label: "Iris (default)", value: "#5a2d82" },
  { id: "ocean", label: "Ocean", value: "#0284c7" },
  { id: "forest", label: "Forest", value: "#15803d" },
  { id: "sunset", label: "Sunset", value: "#ea580c" },
  { id: "rose", label: "Rose", value: "#be185d" },
  { id: "slate", label: "Slate", value: "#475569" },
] as const;

type ThemeChoice = { id: ThemePreference; label: string; hint: string };

const THEME_OPTIONS: readonly ThemeChoice[] = [
  { id: "system", label: "System", hint: "Match OS preference" },
  { id: "light", label: "Light", hint: "Always light" },
  { id: "dark", label: "Dark", hint: "Always dark" },
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
</script>

<template>
  <article class="appearance" aria-label="Appearance settings">
    <SectionHeader v-if="props.showHeader" class="appearance__header">
      <h2 class="appearance__title">Appearance</h2>
      <p class="appearance__hint">Theme + accent color. Live preview on change.</p>
    </SectionHeader>

    <Panel
      as="section"
      class="appearance__group"
      variant="plain"
      padding="none"
      aria-labelledby="appearance-theme-label"
    >
      <h3 id="appearance-theme-label" class="appearance__group-title">Theme</h3>
      <div
        class="appearance__theme-grid"
        role="radiogroup"
        aria-labelledby="appearance-theme-label"
      >
        <button
          v-for="option in THEME_OPTIONS"
          :key="option.id"
          type="button"
          class="appearance__theme-card"
          :class="{ 'appearance__theme-card--active': option.id === preference }"
          role="radio"
          :aria-checked="option.id === preference"
          @click="selectTheme(option.id)"
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
        </button>
      </div>
    </Panel>

    <Panel
      as="section"
      class="appearance__group"
      variant="plain"
      padding="none"
      aria-labelledby="appearance-accent-label"
    >
      <h3 id="appearance-accent-label" class="appearance__group-title">Accent color</h3>
      <div class="appearance__swatches" role="radiogroup" aria-labelledby="appearance-accent-label">
        <button
          v-for="preset in ACCENT_PRESETS"
          :key="preset.id"
          type="button"
          class="appearance__swatch"
          :class="{ 'appearance__swatch--active': preset.id === selectedAccent }"
          :style="{ '--swatch-color': preset.value }"
          role="radio"
          :aria-checked="preset.id === selectedAccent"
          :aria-label="preset.label"
          :title="preset.label"
          @click="selectAccent(preset.id, preset.value)"
        >
          <CheckIcon
            v-if="preset.id === selectedAccent"
            class="appearance__swatch-check"
            aria-hidden="true"
          />
        </button>
      </div>
      <p v-if="selectedAccent === 'custom'" class="appearance__custom-hint">
        Custom override applied via `kernel.theme.setOverride`.
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

.appearance__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.appearance__title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.appearance__hint {
  color: var(--color-fg-muted);
  font-size: 13px;
  margin: 0;
}

.appearance__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.appearance__group-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin: 0;
  text-transform: uppercase;
  color: var(--color-fg-muted);
}

.appearance__theme-grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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
.appearance__theme-card:focus-visible {
  border-color: var(--color-accent);
}

.appearance__theme-card:focus-visible {
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
  flex-wrap: wrap;
  gap: var(--space-md);
}

.appearance__swatch {
  align-items: center;
  background: var(--swatch-color, var(--color-accent));
  block-size: 36px;
  border: 2px solid transparent;
  border-radius: 999px;
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
.appearance__swatch:focus-visible {
  transform: scale(1.08);
}

.appearance__swatch:focus-visible {
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
