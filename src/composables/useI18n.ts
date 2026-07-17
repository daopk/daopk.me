import { computed, getCurrentScope, onScopeDispose, ref } from "vue";

import {
  LOCALE_OPTIONS,
  browserPreferredLocale,
  translate,
  type LocaleMode,
  type SupportedLocale,
  type TranslationKey,
  type TranslationParams,
} from "~/core/i18n";
import { useSettings } from "~/composables/useSettings";

const AUTO_OPTION_ID = "auto";
const browserLocale = ref<SupportedLocale>(browserPreferredLocale());
let browserLocaleSubscribers = 0;

function updateBrowserLocale(): void {
  browserLocale.value = browserPreferredLocale();
}

function useBrowserLocale(): typeof browserLocale {
  updateBrowserLocale();

  if (typeof window !== "undefined" && getCurrentScope()) {
    browserLocaleSubscribers += 1;

    if (browserLocaleSubscribers === 1) {
      window.addEventListener("languagechange", updateBrowserLocale);
    }

    onScopeDispose(() => {
      browserLocaleSubscribers = Math.max(0, browserLocaleSubscribers - 1);

      if (browserLocaleSubscribers === 0) {
        window.removeEventListener("languagechange", updateBrowserLocale);
      }
    });
  }

  return browserLocale;
}

export type LocaleOptionId = typeof AUTO_OPTION_ID | SupportedLocale;

export interface LocaleOption {
  readonly id: LocaleOptionId;
  readonly mode: LocaleMode;
  readonly locale?: SupportedLocale;
  readonly label: string;
  readonly nativeName: string;
  readonly description: string;
}

export function useI18n() {
  const settings = useSettings();
  const browserLocaleRef = useBrowserLocale();
  const localeMode = computed<LocaleMode>(() => settings.localeMode);
  const manualLocale = computed<SupportedLocale>(() => settings.locale);
  const locale = computed<SupportedLocale>(() =>
    localeMode.value === "auto" ? browserLocaleRef.value : manualLocale.value,
  );

  function t(key: TranslationKey, params?: TranslationParams): string {
    return translate(locale.value, key, params);
  }

  function setLocale(next: SupportedLocale): void {
    settings.setLocale(next);
    settings.setLocaleMode("manual");
  }

  function setLocaleMode(next: LocaleMode): void {
    settings.setLocaleMode(next);
  }

  const localeOptions = computed<readonly LocaleOption[]>(() => [
    {
      id: AUTO_OPTION_ID,
      mode: "auto",
      label: t("i18n.locale.auto.label"),
      nativeName: t("i18n.locale.auto.native"),
      description: t("i18n.locale.auto.description"),
    },
    ...LOCALE_OPTIONS.map((option) => ({
      id: option.id,
      mode: "manual" as const,
      locale: option.id,
      label: t(option.labelKey),
      nativeName: t(option.nativeNameKey),
      description: t(option.descriptionKey),
    })),
  ]);

  return {
    locale,
    localeMode,
    localeOptions,
    manualLocale,
    setLocale,
    setLocaleMode,
    t,
  };
}
