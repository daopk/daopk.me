import { useI18n, type TranslationParams } from "@daopk/sdk";

import "./index";
import type { MoviesTranslationKey } from "./index";

export type MoviesTranslate = (key: MoviesTranslationKey, params?: TranslationParams) => string;

export function useMoviesI18n() {
  const i18n = useI18n();

  function t(key: MoviesTranslationKey, params?: TranslationParams): string {
    return i18n.t(key, params);
  }

  return {
    ...i18n,
    t,
  };
}
