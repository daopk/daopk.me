import { computed, type ComputedRef } from "vue";

import { useKernel } from "~/composables/useKernel";
import { debugLog } from "~/core/debug";
import { TrashAppIcon as TrashIcon } from "~/icons/fluentColor";
import { Search as SearchIcon } from "~/icons/lucide";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";
import type { AppManifest } from "~/types/app";

import { useWindowManager } from "~/shells/desktop/windowManager/useWindowManager";
import {
  type AppDockItem,
  type DockDropPlacement,
  SPOTLIGHT_DOCK_ITEM_KEY,
  type DockItemModel,
  type SystemDockItem,
  TRASH_DOCK_ITEM_KEY,
} from "./types";

export function useDock(): {
  items: ComputedRef<readonly DockItemModel[]>;
  launch: (item: DockItemModel) => void;
  keepInDock: (item: DockItemModel) => void;
  removeFromDock: (item: DockItemModel) => void;
  canDragPinnedApp: (item: DockItemModel) => boolean;
  canReorderPinnedApp: (item: DockItemModel) => boolean;
  canMovePinnedApp: (item: DockItemModel, direction: "left" | "right") => boolean;
  movePinnedApp: (item: DockItemModel, direction: "left" | "right") => void;
  reorderPinnedApp: (
    sourceManifestId: string,
    targetManifestId: string,
    placement: DockDropPlacement,
  ) => void;
  hasRunning: (item: DockItemModel) => boolean;
  hasAttention: (item: DockItemModel) => boolean;
} {
  const kernel = useKernel();
  const windowManager = useWindowManager();
  const pinnedAppIds = kernel.settings.use("dockPinnedAppIds");
  const visibleAppManifests = (): AppManifest[] =>
    kernel.apps.list().filter((manifest) => manifest.hidden !== true);
  const visiblePinnedAppIds = computed((): readonly string[] => {
    const manifestIds = new Set(visibleAppManifests().map((manifest) => manifest.id));

    return pinnedAppIds.value.filter((manifestId) => manifestIds.has(manifestId));
  });

  const items = computed((): readonly DockItemModel[] => {
    const manifests = visibleAppManifests();
    const manifestsById = new Map(manifests.map((manifest) => [manifest.id, manifest]));
    const pinnedIds = pinnedAppIds.value;
    const pinnedSet = new Set(pinnedIds);
    const dockItems: AppDockItem[] = [];

    for (const manifestId of pinnedIds) {
      const manifest = manifestsById.get(manifestId);

      if (manifest) {
        dockItems.push(toAppDockItem(manifest, true));
      }
    }

    for (const manifest of manifests) {
      if (pinnedSet.has(manifest.id) || !windowManager.hasWindowsForManifest(manifest.id)) {
        continue;
      }

      dockItems.push(toAppDockItem(manifest, false));
    }

    return withSystemItems(dockItems);
  });

  const launch = (item: DockItemModel): void => {
    if (item.kind === "system") {
      if (item.action === "spotlight") {
        kernel.events.emit("spotlight.open.requested", { source: "dock" });
      } else {
        kernel.events.emit("app.launch.requested", { manifestId: "trash", source: "dock" });
      }

      debugLog("[dock] launch", item.action);
      return;
    }

    kernel.events.emit("app.launch.requested", { manifestId: item.manifestId, source: "dock" });

    debugLog("[dock] launch", item.manifestId);
  };

  const keepInDock = (item: DockItemModel): void => {
    if (item.kind === "system" || item.pinned) {
      return;
    }

    kernel.settings.set("dockPinnedAppIds", [...pinnedAppIds.value, item.manifestId]);
  };

  const removeFromDock = (item: DockItemModel): void => {
    if (item.kind === "system" || !item.pinned) {
      return;
    }

    kernel.settings.set(
      "dockPinnedAppIds",
      pinnedAppIds.value.filter((manifestId) => manifestId !== item.manifestId),
    );
  };

  const canDragPinnedApp = (item: DockItemModel): boolean => item.kind === "app" && item.pinned;

  const canReorderPinnedApp = (item: DockItemModel): boolean =>
    canDragPinnedApp(item) && visiblePinnedAppIds.value.length > 1;

  const pinnedAppIndex = (item: DockItemModel): number =>
    item.kind === "app" && item.pinned ? visiblePinnedAppIds.value.indexOf(item.manifestId) : -1;

  const canMovePinnedApp = (item: DockItemModel, direction: "left" | "right"): boolean => {
    const index = pinnedAppIndex(item);

    if (index === -1) {
      return false;
    }

    return direction === "left" ? index > 0 : index < visiblePinnedAppIds.value.length - 1;
  };

  const reorderPinnedApp = (
    sourceManifestId: string,
    targetManifestId: string,
    placement: DockDropPlacement,
  ): void => {
    const current = pinnedAppIds.value;

    if (sourceManifestId === targetManifestId) {
      return;
    }

    if (!current.includes(sourceManifestId) || !current.includes(targetManifestId)) {
      return;
    }

    const next = current.filter((manifestId) => manifestId !== sourceManifestId);
    const targetIndex = next.indexOf(targetManifestId);

    if (targetIndex === -1) {
      return;
    }

    next.splice(targetIndex + (placement === "after" ? 1 : 0), 0, sourceManifestId);

    if (stringArraysEqual(current, next)) {
      return;
    }

    kernel.settings.set("dockPinnedAppIds", next);
  };

  const movePinnedApp = (item: DockItemModel, direction: "left" | "right"): void => {
    if (item.kind !== "app") {
      return;
    }

    const index = pinnedAppIndex(item);
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    const targetManifestId = visiblePinnedAppIds.value[targetIndex];

    if (index === -1 || targetManifestId === undefined) {
      return;
    }

    reorderPinnedApp(item.manifestId, targetManifestId, direction === "left" ? "before" : "after");
  };

  const hasRunning = (item: DockItemModel): boolean =>
    item.kind === "app" && windowManager.hasWindowsForManifest(item.manifestId);

  const hasAttention = (item: DockItemModel): boolean =>
    item.kind === "app" &&
    item.manifestId === "settings" &&
    serviceWorkerUpdateController.hasSettingsAttention.value;

  return {
    items,
    launch,
    keepInDock,
    removeFromDock,
    canDragPinnedApp,
    canReorderPinnedApp,
    canMovePinnedApp,
    movePinnedApp,
    reorderPinnedApp,
    hasRunning,
    hasAttention,
  };
}

const spotlightDockItem: SystemDockItem = {
  key: SPOTLIGHT_DOCK_ITEM_KEY,
  kind: "system",
  action: "spotlight",
  name: "Spotlight",
  icon: SearchIcon,
};

const trashDockItem: SystemDockItem = {
  key: TRASH_DOCK_ITEM_KEY,
  kind: "system",
  action: "trash",
  name: "Trash",
  icon: TrashIcon,
};

function toAppDockItem(manifest: AppManifest, pinned: boolean): AppDockItem {
  return {
    key: `app:${manifest.id}`,
    kind: "app",
    manifestId: manifest.id,
    name: manifest.name,
    icon: manifest.icon,
    singleton: manifest.singleton === true,
    pinned,
  };
}

function withSystemItems(items: readonly AppDockItem[]): readonly DockItemModel[] {
  return [spotlightDockItem, ...items, trashDockItem];
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
