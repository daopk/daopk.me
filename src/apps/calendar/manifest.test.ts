import { describe, expect, it } from "vitest";

import { calendarManifest } from "./manifest";

describe("calendar manifest widgets", () => {
  it("declares namespaced lunar date widgets for mobile and desktop", () => {
    const widgets = calendarManifest.widgets ?? [];

    expect(widgets.map((widget) => widget.id)).toEqual([
      "calendar:lunar-date-mobile",
      "calendar:lunar-date-desktop",
    ]);
    expect(widgets.every((widget) => widget.id.startsWith(`${calendarManifest.id}:`))).toBe(true);
    expect(widgets[0]).toMatchObject({
      title: "Lunar Date",
      surface: "mobile:widgets",
      size: "md",
    });
    expect(widgets[1]).toMatchObject({
      title: "Lunar Date",
      surface: "desktop:wallpaper",
      size: "md",
      priority: 80,
    });
  });

  it("keeps widget component loaders lazy and resolvable", async () => {
    const widgets = calendarManifest.widgets ?? [];

    await expect(widgets[0]?.component()).resolves.toHaveProperty("default");
    await expect(widgets[1]?.component()).resolves.toHaveProperty("default");
  });
});
