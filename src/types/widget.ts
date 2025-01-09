import type { Component } from "vue";

export type WidgetSurface = "desktop:menubar" | "desktop:wallpaper" | "mobile:widgets" | "any";

export type WidgetShellScope = "desktop" | "mobile";

export type WidgetSize = "sm" | "md" | "lg";

export type WidgetDefaultPlacement =
  | { gridX: number; gridY: number }
  | { anchor: "top-right"; insetX?: number; insetY?: number };

export interface WidgetManifest {
  id: string;
  title: string;
  description?: string;
  icon?: Component;
  surface: WidgetSurface;
  size: WidgetSize;
  defaultVisible?: boolean;
  priority?: number;
  component: () => Promise<{ default: Component }>;
  defaultPlacement?: WidgetDefaultPlacement;
}

export interface WidgetListFilter {
  /**
   * Concrete surface to filter for. A widget's `surface` value matches
   * either when `manifest.surface === filter.surface` OR when
   * `manifest.surface === "any"`. `"any"` is intentionally NOT a
   * valid filter value — hosts always pass their own concrete slot.
   */
  surface?: Exclude<WidgetSurface, "any">;
}

export interface KernelWidgetsFacade {
  register(manifest: WidgetManifest): () => void;
  unregister(id: string): void;
  list(filter?: WidgetListFilter): readonly WidgetManifest[];
  get(id: string): WidgetManifest | undefined;
}
