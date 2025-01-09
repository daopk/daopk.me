import { SettingsAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

/**
 * Settings. First UX surface exposing the TokenOverridesStore.
 *
 * `singleton: true` mirrors macOS System Settings behavior — relaunching from
 * the dock focuses the existing window instead of spawning a duplicate.
 * Defaults intentionally fit the densest section (Appearance) without
 * scrollbars on 1366×768 (entry-level laptop target).
 */
export const settingsManifest: AppManifest = {
  id: "settings",
  name: "Settings",
  icon: SettingsAppIcon,
  category: "system",
  singleton: true,
  defaultWindow: { width: 720, height: 480 },
  component: () => import("./App.vue"),
  keywords: [
    "preferences",
    "options",
    "config",
    "appearance",
    "theme",
    "background",
    "wallpaper",
    "dock",
  ],
};
