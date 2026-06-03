import { describe, expect, it } from "vitest";

import type { WidgetPlacement } from "~/core/widgets/WidgetPlacementStore";
import type { WidgetManifest } from "~/types/widget";

import { useDesktopWidgetPlacementResolver } from "./useDesktopWidgetPlacement";

function makeManifest(overrides: Partial<WidgetManifest> = {}): WidgetManifest {
  return {
    id: overrides.id ?? "test:widget",
    title: "Test Widget",
    surface: "desktop:wallpaper",
    size: "sm",
    component: () => Promise.resolve({ default: { render: () => null } }),
    ...overrides,
  };
}

function makeRect(
  rect: { left?: number; top?: number; width?: number; height?: number } = {},
): DOMRect {
  const left = rect.left ?? 0;
  const top = rect.top ?? 28;
  const width = rect.width ?? 1920;
  const height = rect.height ?? 1052;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeResolver({
  widgets,
  placements = {},
  enabled = {},
}: {
  widgets: readonly WidgetManifest[];
  placements?: Readonly<Record<string, WidgetPlacement>>;
  enabled?: Readonly<Record<string, boolean>>;
}) {
  return useDesktopWidgetPlacementResolver({
    getWidgets: () => widgets,
    getPlacement: (id) => placements[id],
    isEnabled: (id, defaultVisible) => enabled[id] ?? defaultVisible,
  });
}

describe("useDesktopWidgetPlacementResolver", () => {
  it("resolves persisted, anchored default, and clamped read-side placements", () => {
    const widgets = [
      makeManifest({
        id: "wp:anchored",
        size: "md",
        defaultPlacement: { anchor: "top-right", insetX: 1, insetY: 1 },
      }),
      makeManifest({
        id: "wp:persisted",
        defaultPlacement: { gridX: 4, gridY: 4 },
      }),
      makeManifest({
        id: "wp:clamped",
        defaultPlacement: { gridX: 999, gridY: 999 },
      }),
    ];
    const resolver = makeResolver({
      widgets,
      placements: { "wp:persisted": { gridX: 1, gridY: 2 } },
    });

    const placements = resolver.resolveEffectivePlacements({ width: 1512, height: 900 });

    expect(placements["wp:anchored"]).toEqual({ gridX: 54, gridY: 1 });
    expect(placements["wp:persisted"]).toEqual({ gridX: 1, gridY: 2 });
    expect(placements["wp:clamped"]).toEqual({ gridX: 59, gridY: 33 });
  });

  it("excludes disabled and explicitly excluded widgets from occupied rects", () => {
    const dragged = makeManifest({ id: "wp:dragged" });
    const widgets = [
      makeManifest({ id: "wp:occupied", defaultPlacement: { gridX: 0, gridY: 0 } }),
      makeManifest({ id: "wp:disabled", defaultPlacement: { gridX: 5, gridY: 0 } }),
      dragged,
    ];
    const resolver = makeResolver({
      widgets,
      enabled: { "wp:disabled": false },
    });

    const placement = resolver.resolveGridPlacement(
      dragged,
      { gridX: 0, gridY: 0 },
      {
        width: 1920,
        height: 1080,
      },
      { excludeId: dragged.id },
    );

    expect(placement).toEqual({ gridX: 5, gridY: 0 });
  });

  it("uses the supplied effective placements when resolving a slot drop", () => {
    const dragged = makeManifest({ id: "wp:dragged" });
    const widgets = [
      makeManifest({ id: "wp:occupied", defaultPlacement: { gridX: 0, gridY: 0 } }),
      dragged,
    ];
    const resolver = makeResolver({ widgets });

    const placement = resolver.resolveGridPlacement(
      dragged,
      { gridX: 0, gridY: 0 },
      { width: 1920, height: 1080 },
      {
        excludeId: dragged.id,
        occupiedPlacements: {
          "wp:occupied": { gridX: 0, gridY: 0 },
          "wp:dragged": { gridX: 10, gridY: 0 },
        },
      },
    );

    expect(placement).toEqual({ gridX: 5, gridY: 0 });
  });

  it("resolves pointer drops against the desktop stage and nearest free slot", () => {
    const dragged = makeManifest({ id: "calendar-gallery:lunar", size: "md" });
    const widgets = [
      makeManifest({
        id: "desktop:occupied",
        size: "md",
        defaultPlacement: { gridX: 21, gridY: 6 },
      }),
      dragged,
    ];
    const resolver = makeResolver({ widgets, enabled: { [dragged.id]: false } });

    const target = resolver.resolvePointerPlacement(
      dragged,
      { clientX: 600, clientY: 220 },
      makeRect(),
      { excludeId: dragged.id },
    );

    expect(target?.placement).toEqual({ gridX: 21, gridY: 1 });
  });

  it("returns null for outside-stage and no-legal-slot pointer drops", () => {
    const dragged = makeManifest({ id: "calendar-gallery:lunar", size: "md" });
    const widgets = [
      makeManifest({
        id: "desktop:occupied",
        size: "md",
        defaultPlacement: { gridX: 0, gridY: 0 },
      }),
      dragged,
    ];
    const resolver = makeResolver({ widgets, enabled: { [dragged.id]: false } });

    expect(
      resolver.resolvePointerPlacement(
        dragged,
        { clientX: -1, clientY: 60 },
        makeRect({ width: 192, height: 96 }),
        { excludeId: dragged.id },
      ),
    ).toBeNull();
    expect(
      resolver.resolvePointerPlacement(
        dragged,
        { clientX: 90, clientY: 60 },
        makeRect({ width: 192, height: 96 }),
        { excludeId: dragged.id },
      ),
    ).toBeNull();
  });
});
