import type { Pinia } from "pinia";
import { toRef } from "vue";

import type { EventBus } from "~/core/kernel/EventBus";
import { useSettingsStore } from "~/core/storage/SettingsStore";
import type { Kernel } from "~/types/kernel";
import type { SettingsState } from "~/types/settings";

type SettingsStore = ReturnType<typeof useSettingsStore>;

type SettingsSetter<K extends keyof SettingsState> = (
  store: SettingsStore,
  value: SettingsState[K],
) => void;

type SettingsSetterMap = {
  [K in keyof SettingsState]?: SettingsSetter<K>;
};

export interface SettingsFacadeDeps {
  readonly bus: EventBus;
  readonly requirePinia: () => Pinia;
}

/**
 * Builds the `kernel.settings` surface. `set` dispatches through a per-key
 * setter map rather than a `switch`: store-owned setters run their own change
 * notification, while the two `$patch`-based keys emit `settings.changed`
 * explicitly. Keys absent from the map are a no-op, and `bootCount` throws
 * (it is bootstrap-owned).
 */
export function createSettingsFacade(deps: SettingsFacadeDeps): Kernel["settings"] {
  const { bus, requirePinia } = deps;

  const setters: SettingsSetterMap = {
    locale: (store, value) => store.setLocale(value),
    localeMode: (store, value) => store.setLocaleMode(value),
    theme: (store, value) => store.setTheme(value),
    shellOverride: (store, value) => store.setShellOverride(value),
    reduceMotion: (store, value) => {
      store.$patch({ reduceMotion: value });
      bus.emit("settings.changed", { key: "reduceMotion" });
    },
    dockAutoHide: (store, value) => store.setDockAutoHide(value),
    dockPinnedAppIds: (store, value) => store.setDockPinnedAppIds(value),
    telemetryEnabled: (store, value) => {
      store.$patch({ telemetryEnabled: value });
      bus.emit("settings.changed", { key: "telemetryEnabled" });
    },
    desktopWallpaperActiveId: (store, value) => store.setDesktopWallpaperActiveId(value),
    mobileWallpaperActiveId: (store, value) => store.setMobileWallpaperActiveId(value),
    bootCount: () => {
      throw new Error(
        `kernel.settings.set('bootCount') — mutate via bootstrap / store.incrementBootCount() only.`,
      );
    },
  };

  return {
    use<K extends keyof SettingsState>(key: K) {
      return toRef(useSettingsStore(requirePinia()), key);
    },

    get<K extends keyof SettingsState>(key: K): SettingsState[K] {
      return useSettingsStore(requirePinia())[key];
    },

    set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void {
      const setter = setters[key];
      if (!setter) {
        return;
      }
      setter(useSettingsStore(requirePinia()), value);
    },

    reset(): void {
      useSettingsStore(requirePinia()).reset();
    },
  };
}
