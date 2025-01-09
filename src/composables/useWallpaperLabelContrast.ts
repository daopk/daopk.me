import { ref, watchEffect, type Ref } from "vue";

import { useWallpaper } from "~/composables/useWallpaper";
import type { Wallpaper } from "~/core/theme/wallpapers";
import {
  FALLBACK_WALLPAPER_LABEL_CONTRAST,
  resolveWallpaperLabelContrast,
  wallpaperLabelContrastStyle,
} from "~/core/wallpaper/contrast";
import type { ShellId } from "~/types/shell";

export function useWallpaperLabelContrast(
  shellId: ShellId = "desktop",
): Readonly<Ref<Record<string, string>>> {
  const { current } = useWallpaper({ shellId });
  const labelStyle = ref<Record<string, string>>(
    wallpaperLabelContrastStyle(FALLBACK_WALLPAPER_LABEL_CONTRAST),
  );

  watchEffect((onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    let wallpaper: Wallpaper;
    try {
      wallpaper = current.value;
    } catch {
      labelStyle.value = wallpaperLabelContrastStyle(FALLBACK_WALLPAPER_LABEL_CONTRAST);
      return;
    }

    void resolveWallpaperLabelContrast(wallpaper).then((contrast) => {
      if (cancelled) {
        return;
      }
      labelStyle.value = wallpaperLabelContrastStyle(contrast);
    });
  });

  return labelStyle;
}
