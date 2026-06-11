import type { LocaleMode, SupportedLocale } from "~/types/i18n";

import coreEn from "./locales/en.json";
import coreVi from "./locales/vi.json";

export type { LocaleMode, SupportedLocale };

export const DEFAULT_LOCALE: SupportedLocale = "en";

export const DEFAULT_LOCALE_MODE: LocaleMode = "auto";

export const SUPPORTED_LOCALES = ["en", "vi"] as const satisfies readonly SupportedLocale[];

export type CoreTranslationKey = keyof typeof coreEn;

export type TranslationKey = string;

export type TranslationParams = Readonly<Record<string, string | number>>;

export type TranslationDictionary = Readonly<Record<string, string>>;

export type TranslationBundle = Partial<Record<SupportedLocale, TranslationDictionary>>;

export interface LocaleOptionDefinition {
  readonly id: SupportedLocale;
  readonly labelKey: CoreTranslationKey;
  readonly nativeNameKey: CoreTranslationKey;
  readonly descriptionKey: CoreTranslationKey;
}

const translationBundles = new Map<string, TranslationBundle>();

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function normalizeDictionary(candidate: unknown): TranslationDictionary {
  if (!isRecord(candidate)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(candidate).filter((entry): entry is [string, string] => {
      const [key, value] = entry;
      return key.length > 0 && typeof value === "string";
    }),
  );
}

function normalizeBundle(bundle: TranslationBundle): TranslationBundle {
  const normalized: Partial<Record<SupportedLocale, TranslationDictionary>> = {};

  for (const locale of SUPPORTED_LOCALES) {
    const dictionary = normalizeDictionary(bundle[locale]);
    if (Object.keys(dictionary).length > 0) {
      normalized[locale] = dictionary;
    }
  }

  return normalized;
}

function translationFor(locale: SupportedLocale, key: TranslationKey): string | undefined {
  for (const bundle of translationBundles.values()) {
    const localized = bundle[locale]?.[key];
    if (localized !== undefined) {
      return localized;
    }

    const fallback = bundle[DEFAULT_LOCALE]?.[key];
    if (fallback !== undefined) {
      return fallback;
    }
  }

  return undefined;
}

export function registerTranslationBundle(
  namespace: string,
  bundle: TranslationBundle,
): () => void {
  if (namespace.trim().length === 0) {
    throw new Error("registerTranslationBundle(): namespace is required.");
  }

  const previous = translationBundles.get(namespace);
  translationBundles.set(namespace, normalizeBundle(bundle));

  return () => {
    if (previous !== undefined) {
      translationBundles.set(namespace, previous);
      return;
    }

    translationBundles.delete(namespace);
  };
}

export function registerAppTranslations(appId: string, bundle: TranslationBundle): () => void {
  if (appId.trim().length === 0) {
    throw new Error("registerAppTranslations(): appId is required.");
  }

  return registerTranslationBundle(`app:${appId}`, bundle);
}

export function registeredTranslationNamespaces(): readonly string[] {
  return Array.from(translationBundles.keys());
}

export const LOCALE_OPTIONS: readonly LocaleOptionDefinition[] = [
  {
    id: "en",
    labelKey: "i18n.locale.en.label",
    nativeNameKey: "i18n.locale.en.native",
    descriptionKey: "i18n.locale.en.description",
  },
  {
    id: "vi",
    labelKey: "i18n.locale.vi.label",
    nativeNameKey: "i18n.locale.vi.native",
    descriptionKey: "i18n.locale.vi.description",
  },
];

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function isLocaleMode(value: unknown): value is LocaleMode {
  return value === "auto" || value === "manual";
}

export function normalizeLocaleTag(value: unknown): SupportedLocale | null {
  if (typeof value !== "string") {
    return null;
  }

  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(language) ? language : null;
}

export function preferredLocaleFromLanguages(
  languages: readonly string[] | null | undefined,
): SupportedLocale {
  for (const language of languages ?? []) {
    const locale = normalizeLocaleTag(language);
    if (locale) {
      return locale;
    }
  }

  return DEFAULT_LOCALE;
}

export function browserPreferredLocale(): SupportedLocale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }

  const candidates =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? [...navigator.languages]
      : [];

  if (typeof navigator.language === "string" && navigator.language.length > 0) {
    candidates.push(navigator.language);
  }

  return preferredLocaleFromLanguages(candidates);
}

export function translate(
  locale: SupportedLocale,
  key: TranslationKey,
  params: TranslationParams = {},
): string {
  const template = translationFor(locale, key) ?? key;

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

registerTranslationBundle("core", { en: coreEn, vi: coreVi });
