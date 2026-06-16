import type { LocaleMode, SupportedLocale } from "~/types/i18n";

export type { LocaleMode, SupportedLocale };

export type SettingsSectionId =
  | "appearance"
  | "language"
  | "background"
  | "comfort"
  | "dock"
  | "account"
  | "privacy"
  | "about";

export type SettingsSectionScope = "shared" | "desktop" | "mobile";

export interface SettingsSectionDefinition {
  readonly id: SettingsSectionId;
  readonly scope: SettingsSectionScope;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  { id: "appearance", scope: "shared" },
  { id: "language", scope: "shared" },
  { id: "background", scope: "shared" },
  { id: "comfort", scope: "shared" },
  { id: "dock", scope: "desktop" },
  { id: "account", scope: "shared" },
  { id: "privacy", scope: "shared" },
  { id: "about", scope: "shared" },
] as const;

const SETTINGS_SECTION_IDS: readonly SettingsSectionId[] = SETTINGS_SECTIONS.map(
  (section) => section.id,
);

const SETTINGS_SECTION_SCOPES: Record<SettingsSectionId, SettingsSectionScope> =
  SETTINGS_SECTIONS.reduce(
    (acc, section) => {
      acc[section.id] = section.scope;
      return acc;
    },
    {} as Record<SettingsSectionId, SettingsSectionScope>,
  );

export function isSettingsSectionId(value: unknown): value is SettingsSectionId {
  return typeof value === "string" && SETTINGS_SECTION_IDS.includes(value as SettingsSectionId);
}

export function settingsSectionAppliesToShell(
  section: SettingsSectionId,
  shellId: "desktop" | "mobile",
): boolean {
  const scope = SETTINGS_SECTION_SCOPES[section];
  return scope === "shared" || scope === shellId;
}

export function firstSettingsSectionForShell(shellId: "desktop" | "mobile"): SettingsSectionId {
  return (
    SETTINGS_SECTIONS.find((section) => settingsSectionAppliesToShell(section.id, shellId))?.id ??
    "appearance"
  );
}

export interface SettingsState {
  bootCount: number;
  locale: SupportedLocale;
  localeMode: LocaleMode;
  theme: "light" | "dark" | "system";
  shellOverride: "mobile" | "desktop" | null;
  reduceMotion: "auto" | "always" | "never";
  dockAutoHide: boolean;
  dockPinnedAppIds: string[];
  telemetryEnabled: boolean;
  desktopWallpaperActiveId: string;
  mobileWallpaperActiveId: string;
}
