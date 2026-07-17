import { describe, expect, it } from "vitest";
import { defineVaporComponent, markRaw } from "vue";

import type { AppManifest } from "~/types/app";
import type { WidgetManifest } from "~/types/widget";

import {
  createWidgetCatalogItems,
  matchesWidgetCatalogQuery,
  setWidgetVisible,
  widgetDefaultVisible,
  widgetMatchesShellScope,
  widgetProvider,
  widgetShellScopeForSurface,
} from "./catalog";

const StubIcon = markRaw(defineVaporComponent(() => document.createElement("svg")));

function widget(overrides: Partial<WidgetManifest>): WidgetManifest {
  return {
    id: "desktop:clock",
    title: "Clock",
    surface: "desktop:wallpaper",
    size: "md",
    component: () => Promise.resolve({ default: StubIcon }),
    ...overrides,
  };
}

function app(id: string, name = id): AppManifest {
  return {
    id,
    name,
    icon: StubIcon,
    category: "productivity",
    component: () => Promise.resolve({ default: StubIcon }),
  };
}

describe("widget catalog helpers", () => {
  it("treats missing defaultVisible as visible for backward compatibility", () => {
    expect(widgetDefaultVisible(widget({ id: "plugin:legacy" }))).toBe(true);
    expect(widgetDefaultVisible(widget({ id: "calendar:lunar", defaultVisible: false }))).toBe(
      false,
    );
  });

  it("derives System, App, and Plugin providers", () => {
    const apps = [app("calendar", "Calendar"), app("clock", "Clock")];

    expect(widgetProvider(widget({ id: "clock:desktop-big" }), apps)).toEqual({
      kind: "app",
      label: "App: Clock",
      appId: "clock",
    });
    expect(widgetProvider(widget({ id: "desktop:system-meter" }), apps)).toEqual({
      kind: "system",
      label: "System",
    });
    expect(widgetProvider(widget({ id: "calendar:lunar" }), apps)).toEqual({
      kind: "app",
      label: "App: Calendar",
      appId: "calendar",
    });
    expect(widgetProvider(widget({ id: "weather:forecast" }), apps)).toEqual({
      kind: "plugin",
      label: "Plugin",
    });
  });

  it("builds visible catalog items with app icons and searchable metadata", () => {
    const items = createWidgetCatalogItems({
      widgets: [
        widget({
          id: "calendar:lunar",
          title: "Lunar Date",
          description: "Vietnamese lunar date",
          defaultVisible: false,
        }),
      ],
      apps: [app("calendar", "Calendar")],
      isVisible: (_manifest, defaultVisible) => defaultVisible,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "calendar:lunar",
      provider: { kind: "app", label: "App: Calendar", appId: "calendar" },
      visible: false,
      defaultVisible: false,
      sizeLabel: "Medium",
      surfaceLabel: "Desktop",
      description: "Vietnamese lunar date",
      desktopPlaceable: true,
    });
    expect(items[0].icon).toBe(StubIcon);
    expect(matchesWidgetCatalogQuery(items[0], "lunar")).toBe(true);
    expect(matchesWidgetCatalogQuery(items[0], "calendar")).toBe(true);
    expect(matchesWidgetCatalogQuery(items[0], "browser")).toBe(false);
  });

  it("routes visibility writes through the manifest default", () => {
    const writes: Array<[string, boolean, boolean | undefined]> = [];
    setWidgetVisible(
      (id, value, defaultVisible) => {
        writes.push([id, value, defaultVisible]);
      },
      widget({ id: "calendar:lunar", defaultVisible: false }),
      true,
    );

    expect(writes).toEqual([["calendar:lunar", true, false]]);
  });

  it("maps concrete widget surfaces to shell scopes", () => {
    expect(widgetShellScopeForSurface("desktop:wallpaper")).toBe("desktop");
    expect(widgetShellScopeForSurface("desktop:menubar")).toBe("desktop");
    expect(widgetShellScopeForSurface("mobile:widgets")).toBe("mobile");
  });

  it('matches `surface: "any"` against both shell scopes', () => {
    expect(widgetMatchesShellScope(widget({ surface: "any" }), "desktop")).toBe(true);
    expect(widgetMatchesShellScope(widget({ surface: "any" }), "mobile")).toBe(true);
    expect(widgetMatchesShellScope(widget({ surface: "mobile:widgets" }), "desktop")).toBe(false);
  });
});
