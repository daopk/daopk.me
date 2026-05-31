/**
 * Persisted kernel settings —
 * WHY debounced KV writes: tame localStorage churn while edits burst during boot.
 */

import { defineStore } from "pinia";
import { computed, ref, watch, type WatchStopHandle } from "vue";

import { SETTINGS_KV_PRIMARY_KEY } from "~/core/storage/constants";
import { createKvBackedStore } from "~/core/storage/createKvBackedStore";
import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import { subscribeSystemPreference } from "~/core/theme/systemPreference";
import { DEFAULT_WALLPAPER_ID, LEGACY_DEFAULT_WALLPAPER_IDS } from "~/core/theme/wallpapers";
import type { SettingsState } from "~/types/settings";
import type { ResolvedTheme } from "~/types/theme";

export const DEFAULT_DOCK_PINNED_APP_IDS = [
  "finder",
  "browser",
  "editor",
  "notes",
  "photos",
  "pdf-viewer",
  "terminal",
  "settings",
];

const DEFAULT_SETTINGS: SettingsState = {
  bootCount: 0,

  theme: "system",

  shellOverride: null,

  reduceMotion: "auto",

  dockAutoHide: false,

  dockPinnedAppIds: [...DEFAULT_DOCK_PINNED_APP_IDS],

  telemetryEnabled: false,

  desktopWallpaperActiveId: DEFAULT_WALLPAPER_ID,

  mobileWallpaperActiveId: DEFAULT_WALLPAPER_ID,
};

export interface SettingsHydrateHooks {
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

  let persistStop: WatchStopHandle | undefined;

  let disposeOsScheme: undefined | (() => void);

  let disposeUnload: undefined | (() => void);

  const bootCount = ref(DEFAULT_SETTINGS.bootCount);

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

  const persistence = createKvBackedStore<SettingsState>({
    primaryKey: SETTINGS_KV_PRIMARY_KEY,
    version: 1,
    debounceMs: 250,
    snapshot: stateSnapshot,
    onRemoteChange: () => {
      handleRemoteKvNotification();
    },
  });

  function applyKvPayload(next: SettingsState): void {
    const previous = stateSnapshot();

    if (snapshotsEqual(previous, next)) {
      return;
    }

    persistence.runSuppressedUntilNextTick(() => {
      bootCount.value = next.bootCount;

      theme.value = next.theme;

      shellOverride.value = next.shellOverride;

      reduceMotion.value = next.reduceMotion;

      dockAutoHide.value = next.dockAutoHide;

      dockPinnedAppIds.value = [...next.dockPinnedAppIds];

      telemetryEnabled.value = next.telemetryEnabled;

      desktopWallpaperActiveId.value = next.desktopWallpaperActiveId;

      mobileWallpaperActiveId.value = next.mobileWallpaperActiveId;
    });

    emitKeyDiff(previous, next, hooksRef.value?.onSettingsChanged);
  }

  function handleRemoteKvNotification(): void {
    hooksRef.value?.onStorageSynced?.();

    const raw = persistence.read();

    if (!raw) {
      return;
    }

    applyKvPayload(coerceSettings(raw));
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

    persistence.schedule();
  }

  function setTheme(pref: SettingsState["theme"]): void {
    if (pref === theme.value) {
      return;
    }

    theme.value = pref;

    hooksRef.value?.onSettingsChanged?.("theme");

    persistence.schedule();
  }

  function setShellOverride(value: SettingsState["shellOverride"]): void {
    shellOverride.value = value;

    hooksRef.value?.onSettingsChanged?.("shellOverride");

    persistence.schedule();
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

    persistence.schedule();
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

    persistence.schedule();
  }

  function resetReduceMotion(): void {
    reduceMotion.value = "auto";

    hooksRef.value?.onSettingsChanged?.("reduceMotion");

    persistence.schedule();
  }

  function setDockAutoHide(value: SettingsState["dockAutoHide"]): void {
    if (value === dockAutoHide.value) {
      return;
    }

    dockAutoHide.value = value;

    hooksRef.value?.onSettingsChanged?.("dockAutoHide");

    persistence.schedule();
  }

  function setDockPinnedAppIds(value: SettingsState["dockPinnedAppIds"]): void {
    const next = sanitizeDockPinnedAppIds(value);

    if (stringArraysEqual(next, dockPinnedAppIds.value)) {
      return;
    }

    dockPinnedAppIds.value = next;

    hooksRef.value?.onSettingsChanged?.("dockPinnedAppIds");

    persistence.schedule();
  }

  function reset(): void {
    persistence.runSuppressed(() => {
      bootCount.value = DEFAULT_SETTINGS.bootCount;

      theme.value = DEFAULT_SETTINGS.theme;

      shellOverride.value = DEFAULT_SETTINGS.shellOverride;

      reduceMotion.value = DEFAULT_SETTINGS.reduceMotion;

      dockAutoHide.value = DEFAULT_SETTINGS.dockAutoHide;

      dockPinnedAppIds.value = [...DEFAULT_SETTINGS.dockPinnedAppIds];

      telemetryEnabled.value = DEFAULT_SETTINGS.telemetryEnabled;

      desktopWallpaperActiveId.value = DEFAULT_SETTINGS.desktopWallpaperActiveId;

      mobileWallpaperActiveId.value = DEFAULT_SETTINGS.mobileWallpaperActiveId;
    });

    hooksRef.value?.onSettingsChanged?.("bootCount");

    hooksRef.value?.onSettingsChanged?.("theme");

    hooksRef.value?.onSettingsChanged?.("shellOverride");

    hooksRef.value?.onSettingsChanged?.("reduceMotion");

    hooksRef.value?.onSettingsChanged?.("dockAutoHide");

    hooksRef.value?.onSettingsChanged?.("dockPinnedAppIds");

    hooksRef.value?.onSettingsChanged?.("telemetryEnabled");

    hooksRef.value?.onSettingsChanged?.("desktopWallpaperActiveId");

    hooksRef.value?.onSettingsChanged?.("mobileWallpaperActiveId");

    persistence.schedule();
  }

  function hydrate(initialHooks?: SettingsHydrateHooks): void {
    hooksRef.value = initialHooks;

    persistence.flush();

    persistStop?.();

    persistStop = undefined;

    disposeOsScheme?.();

    disposeOsScheme = undefined;

    disposeUnload?.();

    disposeUnload = undefined;

    persistence.start(initialHooks?.storageNamespace ?? activeProfileKvNamespace("settings"));

    const persisted = persistence.read();

    const loaded = persisted !== null ? coerceSettings(persisted) : coerceSettings(undefined);

    persistence.runSuppressed(() => {
      bootCount.value = loaded.bootCount;

      theme.value = loaded.theme;

      shellOverride.value = loaded.shellOverride;

      reduceMotion.value = loaded.reduceMotion;

      dockAutoHide.value = loaded.dockAutoHide;

      dockPinnedAppIds.value = [...loaded.dockPinnedAppIds];

      telemetryEnabled.value = loaded.telemetryEnabled;

      desktopWallpaperActiveId.value = loaded.desktopWallpaperActiveId;

      mobileWallpaperActiveId.value = loaded.mobileWallpaperActiveId;
    });

    disposeOsScheme = subscribeSystemPreference((resolved) => {
      prefersSystemDark.value = resolved === "dark";
    });

    const onPageHide = (): void => {
      flush();
    };

    const onVisibilityChange = (): void => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        flush();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", onPageHide);

      document.addEventListener("visibilitychange", onVisibilityChange);

      disposeUnload = (): void => {
        window.removeEventListener("pagehide", onPageHide);

        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }

    persistStop = watch(
      [
        bootCount,
        theme,
        shellOverride,
        reduceMotion,
        dockAutoHide,
        dockPinnedAppIds,
        telemetryEnabled,
        desktopWallpaperActiveId,

        mobileWallpaperActiveId,
      ],

      (): void => {
        if (!persistence.kv.value || persistence.isSuppressed) {
          return;
        }

        persistence.schedule();
      },

      {
        flush: "post",
      },
    );
  }

  /** Kernel/HMR teardown — WHY: unregister listeners deterministically so reload doesn't leak storage handlers. */

  function dispose(): void {
    persistence.flush();

    persistStop?.();

    persistStop = undefined;

    persistence.dispose();

    disposeOsScheme?.();

    disposeOsScheme = undefined;

    disposeUnload?.();

    disposeUnload = undefined;

    hooksRef.value = undefined;
  }

  return {
    bootCount,

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

    setShellOverride,

    setDesktopWallpaperActiveId,

    setMobileWallpaperActiveId,

    resetReduceMotion,

    setDockAutoHide,

    setDockPinnedAppIds,

    reset,
  };
});
