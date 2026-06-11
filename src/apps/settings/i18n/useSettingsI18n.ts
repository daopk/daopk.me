import { useI18n } from "~/composables/useI18n";

import "./index";

export type { SettingsTranslationKey } from "./index";

export function useSettingsI18n(): ReturnType<typeof useI18n> {
  return useI18n();
}
