import type { WidgetSize } from "~/types/widget";

export const WIDGET_GRID_PITCH_PX = 24;

export const WIDGET_GRID_GAP_UNITS = 1;

export const WIDGET_GRID_GAP_PX = WIDGET_GRID_GAP_UNITS * WIDGET_GRID_PITCH_PX;

export const WIDGET_SIZE_GRID_UNITS: Record<WidgetSize, { w: number; h: number }> = {
  sm: { w: 4, h: 4 },
  md: { w: 8, h: 4 },
  lg: { w: 8, h: 8 },
};

export function widgetPixelDimensions(size: WidgetSize): { width: number; height: number } {
  const units = WIDGET_SIZE_GRID_UNITS[size];
  return {
    width: units.w * WIDGET_GRID_PITCH_PX,
    height: units.h * WIDGET_GRID_PITCH_PX,
  };
}

export function snapToGrid(pixels: number): number {
  return Math.round(pixels / WIDGET_GRID_PITCH_PX) * WIDGET_GRID_PITCH_PX;
}

export function gridToPixels(units: number): number {
  return units * WIDGET_GRID_PITCH_PX;
}
