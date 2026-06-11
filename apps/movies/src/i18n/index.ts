import { registerAppTranslations, type TranslationBundle } from "@daopk/sdk";

import en from "./locales/en.json";
import vi from "./locales/vi.json";

export const MOVIES_I18N_APP_ID = "movies";

export const moviesTranslations = {
  en,
  vi,
} satisfies TranslationBundle;

export type MoviesTranslationKey = keyof typeof en;

export function registerMoviesTranslations(): () => void {
  return registerAppTranslations(MOVIES_I18N_APP_ID, moviesTranslations);
}

registerMoviesTranslations();
