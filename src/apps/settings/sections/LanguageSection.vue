<script setup vapor lang="ts">
import { Check as CheckIcon } from "~/icons/lucide";

import { GroupLabel, Panel, SectionHeader } from "~/components/kit";
import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import type { LocaleOption } from "~/composables/useI18n";

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const { localeMode, localeOptions, manualLocale, setLocale, setLocaleMode, t } = useSettingsI18n();

function isSelected(option: LocaleOption): boolean {
  if (option.mode === "auto") {
    return localeMode.value === "auto";
  }

  return localeMode.value === "manual" && option.locale === manualLocale.value;
}

function selectOption(option: LocaleOption): void {
  if (option.mode === "auto") {
    setLocaleMode("auto");
    return;
  }

  if (option.locale) {
    setLocale(option.locale);
  }
}
</script>

<template>
  <article class="language" :aria-label="t('settings.language.ariaLabel')">
    <SectionHeader
      v-if="props.showHeader"
      class="language__header"
      size="page"
      :title="t('settings.language.title')"
      :subtitle="t('settings.language.subtitle')"
    />

    <Panel
      as="section"
      class="language__group"
      variant="plain"
      padding="none"
      aria-labelledby="settings-language-label"
    >
      <GroupLabel id="settings-language-label" as="h3">
        {{ t("settings.language.group") }}
      </GroupLabel>
      <div class="language__grid" role="radiogroup" aria-labelledby="settings-language-label">
        <button
          v-for="option in localeOptions"
          :key="option.id"
          type="button"
          class="language__card"
          :class="{ 'language__card--active': isSelected(option) }"
          role="radio"
          :aria-checked="isSelected(option)"
          @click="selectOption(option)"
        >
          <span class="language__meta">
            <span class="language__label">{{ option.label }}</span>
            <span class="language__native">{{ option.nativeName }}</span>
            <span class="language__description">{{ option.description }}</span>
          </span>
          <CheckIcon v-if="isSelected(option)" class="language__check" aria-hidden="true" />
        </button>
      </div>
    </Panel>
  </article>
</template>

<style scoped lang="scss">
.language {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.language__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.language__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.language__card {
  align-items: flex-start;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: inherit;
  cursor: pointer;
  display: flex;
  font: inherit;
  justify-content: space-between;
  min-block-size: 112px;
  padding: var(--space-md);
  position: relative;
  text-align: start;
  transition:
    border-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);
}

.language__card:hover,
.language__card:focus-visible {
  border-color: var(--color-accent);
}

.language__card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.language__card--active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent) inset;
}

.language__meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.language__label {
  font-size: 14px;
  font-weight: 700;
}

.language__native {
  color: var(--color-fg);
  font-size: 13px;
  font-weight: 500;
}

.language__description {
  color: var(--color-fg-muted);
  font-size: 12px;
  line-height: 1.4;
}

.language__check {
  block-size: 18px;
  color: var(--color-accent);
  flex: 0 0 auto;
  inline-size: 18px;
}

@media (max-width: 520px) {
  .language {
    padding: var(--space-lg) var(--space-md);
  }
}
</style>
