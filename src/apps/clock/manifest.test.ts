import { describe, expect, it } from "vitest";

import { clockManifest } from "./manifest";

describe("clock manifest", () => {
  it("declares the Clock app metadata", () => {
    expect(clockManifest).toMatchObject({
      id: "clock",
      name: "Clock",
      category: "productivity",
      singleton: true,
      permissions: ["storage.write"],
      defaultWindow: { width: 760, height: 560, centered: true },
      keywords: ["clock", "time", "timer", "stopwatch"],
    });
  });

  it("declares app-owned clock widgets with namespaced ids", () => {
    const widgets = clockManifest.widgets ?? [];

    expect(widgets.map((widget) => widget.id)).toEqual([
      "clock:menubar",
      "clock:desktop-big",
      "clock:mobile-big",
    ]);
    expect(widgets.every((widget) => widget.id.startsWith(`${clockManifest.id}:`))).toBe(true);
    expect(widgets.every((widget) => widget.defaultVisible === true)).toBe(true);
    expect(widgets[0]).toMatchObject({
      surface: "desktop:menubar",
      size: "sm",
    });
    expect(widgets[1]).toMatchObject({
      surface: "desktop:wallpaper",
      size: "md",
      defaultPlacement: { anchor: "top-right", insetX: 1, insetY: 1 },
    });
    expect(widgets[2]).toMatchObject({
      surface: "mobile:widgets",
      size: "lg",
    });
  });

  it("keeps widget and app component loaders lazy and resolvable", async () => {
    await expect(clockManifest.component()).resolves.toHaveProperty("default");
    for (const widget of clockManifest.widgets ?? []) {
      await expect(widget.component()).resolves.toHaveProperty("default");
    }
  });
});
