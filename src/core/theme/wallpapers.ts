import everestDesktopUrl from "~/assets/wallpapers/everest-desktop.webp";
import everestPhoneUrl from "~/assets/wallpapers/everest-phone.webp";

import type { ShellId } from "~/types/shell";
import type { ResolvedTheme } from "~/types/theme";

export const DEFAULT_WALLPAPER_ID = "everest";
export const LEGACY_DEFAULT_WALLPAPER_IDS = ["still-waters", "framer"] as const;

export interface Wallpaper {
  id: string;
  name: string;
  type: "solid" | "gradient" | "image";
  value: string;
  valueByShell?: Partial<Record<ShellId, string>>;
  preferredTheme?: ResolvedTheme;
  userBlobKey?: string;
}

export const builtinWallpapers: readonly Wallpaper[] = [
  {
    id: DEFAULT_WALLPAPER_ID,
    name: "Everest",
    type: "image",
    value: everestDesktopUrl,
    valueByShell: {
      desktop: everestDesktopUrl,
      mobile: everestPhoneUrl,
    },
  },
] satisfies Wallpaper[];

export function listWallpapers(): readonly Wallpaper[] {
  return builtinWallpapers;
}

export function resolveWallpaperValue(wallpaper: Wallpaper, shellId: ShellId): string {
  return wallpaper.valueByShell?.[shellId] ?? wallpaper.value;
}
