import type { Component } from "vue";

import type { AppHandle } from "~/types/app";
import type { Kernel } from "~/types/kernel";

export type DesktopContextMenuSurface = "desktop:background";
export type DesktopRendererSurface = "desktop:wallpaper";

export interface DesktopPoint {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

export interface DesktopContextMenuActionContext {
  kernel: Kernel;
  manifestId: string;
  handle: AppHandle;
  position: DesktopPoint;
  signal: AbortSignal;
}

export type DesktopContextMenuAction = (
  context: DesktopContextMenuActionContext,
) => void | Promise<void>;

export interface DesktopContextMenuItemManifest {
  id: string;
  label: string;
  manifestId?: string;
  surface: DesktopContextMenuSurface;
  group?: string;
  order?: number;
  action: () => Promise<DesktopContextMenuAction>;
}

export interface DesktopRendererComponentProps {
  stageSize: {
    width: number;
    height: number;
  };
}

export interface DesktopRendererManifest {
  id: string;
  manifestId?: string;
  surface: DesktopRendererSurface;
  order?: number;
  component: () => Promise<{ default: Component }>;
}

export interface AppDesktopManifest {
  contextMenu?: readonly DesktopContextMenuItemManifest[];
  renderers?: readonly DesktopRendererManifest[];
}

export interface DesktopContextMenuListFilter {
  surface?: DesktopContextMenuSurface;
}

export interface DesktopRendererListFilter {
  surface?: DesktopRendererSurface;
}

export interface KernelDesktopContextMenuFacade {
  register(item: DesktopContextMenuItemManifest): () => void;
  unregister(id: string): void;
  list(filter?: DesktopContextMenuListFilter): readonly DesktopContextMenuItemManifest[];
  get(id: string): DesktopContextMenuItemManifest | undefined;
}

export interface KernelDesktopRenderersFacade {
  register(renderer: DesktopRendererManifest): () => void;
  unregister(id: string): void;
  list(filter?: DesktopRendererListFilter): readonly DesktopRendererManifest[];
  get(id: string): DesktopRendererManifest | undefined;
}

export interface KernelDesktopFacade {
  contextMenu: KernelDesktopContextMenuFacade;
  renderers: KernelDesktopRenderersFacade;
}
