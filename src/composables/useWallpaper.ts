import { computed, onScopeDispose, ref, unref, watch, type ComputedRef, type Ref } from "vue";

import { debugWarn } from "~/core/debug";
import { kernel } from "~/core/kernel";
import { resolveWallpaperValue, type Wallpaper } from "~/core/theme/wallpapers";
import { useWallpaperStore } from "~/core/wallpaper/WallpaperStore";
import { useSettings } from "~/composables/useSettings";
import type { ShellId } from "~/types/shell";

type ShellIdSource = ShellId | Readonly<Ref<ShellId>>;

export function useWallpaper(options?: {
  list?: () => readonly Wallpaper[];
  shellId?: ShellIdSource;
}): {
  current: ComputedRef<Wallpaper>;
  list: () => readonly Wallpaper[];
} {
  const builtinListFn =
    options?.list ?? ((): readonly Wallpaper[] => kernel.wallpapers.list() as readonly Wallpaper[]);

  const settings = useSettings();
  const wallpaperStore = useWallpaperStore();
  const shellIdSource = options?.shellId ?? "desktop";

  function currentShellId(): ShellId {
    return unref(shellIdSource);
  }

  function activeWallpaperId(): string {
    return currentShellId() === "mobile"
      ? settings.mobileWallpaperActiveId
      : settings.desktopWallpaperActiveId;
  }

  function setActiveWallpaperId(id: string): void {
    if (currentShellId() === "mobile") {
      settings.setMobileWallpaperActiveId(id);
      return;
    }
    settings.setDesktopWallpaperActiveId(id);
  }

  function resolveForShell(wallpaper: Wallpaper): Wallpaper {
    return {
      ...wallpaper,
      value: resolveWallpaperValue(wallpaper, currentShellId()),
    };
  }

  const registryVersion = ref(0);
  const stopWallpaperRegistered: (() => void) | undefined =
    options?.list === undefined
      ? kernel.events.on("wallpaper.registered", () => {
          registryVersion.value++;
        })
      : undefined;
  const stopWallpaperUnregistered: (() => void) | undefined =
    options?.list === undefined
      ? kernel.events.on("wallpaper.unregistered", () => {
          registryVersion.value++;
        })
      : undefined;

  const list = (): readonly Wallpaper[] => builtinListFn();

  const userBlobUrl = ref<{ id: string; url: string } | null>(null);

  function revokeBlobUrl(): void {
    const cached = userBlobUrl.value;
    if (cached && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      try {
        URL.revokeObjectURL(cached.url);
      } catch {}
    }
    userBlobUrl.value = null;
  }

  async function loadUserBlob(id: string): Promise<void> {
    const blob = await wallpaperStore.getBlob(id);
    if (!blob) {
      debugWarn(
        "[useWallpaper]",
        `user-uploaded wallpaper "${id}" missing from IDB (likely evicted) — resetting ${currentShellId()} to first built-in`,
      );
      revokeBlobUrl();
      setActiveWallpaperId(list()[0]!.id);
      return;
    }
    revokeBlobUrl();
    let url: string;
    try {
      url = URL.createObjectURL(blob);
    } catch (error: unknown) {
      debugWarn("[useWallpaper]", "URL.createObjectURL rejected blob", error);
      return;
    }
    userBlobUrl.value = { id, url };
  }

  watch(
    () => activeWallpaperId(),
    (next) => {
      if (wallpaperStore.has(next)) {
        if (userBlobUrl.value?.id === next) {
          return;
        }
        void loadUserBlob(next);
      } else {
        revokeBlobUrl();
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    revokeBlobUrl();
    stopWallpaperRegistered?.();
    stopWallpaperUnregistered?.();
  });

  const current = computed<Wallpaper>(() => {
    void registryVersion.value;

    const builtins = builtinListFn();
    if (builtins.length === 0) {
      throw new Error("useWallpaper: wallpaper registry is empty (invariant violated)");
    }

    const activeId = activeWallpaperId();

    const builtinMatch = builtins.find((w) => w.id === activeId);
    if (builtinMatch) {
      return resolveForShell(builtinMatch);
    }

    if (wallpaperStore.has(activeId)) {
      const cached = userBlobUrl.value;
      if (cached && cached.id === activeId) {
        const meta = wallpaperStore.list().find((entry) => entry.id === activeId);
        return {
          id: activeId,
          name: meta?.name ?? "Custom",
          type: "image",
          value: cached.url,
          userBlobKey: activeId,
        };
      }
      return resolveForShell(builtins[0]!);
    }

    debugWarn(
      "[useWallpaper]",
      `unknown ${currentShellId()} wallpaper id "${activeId}" — falling back to first built-in`,
    );
    return resolveForShell(builtins[0]!);
  });

  return { current, list };
}
