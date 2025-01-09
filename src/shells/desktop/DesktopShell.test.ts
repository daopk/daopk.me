import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import DesktopShell from "./DesktopShell.vue";

describe("DesktopShell template structure (M3.7 follow-up)", () => {
  function mountShell() {
    return mount(DesktopShell, {
      global: {
        stubs: {
          Wallpaper: { template: '<div data-shell-child="wallpaper" />' },
          MenuBar: { template: '<div data-shell-child="menubar" />' },
          Dock: { template: '<div data-shell-child="dock" />' },
          DesktopContextMenuLayer: { template: '<div data-shell-child="context-menu" />' },
          DesktopWidgetLayer: { template: '<div data-shell-child="widget-layer" />' },
          DesktopWidgetGallery: { template: '<div data-shell-child="widget-gallery" />' },
          WindowHost: { template: '<div data-shell-child="window-host" />' },
          SpotlightHost: { template: '<div data-shell-child="spotlight" />' },
          PermissionPromptHost: { template: '<div data-shell-child="permission-prompt" />' },
        },
      },
    });
  }

  it("renders DesktopWidgetLayer as a descendant of .desktop-stage", () => {
    const wrapper = mountShell();

    const stage = wrapper.find("main.desktop-stage");
    expect(stage.exists()).toBe(true);

    const widgetLayer = stage.find('[data-shell-child="widget-layer"]');
    expect(widgetLayer.exists()).toBe(true);
  });

  it("renders DesktopWidgetLayer BEFORE WindowHost inside .desktop-stage", () => {
    const wrapper = mountShell();

    const stage = wrapper.find("main.desktop-stage");
    const stageChildren = Array.from(stage.element.children) as HTMLElement[];

    const layerIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "widget-layer");
    const windowHostIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "window-host");

    expect(layerIdx).toBeGreaterThanOrEqual(0);
    expect(windowHostIdx).toBeGreaterThanOrEqual(0);
    expect(layerIdx).toBeLessThan(windowHostIdx);
  });

  it("renders the desktop context-menu layer before widgets and windows", () => {
    const wrapper = mountShell();

    const stage = wrapper.find("main.desktop-stage");
    const stageChildren = Array.from(stage.element.children) as HTMLElement[];

    const contextIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "context-menu");
    const layerIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "widget-layer");
    const windowHostIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "window-host");

    expect(contextIdx).toBeGreaterThanOrEqual(0);
    expect(contextIdx).toBeLessThan(layerIdx);
    expect(contextIdx).toBeLessThan(windowHostIdx);
  });

  it("does NOT render DesktopWidgetLayer as a direct sibling of .desktop-stage", () => {
    const wrapper = mountShell();

    const shell = wrapper.find(".desktop-shell");
    const directChildren = Array.from(shell.element.children) as HTMLElement[];

    const widgetLayerAsSibling = directChildren.find(
      (el) => el.dataset.shellChild === "widget-layer",
    );
    expect(widgetLayerAsSibling).toBeUndefined();
  });
});
