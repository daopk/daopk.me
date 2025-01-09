import { describe, expect, it } from "vitest";

import { clampWindowPosition, MIN_VISIBLE_X } from "./windowGeometry";

const STAGE = { stageWidth: 1024, stageHeight: 768, titlebarHeight: 28 };

describe("clampWindowPosition", () => {
  it("does nothing when the stage has not measured yet (stage 0)", () => {
    expect(
      clampWindowPosition(-500, -200, {
        stageWidth: 0,
        stageHeight: 0,
        windowWidth: 320,
        titlebarHeight: 28,
      }),
    ).toEqual({ x: -500, y: -200 });
  });

  it("clamps the right edge so MIN_VISIBLE_X of titlebar stays visible", () => {
    const result = clampWindowPosition(9999, 100, { ...STAGE, windowWidth: 480 });

    expect(result.x).toBe(STAGE.stageWidth - MIN_VISIBLE_X);
  });

  it("ALLOWS the left edge to slide off-stage as long as MIN_VISIBLE_X is visible on the right", () => {
    const result = clampWindowPosition(-9999, 100, { ...STAGE, windowWidth: 480 });

    expect(result.x).toBe(MIN_VISIBLE_X - 480);
    expect(result.x + 480).toBe(MIN_VISIBLE_X);
  });

  it("symmetric clamp: left wall offset equals right wall offset (mirrored)", () => {
    const winW = 320;
    const left = clampWindowPosition(-9999, 0, { ...STAGE, windowWidth: winW });
    const right = clampWindowPosition(9999, 0, { ...STAGE, windowWidth: winW });

    expect(STAGE.stageWidth - right.x).toBe(MIN_VISIBLE_X);
    expect(left.x + winW).toBe(MIN_VISIBLE_X);
  });

  it("for windows narrower than MIN_VISIBLE_X the left wall still locks at 0", () => {
    const result = clampWindowPosition(-999, 0, { ...STAGE, windowWidth: 40 });

    expect(result.x).toBe(0);
  });

  it("clamps Y to the stage's titlebar-visible band", () => {
    expect(clampWindowPosition(0, -50, { ...STAGE, windowWidth: 320 }).y).toBe(0);
    expect(clampWindowPosition(0, 9999, { ...STAGE, windowWidth: 320 }).y).toBe(
      STAGE.stageHeight - STAGE.titlebarHeight,
    );
  });

  it("passes through valid positions unchanged", () => {
    const result = clampWindowPosition(120, 80, { ...STAGE, windowWidth: 320 });

    expect(result).toEqual({ x: 120, y: 80 });
  });

  it("guards against `stageWidth - MIN_VISIBLE_X < 0` (degenerate stage)", () => {
    const result = clampWindowPosition(50, 0, {
      stageWidth: 40,
      stageHeight: 768,
      windowWidth: 320,
      titlebarHeight: 28,
    });

    expect(result.x).toBe(0);
  });
});
