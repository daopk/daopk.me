import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it, vi } from "vitest";

import DesktopShell from "./DesktopShell.vue";

async function vaporShellChild(name: string) {
  const { defineVaporComponent } = await import("vue");
  return {
    default: defineVaporComponent(() => {
      const child = document.createElement("div");
      child.dataset.shellChild = name;
      return child;
    }),
  };
}

vi.mock("~/components/wallpaper/Wallpaper.vue", () => vaporShellChild("wallpaper"));
vi.mock("./menubar/MenuBar.vue", () => vaporShellChild("menubar"));
vi.mock("./dock/Dock.vue", () => vaporShellChild("dock"));
vi.mock("./contextMenu/DesktopContextMenuLayer.vue", () => vaporShellChild("context-menu"));
vi.mock("./widgetLayer/DesktopWidgetLayer.vue", () => vaporShellChild("widget-layer"));
vi.mock("./renderLayer/DesktopRenderLayer.vue", () => vaporShellChild("render-layer"));
vi.mock("./widgetGallery/DesktopWidgetGallery.vue", () => vaporShellChild("widget-gallery"));
vi.mock("./windowManager/WindowHost.vue", () => vaporShellChild("window-host"));
vi.mock("./spotlight/SpotlightHost.vue", () => vaporShellChild("spotlight"));
vi.mock("./permissionPrompt/PermissionPromptHost.vue", () => vaporShellChild("permission-prompt"));

describe("DesktopShell template structure (M3.7 follow-up)", () => {
  function mountShell() {
    return mount(DesktopShell);
  }

  it("renders DesktopWidgetLayer as a descendant of .desktop-stage", () => {
    const wrapper = mountShell();

    const stage = wrapper.find("main.desktop-stage");
    expect(stage.exists()).toBe(true);

    const widgetLayer = stage.find('[data-shell-child="widget-layer"]');
    expect(widgetLayer.exists()).toBe(true);
  });

  it("renders DesktopWidgetLayer and DesktopRenderLayer BEFORE WindowHost inside .desktop-stage", () => {
    const wrapper = mountShell();

    const stage = wrapper.find("main.desktop-stage");
    const stageChildren = Array.from(stage.element.children) as HTMLElement[];

    const layerIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "widget-layer");
    const renderLayerIdx = stageChildren.findIndex(
      (el) => el.dataset.shellChild === "render-layer",
    );
    const windowHostIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "window-host");

    expect(layerIdx).toBeGreaterThanOrEqual(0);
    expect(renderLayerIdx).toBeGreaterThanOrEqual(0);
    expect(windowHostIdx).toBeGreaterThanOrEqual(0);
    expect(layerIdx).toBeLessThan(windowHostIdx);
    expect(renderLayerIdx).toBeLessThan(windowHostIdx);
  });

  it("renders the desktop context-menu layer before widgets and windows", () => {
    const wrapper = mountShell();

    const stage = wrapper.find("main.desktop-stage");
    const stageChildren = Array.from(stage.element.children) as HTMLElement[];

    const contextIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "context-menu");
    const layerIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "widget-layer");
    const renderLayerIdx = stageChildren.findIndex(
      (el) => el.dataset.shellChild === "render-layer",
    );
    const windowHostIdx = stageChildren.findIndex((el) => el.dataset.shellChild === "window-host");

    expect(contextIdx).toBeGreaterThanOrEqual(0);
    expect(contextIdx).toBeLessThan(layerIdx);
    expect(layerIdx).toBeLessThan(renderLayerIdx);
    expect(renderLayerIdx).toBeLessThan(windowHostIdx);
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
