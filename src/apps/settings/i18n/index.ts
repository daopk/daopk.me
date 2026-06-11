import { registerAppTranslations, type TranslationBundle } from "~/core/i18n";

import en from "./locales/en.json";
import vi from "./locales/vi.json";

export const SETTINGS_I18N_APP_ID = "settings";

export const settingsTranslations = {
  en,
  vi,
} satisfies TranslationBundle;

export type SettingsTranslationKey = keyof typeof en;

export function registerSettingsTranslations(): () => void {
  return registerAppTranslations(SETTINGS_I18N_APP_ID, settingsTranslations);
}

registerSettingsTranslations();
