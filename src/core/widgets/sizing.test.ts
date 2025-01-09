import { describe, expect, it } from "vitest";

import {
  WIDGET_GRID_PITCH_PX,
  WIDGET_SIZE_GRID_UNITS,
  gridToPixels,
  snapToGrid,
  widgetPixelDimensions,
} from "./sizing";

describe("widget sizing constants (M3.7)", () => {
  describe("WIDGET_GRID_PITCH_PX", () => {
    it("is 24 — the canonical grid pitch the CSS variable mirrors", () => {
      expect(WIDGET_GRID_PITCH_PX).toBe(24);
    });
  });

  describe("WIDGET_SIZE_GRID_UNITS", () => {
    it("maps every WidgetSize variant", () => {
      expect(WIDGET_SIZE_GRID_UNITS.sm).toEqual({ w: 4, h: 4 });
      expect(WIDGET_SIZE_GRID_UNITS.md).toEqual({ w: 8, h: 4 });
      expect(WIDGET_SIZE_GRID_UNITS.lg).toEqual({ w: 8, h: 8 });
    });
  });

  describe("widgetPixelDimensions", () => {
    it("multiplies the grid units by the pitch for each size", () => {
      expect(widgetPixelDimensions("sm")).toEqual({ width: 96, height: 96 });
      expect(widgetPixelDimensions("md")).toEqual({ width: 192, height: 96 });
      expect(widgetPixelDimensions("lg")).toEqual({ width: 192, height: 192 });
    });

    it("returns a fresh object per call (no aliasing across consumers)", () => {
      const a = widgetPixelDimensions("sm");
      const b = widgetPixelDimensions("sm");
      expect(a).not.toBe(b);
      a.width = 999;
      expect(b.width).toBe(96);
    });
  });

  describe("snapToGrid", () => {
    it("rounds to the nearest grid line", () => {
      expect(snapToGrid(0)).toBe(0);
      expect(snapToGrid(11)).toBe(0); // < pitch/2 rounds down
      expect(snapToGrid(12)).toBe(24); // exactly pitch/2 rounds up (Math.round half-to-even/up)
      expect(snapToGrid(23)).toBe(24);
      expect(snapToGrid(24)).toBe(24);
      expect(snapToGrid(35)).toBe(24);
      expect(snapToGrid(36)).toBe(48);
    });

    it("handles negative coordinates (e.g. dragging past origin)", () => {
      expect(snapToGrid(-11)).toBe(-0); // Math.round semantics — display as 0
      expect(snapToGrid(-13)).toBe(-24);
      expect(snapToGrid(-24)).toBe(-24);
    });
  });

  describe("gridToPixels", () => {
    it("multiplies grid units by the pitch", () => {
      expect(gridToPixels(0)).toBe(0);
      expect(gridToPixels(1)).toBe(24);
      expect(gridToPixels(4)).toBe(96);
      expect(gridToPixels(-2)).toBe(-48);
    });
  });
});
