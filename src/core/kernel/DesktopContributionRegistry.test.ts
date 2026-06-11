import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import {
  DesktopContextMenuRegistry,
  DesktopRendererRegistry,
} from "~/core/kernel/DesktopContributionRegistry";

describe("DesktopContributionRegistry", () => {
  it("lists context menu items by surface and stable order", () => {
    const registry = new DesktopContextMenuRegistry();
    const action = vi.fn(async () => vi.fn());

    registry.register({
      id: "notes:late",
      label: "Late",
      surface: "desktop:background",
      order: 20,
      action,
    });
    registry.register({
      id: "notes:first",
      label: "First",
      surface: "desktop:background",
      order: 1,
      action,
    });

    expect(registry.list({ surface: "desktop:background" }).map((item) => item.id)).toEqual([
      "notes:first",
      "notes:late",
    ]);
  });

  it("only disposer-removes the same context menu manifest instance", () => {
    const registry = new DesktopContextMenuRegistry();
    const action = vi.fn(async () => vi.fn());
    const first = {
      id: "notes:item",
      label: "First",
      surface: "desktop:background" as const,
      action,
    };
    const second = {
      id: "notes:item",
      label: "Second",
      surface: "desktop:background" as const,
      action,
    };

    const disposeFirst = registry.register(first);
    registry.register(second);
    disposeFirst();

    expect(registry.get("notes:item")).toBe(second);
  });

  it("lists desktop renderers by surface and order", () => {
    const registry = new DesktopRendererRegistry();
    const component = () =>
      Promise.resolve({ default: defineComponent({ name: "Renderer", render: () => null }) });

    registry.register({
      id: "notes:renderer-b",
      surface: "desktop:wallpaper",
      order: 10,
      component,
    });
    registry.register({
      id: "notes:renderer-a",
      surface: "desktop:wallpaper",
      order: 0,
      component,
    });

    expect(registry.list({ surface: "desktop:wallpaper" }).map((renderer) => renderer.id)).toEqual([
      "notes:renderer-a",
      "notes:renderer-b",
    ]);
  });
});
