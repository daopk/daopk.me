import type { AppManifest } from "~/types/app";

export const APP_SETTINGS_PANE = "settings";

export type AppSettingsLaunchArgs = Readonly<{
  pane: typeof APP_SETTINGS_PANE;
}>;

export function hasAppSettings(manifest: Pick<AppManifest, "settings">): boolean {
  return manifest.settings !== undefined;
}

export function appSettingsLaunchArgs(): AppSettingsLaunchArgs {
  return { pane: APP_SETTINGS_PANE };
}

export function isAppSettingsLaunchArgs(
  args: Readonly<Record<string, unknown>> | undefined,
): args is AppSettingsLaunchArgs {
  return args?.pane === APP_SETTINGS_PANE;
}
