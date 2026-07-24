/**
 * Persisted kernel settings —
 * WHY debounced KV writes: tame localStorage churn while edits burst during boot.
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { SETTINGS_KV_PRIMARY_KEY } from "~/core/storage/constants";
import {
  createPersistedState,
  type PersistedStateOrigin,
} from "~/core/storage/createPersistedState";
import { DEFAULT_LOCALE, DEFAULT_LOCALE_MODE, isLocaleMode, isSupportedLocale } from "~/core/i18n";
import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import { subscribeSystemPreference } from "~/core/theme/systemPreference";
import { DEFAULT_WALLPAPER_ID, LEGACY_DEFAULT_WALLPAPER_IDS } from "~/core/theme/wallpapers";
import type { SettingsState } from "~/types/settings";
import type { ResolvedTheme } from "~/types/theme";

export const DEFAULT_DOCK_PINNED_APP_IDS = [
  "finder",
  "blog",
  "browser",
  "calendar",
  "clock",
  "notes",
  "photos",
  "movies",
  "settings",
  "app-store",
];

const DEFAULT_SETTINGS: SettingsState = {
  bootCount: 0,

  locale: DEFAULT_LOCALE,

  localeMode: DEFAULT_LOCALE_MODE,

  theme: "system",

  shellOverride: null,

  reduceMotion: "auto",

  dockAutoHide: false,

  dockPinnedAppIds: [...DEFAULT_DOCK_PINNED_APP_IDS],

  telemetryEnabled: false,

  desktopWallpaperActiveId: DEFAULT_WALLPAPER_ID,

  mobileWallpaperActiveId: DEFAULT_WALLPAPER_ID,
};

interface SettingsHydrateHooks {
  onSettingsChanged?: (key: keyof SettingsState) => void;
  /** Cross-tab KV notification — emits `settings.synced` downstream. */

  onStorageSynced?: () => void;
  storageNamespace?: string;
}

function sanitizeDockPinnedAppIds(candidate: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const value of candidate) {
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) {
      continue;
    }

    seen.add(value);
    ids.push(value);
  }

  return ids;
}

function defaultSettingsSnapshot(): SettingsState {
  return {
    ...DEFAULT_SETTINGS,
    dockPinnedAppIds: [...DEFAULT_SETTINGS.dockPinnedAppIds],
  };
}

function coerceWallpaperId(candidate: unknown): string | undefined {
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function normalizeWallpaperId(candidate: unknown): string | undefined {
  const id = coerceWallpaperId(candidate);
  if (!id) {
    return undefined;
  }
  return (LEGACY_DEFAULT_WALLPAPER_IDS as readonly string[]).includes(id)
    ? DEFAULT_WALLPAPER_ID
    : id;
}

function coerceSettings(candidate: unknown): SettingsState {
  if (typeof candidate !== "object" || candidate === null) {
    return defaultSettingsSnapshot();
  }

  const c = candidate as Partial<Record<keyof SettingsState, unknown>> & {
    wallpaperActiveId?: unknown;
  };
  const merged: SettingsState = defaultSettingsSnapshot();

  if (typeof c.bootCount === "number" && Number.isFinite(c.bootCount)) {
    merged.bootCount = Math.max(0, Math.floor(c.bootCount));
  }

  if (isSupportedLocale(c.locale)) {
    merged.locale = c.locale;
  }

  if (isLocaleMode(c.localeMode)) {
    merged.localeMode = c.localeMode;
  } else if (isSupportedLocale(c.locale) && c.locale !== DEFAULT_LOCALE) {
    merged.localeMode = "manual";
  }

  if (c.theme === "light" || c.theme === "dark" || c.theme === "system") {
    merged.theme = c.theme;
  }

  if (c.shellOverride === null || c.shellOverride === "mobile" || c.shellOverride === "desktop") {
    merged.shellOverride = c.shellOverride;
  }

  if (c.reduceMotion === "auto" || c.reduceMotion === "always" || c.reduceMotion === "never") {
    merged.reduceMotion = c.reduceMotion;
  }

  if (typeof c.dockAutoHide === "boolean") {
    merged.dockAutoHide = c.dockAutoHide;
  }

  if (Array.isArray(c.dockPinnedAppIds)) {
    merged.dockPinnedAppIds = sanitizeDockPinnedAppIds(c.dockPinnedAppIds);
  }

  if (typeof c.telemetryEnabled === "boolean") {
    merged.telemetryEnabled = c.telemetryEnabled;
  }

  const legacyWallpaperId = normalizeWallpaperId(c.wallpaperActiveId);
  merged.desktopWallpaperActiveId =
    normalizeWallpaperId(c.desktopWallpaperActiveId) ?? legacyWallpaperId ?? DEFAULT_WALLPAPER_ID;
  merged.mobileWallpaperActiveId =
    normalizeWallpaperId(c.mobileWallpaperActiveId) ?? legacyWallpaperId ?? DEFAULT_WALLPAPER_ID;

  return merged;
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function snapshotsEqual(left: SettingsState, right: SettingsState): boolean {
  return (
    left.bootCount === right.bootCount &&
    left.locale === right.locale &&
    left.localeMode === right.localeMode &&
    left.theme === right.theme &&
    left.shellOverride === right.shellOverride &&
    left.reduceMotion === right.reduceMotion &&
    left.dockAutoHide === right.dockAutoHide &&
    stringArraysEqual(left.dockPinnedAppIds, right.dockPinnedAppIds) &&
    left.telemetryEnabled === right.telemetryEnabled &&
    left.desktopWallpaperActiveId === right.desktopWallpaperActiveId &&
    left.mobileWallpaperActiveId === right.mobileWallpaperActiveId
  );
}

function emitKeyDiff(
  previous: SettingsState,
  next: SettingsState,
  emitter?: (key: keyof SettingsState) => void,
): void {
  (Object.keys(previous) as Array<keyof SettingsState>).forEach((key: keyof SettingsState) => {
    const changed =
      key === "dockPinnedAppIds"
        ? !stringArraysEqual(previous.dockPinnedAppIds, next.dockPinnedAppIds)
        : previous[key] !== next[key];

    if (changed) {
      emitter?.(key);
    }
  });
}

export const useSettingsStore = defineStore("kernel-settings", () => {
  const hooksRef = ref<SettingsHydrateHooks | undefined>();

  const prefersSystemDark = ref(false);

  let disposeOsScheme: undefined | (() => void);

  const bootCount = ref(DEFAULT_SETTINGS.bootCount);

  const locale = ref<SettingsState["locale"]>(DEFAULT_SETTINGS.locale);

  const localeMode = ref<SettingsState["localeMode"]>(DEFAULT_SETTINGS.localeMode);

  const theme = ref<SettingsState["theme"]>(DEFAULT_SETTINGS.theme);

  const shellOverride = ref<SettingsState["shellOverride"]>(DEFAULT_SETTINGS.shellOverride);

  const reduceMotion = ref<SettingsState["reduceMotion"]>(DEFAULT_SETTINGS.reduceMotion);

  const dockAutoHide = ref(DEFAULT_SETTINGS.dockAutoHide);

  const dockPinnedAppIds = ref<string[]>([...DEFAULT_SETTINGS.dockPinnedAppIds]);

  const telemetryEnabled = ref(DEFAULT_SETTINGS.telemetryEnabled);

  const desktopWallpaperActiveId = ref<SettingsState["desktopWallpaperActiveId"]>(
    DEFAULT_SETTINGS.desktopWallpaperActiveId,
  );

  const mobileWallpaperActiveId = ref<SettingsState["mobileWallpaperActiveId"]>(
    DEFAULT_SETTINGS.mobileWallpaperActiveId,
  );

  function stateSnapshot(): SettingsState {
    return {
      bootCount: bootCount.value,

      locale: locale.value,

      localeMode: localeMode.value,

      theme: theme.value,

      shellOverride: shellOverride.value,

      reduceMotion: reduceMotion.value,

      dockAutoHide: dockAutoHide.value,

      dockPinnedAppIds: [...dockPinnedAppIds.value],

      telemetryEnabled: telemetryEnabled.value,

      desktopWallpaperActiveId: desktopWallpaperActiveId.value,

      mobileWallpaperActiveId: mobileWallpaperActiveId.value,
    };
  }

  const persistence = createPersistedState<SettingsState>({
    primaryKey: SETTINGS_KV_PRIMARY_KEY,
    version: 1,
    debounceMs: 250,
    snapshot: stateSnapshot,
    resolve: (candidate, origin) => {
      if (candidate === null && origin === "remote") {
        return undefined;
      }
      return { value: coerceSettings(candidate) };
    },
    apply: applyKvPayload,
    onRemoteReconciled: () => {
      hooksRef.value?.onStorageSynced?.();
    },
  });

  function applyKvPayload(next: SettingsState, origin: PersistedStateOrigin): void {
    const previous = stateSnapshot();

    if (snapshotsEqual(previous, next)) {
      return;
    }

    bootCount.value = next.bootCount;

    locale.value = next.locale;

    localeMode.value = next.localeMode;

    theme.value = next.theme;

    shellOverride.value = next.shellOverride;

    reduceMotion.value = next.reduceMotion;

    dockAutoHide.value = next.dockAutoHide;

    dockPinnedAppIds.value = [...next.dockPinnedAppIds];

    telemetryEnabled.value = next.telemetryEnabled;

    desktopWallpaperActiveId.value = next.desktopWallpaperActiveId;

    mobileWallpaperActiveId.value = next.mobileWallpaperActiveId;

    if (origin === "remote") {
      emitKeyDiff(previous, next, hooksRef.value?.onSettingsChanged);
    }
  }

  const effectiveTheme = computed<ResolvedTheme>(() =>
    theme.value === "system" ? (prefersSystemDark.value ? "dark" : "light") : theme.value,
  );

  function flush(): void {
    persistence.flush();
  }

  function incrementBootCount(): void {
    bootCount.value += 1;

    hooksRef.value?.onSettingsChanged?.("bootCount");
  }

  function setTheme(pref: SettingsState["theme"]): void {
    if (pref === theme.value) {
      return;
    }

    theme.value = pref;

    hooksRef.value?.onSettingsChanged?.("theme");
  }

  function setLocale(value: SettingsState["locale"]): void {
    const next = isSupportedLocale(value) ? value : DEFAULT_SETTINGS.locale;

    if (next === locale.value) {
      return;
    }

    locale.value = next;

    hooksRef.value?.onSettingsChanged?.("locale");
  }

  function setLocaleMode(value: SettingsState["localeMode"]): void {
    const next = isLocaleMode(value) ? value : DEFAULT_SETTINGS.localeMode;

    if (next === localeMode.value) {
      return;
    }

    localeMode.value = next;

    hooksRef.value?.onSettingsChanged?.("localeMode");
  }

  function setShellOverride(value: SettingsState["shellOverride"]): void {
    shellOverride.value = value;

    hooksRef.value?.onSettingsChanged?.("shellOverride");
  }

  function setDesktopWallpaperActiveId(value: SettingsState["desktopWallpaperActiveId"]): void {
    const next =
      typeof value === "string" && value.length > 0
        ? value
        : DEFAULT_SETTINGS.desktopWallpaperActiveId;

    if (next === desktopWallpaperActiveId.value) {
      return;
    }

    desktopWallpaperActiveId.value = next;

    hooksRef.value?.onSettingsChanged?.("desktopWallpaperActiveId");
  }

  function setMobileWallpaperActiveId(value: SettingsState["mobileWallpaperActiveId"]): void {
    const next =
      typeof value === "string" && value.length > 0
        ? value
        : DEFAULT_SETTINGS.mobileWallpaperActiveId;

    if (next === mobileWallpaperActiveId.value) {
      return;
    }

    mobileWallpaperActiveId.value = next;

    hooksRef.value?.onSettingsChanged?.("mobileWallpaperActiveId");
  }

  function resetReduceMotion(): void {
    reduceMotion.value = "auto";

    hooksRef.value?.onSettingsChanged?.("reduceMotion");
  }

  function setDockAutoHide(value: SettingsState["dockAutoHide"]): void {
    if (value === dockAutoHide.value) {
      return;
    }

    dockAutoHide.value = value;

    hooksRef.value?.onSettingsChanged?.("dockAutoHide");
  }

  function setDockPinnedAppIds(value: SettingsState["dockPinnedAppIds"]): void {
    const next = sanitizeDockPinnedAppIds(value);

    if (stringArraysEqual(next, dockPinnedAppIds.value)) {
      return;
    }

    dockPinnedAppIds.value = next;

    hooksRef.value?.onSettingsChanged?.("dockPinnedAppIds");
  }

  function reset(): void {
    bootCount.value = DEFAULT_SETTINGS.bootCount;

    locale.value = DEFAULT_SETTINGS.locale;

    localeMode.value = DEFAULT_SETTINGS.localeMode;

    theme.value = DEFAULT_SETTINGS.theme;

    shellOverride.value = DEFAULT_SETTINGS.shellOverride;

    reduceMotion.value = DEFAULT_SETTINGS.reduceMotion;

    dockAutoHide.value = DEFAULT_SETTINGS.dockAutoHide;

    dockPinnedAppIds.value = [...DEFAULT_SETTINGS.dockPinnedAppIds];

    telemetryEnabled.value = DEFAULT_SETTINGS.telemetryEnabled;

    desktopWallpaperActiveId.value = DEFAULT_SETTINGS.desktopWallpaperActiveId;

    mobileWallpaperActiveId.value = DEFAULT_SETTINGS.mobileWallpaperActiveId;

    hooksRef.value?.onSettingsChanged?.("bootCount");

    hooksRef.value?.onSettingsChanged?.("locale");

    hooksRef.value?.onSettingsChanged?.("localeMode");

    hooksRef.value?.onSettingsChanged?.("theme");

    hooksRef.value?.onSettingsChanged?.("shellOverride");

    hooksRef.value?.onSettingsChanged?.("reduceMotion");

    hooksRef.value?.onSettingsChanged?.("dockAutoHide");

    hooksRef.value?.onSettingsChanged?.("dockPinnedAppIds");

    hooksRef.value?.onSettingsChanged?.("telemetryEnabled");

    hooksRef.value?.onSettingsChanged?.("desktopWallpaperActiveId");

    hooksRef.value?.onSettingsChanged?.("mobileWallpaperActiveId");
  }

  function hydrate(initialHooks?: SettingsHydrateHooks): void {
    hooksRef.value = initialHooks;

    disposeOsScheme?.();

    disposeOsScheme = undefined;

    persistence.hydrate(initialHooks?.storageNamespace ?? activeProfileKvNamespace("settings"));

    disposeOsScheme = subscribeSystemPreference((resolved) => {
      prefersSystemDark.value = resolved === "dark";
    });
  }

  /** Kernel/HMR teardown — WHY: unregister listeners deterministically so reload doesn't leak storage handlers. */

  function dispose(): void {
    persistence.dispose();

    disposeOsScheme?.();

    disposeOsScheme = undefined;

    hooksRef.value = undefined;
  }

  return {
    bootCount,

    locale,

    localeMode,

    theme,

    shellOverride,

    reduceMotion,

    dockAutoHide,

    dockPinnedAppIds,

    telemetryEnabled,

    desktopWallpaperActiveId,

    mobileWallpaperActiveId,

    effectiveTheme,

    hydrate,

    flush,

    dispose,

    incrementBootCount,

    setTheme,

    setLocale,

    setLocaleMode,

    setShellOverride,

    setDesktopWallpaperActiveId,

    setMobileWallpaperActiveId,

    resetReduceMotion,

    setDockAutoHide,

    setDockPinnedAppIds,

    reset,
  };
});
