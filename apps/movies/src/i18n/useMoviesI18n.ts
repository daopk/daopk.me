import { useI18n, type TranslationParams } from "@daopk/sdk";
import { watch } from "vue";

import "./index";
import type { MoviesTranslationKey } from "./index";
import { setMoviesApiLocale } from "../moviesApi";

export type MoviesTranslate = (key: MoviesTranslationKey, params?: TranslationParams) => string;

export function useMoviesI18n() {
  const i18n = useI18n();
  watch(i18n.locale, (locale) => setMoviesApiLocale(locale), { immediate: true });

  function t(key: MoviesTranslationKey, params?: TranslationParams): string {
    return i18n.t(key, params);
  }

  return {
    ...i18n,
    t,
  };
}
