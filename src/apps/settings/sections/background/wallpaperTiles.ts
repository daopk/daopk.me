import { computed, onUnmounted, ref, watch, type Ref } from "vue";

import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import { resolveWallpaperValue, type Wallpaper } from "~/core/theme/wallpapers";
import type { useWallpaperStore } from "~/core/wallpaper/WallpaperStore";
import type { Kernel } from "~/types/kernel";
import type { ShellId } from "~/types/shell";
import type { UserWallpaperMeta } from "~/types/wallpaper";

interface BuiltinTile {
  kind: "builtin";
  id: string;
  name: string;
  description: string;
  preview: string;
  previewKind: "gradient" | "image";
}

interface UserTile {
  kind: "user";
  id: string;
  name: string;
  description: string;
  previewUrl: string;
}

export type BackgroundTile = BuiltinTile | UserTile;

type WallpaperStore = ReturnType<typeof useWallpaperStore>;

export function useWallpaperTiles({
  activeIdRef,
  kernel,
  shellId,
  wallpaperStore,
}: {
  readonly activeIdRef: Readonly<Ref<string>>;
  readonly kernel: Kernel;
  readonly shellId: Readonly<Ref<ShellId>>;
  readonly wallpaperStore: WallpaperStore;
}) {
  const { t } = useSettingsI18n();
  const registryVersion = ref(0);
  const stopWallpaperRegistered = kernel.events.on("wallpaper.registered", () => {
    registryVersion.value++;
  });
  const stopWallpaperUnregistered = kernel.events.on("wallpaper.unregistered", () => {
    registryVersion.value++;
  });

  const builtins = computed<readonly Wallpaper[]>(() => {
    void registryVersion.value;
    return kernel.wallpapers.list() as readonly Wallpaper[];
  });
  const userMetas = computed<readonly UserWallpaperMeta[]>(() => wallpaperStore.list());
  const userPreviewUrls = ref<Map<string, string>>(new Map());

  function revokeUserUrl(id: string): void {
    const existing = userPreviewUrls.value.get(id);
    if (existing && typeof URL !== "undefined") {
      try {
        URL.revokeObjectURL(existing);
      } catch {}
    }
    userPreviewUrls.value.delete(id);
  }

  async function ensureUserUrl(id: string): Promise<void> {
    if (userPreviewUrls.value.has(id)) {
      return;
    }
    const blob = await wallpaperStore.getBlob(id);
    if (!blob || typeof URL === "undefined") {
      return;
    }
    let url: string;
    try {
      url = URL.createObjectURL(blob);
    } catch {
      return;
    }
    if (userPreviewUrls.value.has(id)) {
      URL.revokeObjectURL(url);
      return;
    }
    const next = new Map(userPreviewUrls.value);
    next.set(id, url);
    userPreviewUrls.value = next;
  }

  watch(
    userMetas,
    (next) => {
      const liveIds = new Set(next.map((entry) => entry.id));
      for (const id of Array.from(userPreviewUrls.value.keys())) {
        if (!liveIds.has(id)) {
          revokeUserUrl(id);
        }
      }
      for (const meta of next) {
        void ensureUserUrl(meta.id);
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    for (const id of Array.from(userPreviewUrls.value.keys())) {
      revokeUserUrl(id);
    }
    stopWallpaperRegistered();
    stopWallpaperUnregistered();
  });

  const tiles = computed<readonly BackgroundTile[]>(() => {
    const builtinTiles: BuiltinTile[] = builtins.value.map((w) => ({
      kind: "builtin",
      id: w.id,
      name: w.name,
      description: describeBuiltin(w, t),
      preview: resolveWallpaperValue(w, shellId.value),
      previewKind: w.type === "image" ? "image" : "gradient",
    }));

    const userTiles: UserTile[] = userMetas.value.map((meta) => ({
      kind: "user",
      id: meta.id,
      name: meta.name,
      description: `${Math.round(meta.sizeBytes / 1024)} KB · ${meta.mimeType.split("/")[1] ?? meta.mimeType}`,
      previewUrl: userPreviewUrls.value.get(meta.id) ?? "",
    }));

    return [...builtinTiles, ...userTiles];
  });

  const activeTile = computed(() => {
    const id = activeIdRef.value;
    return tiles.value.find((t) => t.id === id) ?? tiles.value[0];
  });

  const activeTileName = computed(
    () => activeTile.value?.name ?? t("settings.background.noWallpaper"),
  );
  const activeTileDescription = computed(
    () => activeTile.value?.description ?? t("settings.background.noWallpaperSelected"),
  );
  const wallpaperCountLabel = computed(() => {
    const count = tiles.value.length;
    return t(count === 1 ? "settings.background.count.one" : "settings.background.count.other", {
      count,
    });
  });

  return {
    activeTile,
    activeTileDescription,
    activeTileName,
    builtins,
    tiles,
    wallpaperCountLabel,
  };
}

export function previewStyleForTile(tile: BackgroundTile): Record<string, string> {
  if (tile.kind === "user") {
    return tile.previewUrl
      ? {
          backgroundImage: `url("${tile.previewUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {};
  }
  if (tile.previewKind === "image") {
    return {
      backgroundImage: `url("${tile.preview}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: tile.preview };
}

function describeBuiltin(w: Wallpaper, t: ReturnType<typeof useSettingsI18n>["t"]): string {
  if (w.preferredTheme === "dark") return t("settings.background.builtin.dark");
  if (w.preferredTheme === "light") return t("settings.background.builtin.light");
  return t("settings.background.builtin.any");
}
