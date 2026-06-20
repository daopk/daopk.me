import type { Pinia } from "pinia";

import type { ThemeManager } from "~/core/theme/ThemeManager";
import { useTokenOverridesStore } from "~/core/theme/TokenOverridesStore";
import type { Kernel } from "~/types/kernel";

export interface ThemeFacadeDeps {
  readonly requirePinia: () => Pinia;
  /** Resolves the live ThemeManager, which only exists after `kernel.init()`. */
  readonly getThemeManager: () => ThemeManager | undefined;
}

/**
 * Builds the `kernel.theme` surface. Theme reads/mutations require an
 * initialized {@link ThemeManager} (created in `kernel.init`); token overrides
 * are delegated to the profile-scoped store.
 */
export function createThemeFacade(deps: ThemeFacadeDeps): Kernel["theme"] {
  const { requirePinia, getThemeManager } = deps;

  function requireManager(method: string): ThemeManager {
    const themeManager = getThemeManager();
    if (!themeManager) {
      throw new Error(`kernel.theme.${method}() called before kernel.init()`);
    }
    return themeManager;
  }

  return {
    current() {
      return requireManager("current").current();
    },

    setTheme(name) {
      requireManager("setTheme").setTheme(name);
    },

    subscribe(listener) {
      return requireManager("subscribe").subscribe(listener);
    },

    list() {
      return requireManager("list").list();
    },

    currentOverrides() {
      return requireManager("currentOverrides").currentOverrides();
    },

    setOverride(cssVar, value) {
      useTokenOverridesStore(requirePinia()).set(cssVar, value);
    },

    unsetOverride(cssVar) {
      useTokenOverridesStore(requirePinia()).unset(cssVar);
    },

    setOverrides(patch) {
      useTokenOverridesStore(requirePinia()).setMany({ ...patch });
    },

    resetOverrides() {
      useTokenOverridesStore(requirePinia()).reset();
    },
  };
}
