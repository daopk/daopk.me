import type { VaporComponent } from "vue";

export const SPOTLIGHT_DOCK_ITEM_KEY = "system:spotlight";
export const TRASH_DOCK_ITEM_KEY = "system:trash";

export type SystemDockAction = "spotlight" | "trash";

export type DockDropPlacement = "before" | "after";

export interface AppDockItem {
  key: `app:${string}`;
  kind: "app";
  manifestId: string;
  name: string;
  icon: VaporComponent;
  singleton: boolean;
  pinned: boolean;
}

export interface SystemDockItem {
  key: typeof SPOTLIGHT_DOCK_ITEM_KEY | typeof TRASH_DOCK_ITEM_KEY;
  kind: "system";
  action: SystemDockAction;
  name: string;
  icon: VaporComponent;
}

export type DockItemModel = AppDockItem | SystemDockItem;
