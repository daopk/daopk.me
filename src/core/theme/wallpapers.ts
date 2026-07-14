import auroraFjordDesktopUrl from "~/assets/wallpapers/aurora-fjord-desktop.webp";
import auroraFjordPhoneUrl from "~/assets/wallpapers/aurora-fjord-phone.webp";
import coastalDawnDesktopUrl from "~/assets/wallpapers/coastal-dawn-desktop.webp";
import coastalDawnPhoneUrl from "~/assets/wallpapers/coastal-dawn-phone.webp";
import liquidGlassDesktopUrl from "~/assets/wallpapers/liquid-glass-desktop.webp";
import liquidGlassPhoneUrl from "~/assets/wallpapers/liquid-glass-phone.webp";

import type { ShellId } from "~/types/shell";
import type { ResolvedTheme } from "~/types/theme";

export const DEFAULT_WALLPAPER_ID = "liquid-glass";
export const LEGACY_DEFAULT_WALLPAPER_IDS = ["still-waters", "framer", "everest"] as const;
export const DEFAULT_WALLPAPER_DESKTOP_URL = liquidGlassDesktopUrl;
export const DEFAULT_WALLPAPER_MOBILE_URL = liquidGlassPhoneUrl;

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
    name: "Liquid Glass",
    type: "image",
    value: liquidGlassDesktopUrl,
    valueByShell: {
      desktop: liquidGlassDesktopUrl,
      mobile: liquidGlassPhoneUrl,
    },
  },
  {
    id: "aurora-fjord",
    name: "Aurora Fjord",
    type: "image",
    value: auroraFjordDesktopUrl,
    valueByShell: {
      desktop: auroraFjordDesktopUrl,
      mobile: auroraFjordPhoneUrl,
    },
    preferredTheme: "dark",
  },
  {
    id: "coastal-dawn",
    name: "Coastal Dawn",
    type: "image",
    value: coastalDawnDesktopUrl,
    valueByShell: {
      desktop: coastalDawnDesktopUrl,
      mobile: coastalDawnPhoneUrl,
    },
    preferredTheme: "light",
  },
] satisfies Wallpaper[];

export function listWallpapers(): readonly Wallpaper[] {
  return builtinWallpapers;
}

export function resolveWallpaperValue(wallpaper: Wallpaper, shellId: ShellId): string {
  return wallpaper.valueByShell?.[shellId] ?? wallpaper.value;
}
