<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { Check as CheckIcon } from "~/icons/lucide";

import { GroupLabel, Panel, SectionHeader } from "~/components/kit";
import Card from "~/components/ui/Card.vue";
import { useSettingsI18n, type SettingsTranslationKey } from "~/apps/settings/i18n/useSettingsI18n";
import { useKernel } from "~/composables/useKernel";
import { useSettings } from "~/composables/useSettings";
import type { SettingsState } from "~/types/settings";

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const kernel = useKernel();
const settings = useSettings();
const { t } = useSettingsI18n();

interface DensityOption {
  id: "compact" | "cozy" | "spacious";
  labelKey: SettingsTranslationKey;
  hintKey: SettingsTranslationKey;
  scale: number;
}

const DENSITY_OPTIONS: readonly DensityOption[] = [
  {
    id: "compact",
    labelKey: "settings.comfort.density.compact.label",
    hintKey: "settings.comfort.density.compact.hint",
    scale: 0.85,
  },
  {
    id: "cozy",
    labelKey: "settings.comfort.density.cozy.label",
    hintKey: "settings.comfort.density.cozy.hint",
    scale: 1.0,
  },
  {
    id: "spacious",
    labelKey: "settings.comfort.density.spacious.label",
    hintKey: "settings.comfort.density.spacious.hint",
    scale: 1.15,
  },
];

type ReduceMotionChoice = SettingsState["reduceMotion"];

interface MotionOption {
  id: ReduceMotionChoice;
  labelKey: SettingsTranslationKey;
  hintKey: SettingsTranslationKey;
}

const MOTION_OPTIONS: readonly MotionOption[] = [
  {
    id: "auto",
    labelKey: "settings.comfort.motion.auto.label",
    hintKey: "settings.comfort.motion.auto.hint",
  },
  {
    id: "always",
    labelKey: "settings.comfort.motion.always.label",
    hintKey: "settings.comfort.motion.always.hint",
  },
  {
    id: "never",
    labelKey: "settings.comfort.motion.never.label",
    hintKey: "settings.comfort.motion.never.hint",
  },
];

interface FontFamilyOption {
  id: "system" | "inter" | "mono";
  labelKey: SettingsTranslationKey;
  hintKey: SettingsTranslationKey;
  value: string;
}

const SYSTEM_STACK_DEFAULT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif';

const FONT_FAMILY_OPTIONS: readonly FontFamilyOption[] = [
  {
    id: "system",
    labelKey: "settings.comfort.font.system.label",
    hintKey: "settings.comfort.font.system.hint",
    value: SYSTEM_STACK_DEFAULT,
  },
  {
    id: "inter",
    labelKey: "settings.comfort.font.inter.label",
    hintKey: "settings.comfort.font.inter.hint",
    value: '"Inter", sans-serif',
  },
  {
    id: "mono",
    labelKey: "settings.comfort.font.mono.label",
    hintKey: "settings.comfort.font.mono.hint",
    value: "var(--font-mono)",
  },
];

interface FontSizeOption {
  id: "small" | "medium" | "large";
  labelKey: SettingsTranslationKey;
  hintKey: SettingsTranslationKey;
  value: string;
}

const FONT_SIZE_OPTIONS: readonly FontSizeOption[] = [
  {
    id: "small",
    labelKey: "settings.comfort.size.small.label",
    hintKey: "settings.comfort.size.small.hint",
    value: "13px",
  },
  {
    id: "medium",
    labelKey: "settings.comfort.size.medium.label",
    hintKey: "settings.comfort.size.medium.hint",
    value: "14px",
  },
  {
    id: "large",
    labelKey: "settings.comfort.size.large.label",
    hintKey: "settings.comfort.size.large.hint",
    value: "15px",
  },
];

const densityRef = ref<string | undefined>(kernel.theme.currentOverrides()["--density-scale"]);
const familyRef = ref<string | undefined>(kernel.theme.currentOverrides()["--font-family-base"]);
const sizeRef = ref<string | undefined>(kernel.theme.currentOverrides()["--font-size-base"]);

const stopTokens = kernel.events.on("tokens.changed", (payload) => {
  const overrides = kernel.theme.currentOverrides();
  if (payload.keys.includes("--density-scale")) {
    densityRef.value = overrides["--density-scale"];
  }
  if (payload.keys.includes("--font-family-base")) {
    familyRef.value = overrides["--font-family-base"];
  }
  if (payload.keys.includes("--font-size-base")) {
    sizeRef.value = overrides["--font-size-base"];
  }
});
onUnmounted(stopTokens);

const selectedDensity = computed(() => {
  const raw = densityRef.value;
  if (raw === undefined) {
    return "cozy";
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return "cozy";
  }
  const match = DENSITY_OPTIONS.find((option) => Math.abs(option.scale - parsed) < 0.001);
  return match?.id ?? "custom";
});

const currentMotion = computed<ReduceMotionChoice>(() => settings.reduceMotion);

const selectedFamily = computed(() => {
  const v = familyRef.value;
  if (!v) {
    return "system";
  }
  const match = FONT_FAMILY_OPTIONS.find((option) => option.value === v);
  return match?.id ?? "custom";
});

const selectedSize = computed(() => {
  const v = sizeRef.value;
  if (!v) {
    return "medium";
  }
  const match = FONT_SIZE_OPTIONS.find((option) => option.value === v);
  return match?.id ?? "custom";
});

function selectDensity(option: DensityOption): void {
  if (option.id === selectedDensity.value) {
    return;
  }
  if (option.id === "cozy") {
    kernel.theme.unsetOverride("--density-scale");
    return;
  }
  kernel.theme.setOverride("--density-scale", String(option.scale));
}

function selectMotion(option: MotionOption): void {
  if (option.id === currentMotion.value) {
    return;
  }
  kernel.settings.set("reduceMotion", option.id);
}

function selectFamily(option: FontFamilyOption): void {
  if (option.id === selectedFamily.value) {
    return;
  }
  if (option.id === "system") {
    kernel.theme.unsetOverride("--font-family-base");
    return;
  }
  kernel.theme.setOverride("--font-family-base", option.value);
}

function selectSize(option: FontSizeOption): void {
  if (option.id === selectedSize.value) {
    return;
  }
  if (option.id === "medium") {
    kernel.theme.unsetOverride("--font-size-base");
    return;
  }
  kernel.theme.setOverride("--font-size-base", option.value);
}
</script>

<template>
  <article class="comfort" :aria-label="t('settings.comfort.ariaLabel')">
    <SectionHeader
      v-if="props.showHeader"
      size="page"
      :title="t('settings.comfort.title')"
      :subtitle="t('settings.comfort.subtitle')"
    />

    <Panel
      as="section"
      class="comfort__group"
      variant="plain"
      padding="none"
      aria-labelledby="comfort-density-label"
    >
      <GroupLabel id="comfort-density-label" as="h3">
        {{ t("settings.comfort.density") }}
      </GroupLabel>
      <div class="comfort__grid" role="radiogroup" aria-labelledby="comfort-density-label">
        <Card
          v-for="option in DENSITY_OPTIONS"
          :key="option.id"
          as="button"
          class="comfort__choice-card comfort__density-card"
          interactive
          :selected="option.id === selectedDensity"
          type="button"
          role="radio"
          :aria-checked="option.id === selectedDensity"
          @click="selectDensity(option)"
        >
          <span class="comfort__density-preview" :data-density="option.id" aria-hidden="true">
            <span class="comfort__density-preview-row" />
            <span class="comfort__density-preview-row" />
            <span class="comfort__density-preview-row comfort__density-preview-row--short" />
          </span>
          <span class="comfort__card-meta">
            <span class="comfort__card-label">{{ t(option.labelKey) }}</span>
            <span class="comfort__card-hint">{{ t(option.hintKey) }}</span>
          </span>
          <CheckIcon
            v-if="option.id === selectedDensity"
            class="comfort__card-check"
            aria-hidden="true"
          />
        </Card>
      </div>
      <p v-if="selectedDensity === 'custom'" class="comfort__custom-hint">
        {{ t("settings.comfort.customDensityHint") }}
      </p>
    </Panel>

    <Panel
      as="section"
      class="comfort__group"
      variant="plain"
      padding="none"
      aria-labelledby="comfort-motion-label"
    >
      <GroupLabel id="comfort-motion-label" as="h3">
        {{ t("settings.comfort.motion") }}
      </GroupLabel>
      <div class="comfort__grid" role="radiogroup" aria-labelledby="comfort-motion-label">
        <Card
          v-for="option in MOTION_OPTIONS"
          :key="option.id"
          as="button"
          class="comfort__choice-card comfort__motion-card"
          interactive
          :selected="option.id === currentMotion"
          type="button"
          role="radio"
          :aria-checked="option.id === currentMotion"
          @click="selectMotion(option)"
        >
          <span class="comfort__card-meta">
            <span class="comfort__card-label">{{ t(option.labelKey) }}</span>
            <span class="comfort__card-hint">{{ t(option.hintKey) }}</span>
          </span>
          <CheckIcon
            v-if="option.id === currentMotion"
            class="comfort__card-check"
            aria-hidden="true"
          />
        </Card>
      </div>
    </Panel>

    <Panel
      as="section"
      class="comfort__group"
      variant="plain"
      padding="none"
      aria-labelledby="comfort-typography-label"
    >
      <GroupLabel id="comfort-typography-label" as="h3">
        {{ t("settings.comfort.typography") }}
      </GroupLabel>
      <div class="comfort__subgroup" aria-labelledby="comfort-family-label">
        <h4 id="comfort-family-label" class="comfort__subgroup-title">
          {{ t("settings.comfort.fontFamily") }}
        </h4>
        <div class="comfort__grid" role="radiogroup" aria-labelledby="comfort-family-label">
          <Card
            v-for="option in FONT_FAMILY_OPTIONS"
            :key="option.id"
            as="button"
            class="comfort__choice-card comfort__type-card"
            interactive
            :selected="option.id === selectedFamily"
            type="button"
            role="radio"
            :aria-checked="option.id === selectedFamily"
            @click="selectFamily(option)"
          >
            <span class="comfort__type-preview" :style="{ fontFamily: option.value }">Aa</span>
            <span class="comfort__card-meta">
              <span class="comfort__card-label">{{ t(option.labelKey) }}</span>
              <span class="comfort__card-hint">{{ t(option.hintKey) }}</span>
            </span>
            <CheckIcon
              v-if="option.id === selectedFamily"
              class="comfort__card-check"
              aria-hidden="true"
            />
          </Card>
        </div>
        <p v-if="selectedFamily === 'custom'" class="comfort__custom-hint">
          {{ t("settings.comfort.customFamilyHint") }}
        </p>
      </div>

      <div class="comfort__subgroup" aria-labelledby="comfort-size-label">
        <h4 id="comfort-size-label" class="comfort__subgroup-title">
          {{ t("settings.comfort.baseSize") }}
        </h4>
        <div class="comfort__grid" role="radiogroup" aria-labelledby="comfort-size-label">
          <Card
            v-for="option in FONT_SIZE_OPTIONS"
            :key="option.id"
            as="button"
            class="comfort__choice-card comfort__type-card"
            interactive
            :selected="option.id === selectedSize"
            type="button"
            role="radio"
            :aria-checked="option.id === selectedSize"
            @click="selectSize(option)"
          >
            <span class="comfort__type-preview" :style="{ fontSize: option.value }">Aa</span>
            <span class="comfort__card-meta">
              <span class="comfort__card-label">{{ t(option.labelKey) }}</span>
              <span class="comfort__card-hint">{{ t(option.hintKey) }}</span>
            </span>
            <CheckIcon
              v-if="option.id === selectedSize"
              class="comfort__card-check"
              aria-hidden="true"
            />
          </Card>
        </div>
        <p v-if="selectedSize === 'custom'" class="comfort__custom-hint">
          {{ t("settings.comfort.customSizeHint") }}
        </p>
      </div>
    </Panel>
  </article>
</template>

<style scoped lang="scss">
.comfort {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.comfort__group,
.comfort__subgroup {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.comfort__subgroup + .comfort__subgroup {
  margin-block-start: var(--space-sm);
}

.comfort__subgroup-title {
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  margin: 0;
}

.comfort__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.comfort__choice-card {
  color: inherit;
  font: inherit;
  min-block-size: 0;
}

.comfort__density-preview,
.comfort__type-preview {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.comfort__density-preview {
  display: flex;
  flex-direction: column;
  min-block-size: 56px;
  padding: var(--space-sm);
}

.comfort__density-preview[data-density="compact"] {
  gap: 2px;
}

.comfort__density-preview[data-density="cozy"] {
  gap: 4px;
}

.comfort__density-preview[data-density="spacious"] {
  gap: 8px;
}

.comfort__density-preview-row {
  background: color-mix(in srgb, var(--color-fg-muted) 35%, transparent);
  border-radius: 2px;
  block-size: 4px;
  inline-size: 70%;
}

.comfort__density-preview-row--short {
  inline-size: 45%;
}

.comfort__type-preview {
  align-self: stretch;
  font-size: 22px;
  font-weight: 600;
  line-height: 1;
  min-block-size: 40px;
  padding: var(--space-sm);
  text-align: center;
}

.comfort__card-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.comfort__card-label {
  font-size: 13px;
  font-weight: 600;
}

.comfort__card-hint {
  color: var(--color-fg-muted);
  font-size: 11px;
  line-height: 1.4;
}

.comfort__card-check {
  block-size: 16px;
  color: var(--color-accent);
  inline-size: 16px;
  inset-block-start: var(--space-sm);
  inset-inline-end: var(--space-sm);
  position: absolute;
}

.comfort__custom-hint {
  color: var(--color-fg-muted);
  font-size: 11px;
  margin: 0;
}

.comfort__code {
  background: var(--color-bg-subtle);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 6px;
}
</style>
