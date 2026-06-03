import {
  autoPlace,
  resolveNearestFreeWidgetPlacement,
  type WidgetGridRect,
  type WidgetPlacement,
} from "~/core/widgets/WidgetPlacementStore";
import { widgetDefaultVisible, widgetMatchesSurface } from "~/core/widgets/catalog";
import {
  snapToGrid,
  WIDGET_GRID_PITCH_PX,
  WIDGET_SIZE_GRID_UNITS,
  widgetPixelDimensions,
} from "~/core/widgets/sizing";
import type { WidgetManifest } from "~/types/widget";

export interface DesktopWidgetViewportSize {
  width: number;
  height: number;
}

export interface DesktopWidgetPointer {
  clientX: number;
  clientY: number;
}

export interface DesktopWidgetPointerPlacementTarget {
  placement: WidgetPlacement;
  stageRect: DOMRect;
}

export interface UseDesktopWidgetPlacementOptions {
  getWidgets: () => readonly WidgetManifest[];
  getPlacement: (id: string) => WidgetPlacement | undefined;
  isEnabled: (id: string, defaultVisible: boolean) => boolean;
}

export interface ResolveDesktopWidgetPlacementOptions {
  excludeId?: string;
  occupiedPlacements?: Readonly<Record<string, WidgetPlacement>>;
}

interface DesktopWidgetViewportGrid {
  columns: number;
  rows: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function gridInsetUnits(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function viewportGrid(viewport: DesktopWidgetViewportSize): DesktopWidgetViewportGrid {
  return {
    columns: Math.floor(viewport.width / WIDGET_GRID_PITCH_PX),
    rows: Math.floor(viewport.height / WIDGET_GRID_PITCH_PX),
  };
}

function resolveDefaultPlacement(
  manifest: WidgetManifest,
  dims: { w: number; h: number },
  viewportColumns: number,
): WidgetPlacement | undefined {
  const placement = manifest.defaultPlacement;
  if (placement === undefined) return undefined;

  if ("anchor" in placement) {
    if (placement.anchor === "top-right") {
      return {
        gridX: viewportColumns - dims.w - gridInsetUnits(placement.insetX),
        gridY: gridInsetUnits(placement.insetY),
      };
    }
  }

  if ("gridX" in placement) {
    return { gridX: placement.gridX, gridY: placement.gridY };
  }

  return undefined;
}

function clampPlacement(
  placement: WidgetPlacement,
  dims: { w: number; h: number },
  viewport: DesktopWidgetViewportGrid,
): WidgetPlacement {
  return {
    gridX: Math.max(0, Math.min(placement.gridX, viewport.columns - dims.w)),
    gridY: Math.max(0, Math.min(placement.gridY, viewport.rows - dims.h)),
  };
}

function placementRect(manifest: WidgetManifest, placement: WidgetPlacement): WidgetGridRect {
  const dims = WIDGET_SIZE_GRID_UNITS[manifest.size];
  return { x: placement.gridX, y: placement.gridY, w: dims.w, h: dims.h };
}

function resolveReadPlacement(
  manifest: WidgetManifest,
  requested: WidgetPlacement,
  occupied: readonly WidgetGridRect[],
  viewport: DesktopWidgetViewportGrid,
): WidgetPlacement {
  const dims = WIDGET_SIZE_GRID_UNITS[manifest.size];
  return (
    resolveNearestFreeWidgetPlacement(
      manifest.size,
      requested,
      occupied,
      viewport.columns,
      viewport.rows,
    ) ?? clampPlacement(requested, dims, viewport)
  );
}

function resolveDropPlacement(
  manifest: WidgetManifest,
  requested: WidgetPlacement,
  occupied: readonly WidgetGridRect[],
  viewport: DesktopWidgetViewportGrid,
): WidgetPlacement | undefined {
  return resolveNearestFreeWidgetPlacement(
    manifest.size,
    requested,
    occupied,
    viewport.columns,
    viewport.rows,
  );
}

export function useDesktopWidgetPlacementResolver(options: UseDesktopWidgetPlacementOptions): {
  resolveEffectivePlacements: (
    viewport: DesktopWidgetViewportSize,
    options?: { excludeId?: string },
  ) => Record<string, WidgetPlacement>;
  resolveGridPlacement: (
    manifest: WidgetManifest,
    requested: WidgetPlacement,
    viewport: DesktopWidgetViewportSize,
    options?: ResolveDesktopWidgetPlacementOptions,
  ) => WidgetPlacement | undefined;
  resolvePointerPlacement: (
    manifest: WidgetManifest,
    pointer: DesktopWidgetPointer,
    stageRect: DOMRect,
    options?: ResolveDesktopWidgetPlacementOptions,
  ) => DesktopWidgetPointerPlacementTarget | null;
} {
  function desktopWidgets(excludeId?: string): readonly WidgetManifest[] {
    return options.getWidgets().filter((manifest) => {
      if (manifest.id === excludeId) return false;
      if (!widgetMatchesSurface(manifest, "desktop:wallpaper")) return false;
      return options.isEnabled(manifest.id, widgetDefaultVisible(manifest));
    });
  }

  function resolveEffectivePlacements(
    viewportSize: DesktopWidgetViewportSize,
    resolverOptions: { excludeId?: string } = {},
  ): Record<string, WidgetPlacement> {
    const out: Record<string, WidgetPlacement> = {};
    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return out;
    }

    const grid = viewportGrid(viewportSize);
    const occupied: WidgetGridRect[] = [];

    for (const manifest of desktopWidgets(resolverOptions.excludeId)) {
      const dims = WIDGET_SIZE_GRID_UNITS[manifest.size];
      const requested =
        options.getPlacement(manifest.id) ??
        resolveDefaultPlacement(manifest, dims, grid.columns) ??
        autoPlace(manifest.size, occupied, grid.columns, grid.rows);
      const resolved = resolveReadPlacement(manifest, requested, occupied, grid);

      out[manifest.id] = resolved;
      occupied.push(placementRect(manifest, resolved));
    }

    return out;
  }

  function occupiedRectsFromPlacements(
    placements: Readonly<Record<string, WidgetPlacement>>,
    excludeId?: string,
  ): WidgetGridRect[] {
    return desktopWidgets(excludeId)
      .map((manifest) => {
        const placement = placements[manifest.id];
        return placement === undefined ? undefined : placementRect(manifest, placement);
      })
      .filter((rect): rect is WidgetGridRect => rect !== undefined);
  }

  function resolveGridPlacement(
    manifest: WidgetManifest,
    requested: WidgetPlacement,
    viewportSize: DesktopWidgetViewportSize,
    resolverOptions: ResolveDesktopWidgetPlacementOptions = {},
  ): WidgetPlacement | undefined {
    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return undefined;
    }

    const occupiedPlacements =
      resolverOptions.occupiedPlacements ??
      resolveEffectivePlacements(viewportSize, { excludeId: resolverOptions.excludeId });
    const occupied = occupiedRectsFromPlacements(occupiedPlacements, resolverOptions.excludeId);

    return resolveDropPlacement(manifest, requested, occupied, viewportGrid(viewportSize));
  }

  function resolvePointerPlacement(
    manifest: WidgetManifest,
    pointer: DesktopWidgetPointer,
    stageRect: DOMRect,
    resolverOptions: ResolveDesktopWidgetPlacementOptions = {},
  ): DesktopWidgetPointerPlacementTarget | null {
    if (
      pointer.clientX < stageRect.left ||
      pointer.clientX > stageRect.right ||
      pointer.clientY < stageRect.top ||
      pointer.clientY > stageRect.bottom
    ) {
      return null;
    }

    const size = widgetPixelDimensions(manifest.size);
    const rawX = pointer.clientX - stageRect.left - size.width / 2;
    const rawY = pointer.clientY - stageRect.top - size.height / 2;
    const snappedX = snapToGrid(clamp(rawX, 0, stageRect.width - size.width));
    const snappedY = snapToGrid(clamp(rawY, 0, stageRect.height - size.height));
    const requested = {
      gridX: Math.round(snappedX / WIDGET_GRID_PITCH_PX),
      gridY: Math.round(snappedY / WIDGET_GRID_PITCH_PX),
    };
    const placement = resolveGridPlacement(
      manifest,
      requested,
      { width: stageRect.width, height: stageRect.height },
      resolverOptions,
    );

    return placement === undefined ? null : { placement, stageRect };
  }

  return {
    resolveEffectivePlacements,
    resolveGridPlacement,
    resolvePointerPlacement,
  };
}
