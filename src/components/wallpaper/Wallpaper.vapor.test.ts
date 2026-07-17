import { mountVaporTest as mount } from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Wallpaper as WallpaperModel } from "~/core/theme/wallpapers";
import type { Ref } from "vue";

import Wallpaper from "./Wallpaper.vue";

const { currentWallpaper } = vi.hoisted(() => {
  const { ref } = require("vue") as typeof import("vue");
  return {
    currentWallpaper: ref({
      id: "test",
      name: "Test",
      type: "image",
      value: "/wallpaper.jpg",
    }),
  };
}) as { currentWallpaper: Ref<WallpaperModel> };

vi.mock("~/composables/useWallpaper", () => ({
  useWallpaper() {
    return {
      current: currentWallpaper,
      list: () => [currentWallpaper.value],
    };
  },
}));

describe("Wallpaper", () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty("--mobile-shell-page-background-color");
    document.documentElement.style.removeProperty("--mobile-shell-page-background-image");
    currentWallpaper.value = {
      id: "test",
      name: "Test",
      type: "image",
      value: "/wallpaper.jpg",
    } satisfies WallpaperModel;
  });

  afterEach(() => {
    document.documentElement.style.removeProperty("--mobile-shell-page-background-color");
    document.documentElement.style.removeProperty("--mobile-shell-page-background-image");
  });

  it("paints the wallpaper on an inner layer", () => {
    const wrapper = mount(Wallpaper, { props: { shellId: "desktop" } });
    const root = wrapper.find(".wallpaper");
    const layer = wrapper.find(".wallpaper__layer");

    expect(root.exists()).toBe(true);
    expect(layer.exists()).toBe(true);
    expect((root.element as HTMLElement).style.backgroundImage).toBe("");
    expect((layer.element as HTMLElement).style.backgroundImage).toContain("/wallpaper.jpg");
  });

  it("keeps solid wallpaper paint on the inner layer too", async () => {
    currentWallpaper.value = {
      id: "solid",
      name: "Solid",
      type: "solid",
      value: "rgb(1 2 3)",
    } satisfies WallpaperModel;

    const wrapper = mount(Wallpaper, { props: { shellId: "desktop" } });
    await wrapper.vm.$nextTick();

    const root = wrapper.find(".wallpaper");
    const layer = wrapper.find(".wallpaper__layer");
    expect((root.element as HTMLElement).style.background).toBe("");
    expect((layer.element as HTMLElement).style.background).toContain("rgb");
  });

  it("can sync the active wallpaper to page background variables", () => {
    const wrapper = mount(Wallpaper, {
      props: { shellId: "mobile", syncPageBackground: true },
    });

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue("--mobile-shell-page-background-image")).toContain(
      "/wallpaper.jpg",
    );
    expect(rootStyle.getPropertyValue("--mobile-shell-page-background-color")).toBe("transparent");

    wrapper.unmount();

    expect(rootStyle.getPropertyValue("--mobile-shell-page-background-image")).toBe("");
    expect(rootStyle.getPropertyValue("--mobile-shell-page-background-color")).toBe("");
  });

  it("syncs solid wallpapers as page background colors", () => {
    currentWallpaper.value = {
      id: "solid",
      name: "Solid",
      type: "solid",
      value: "rgb(1 2 3)",
    } satisfies WallpaperModel;

    const wrapper = mount(Wallpaper, {
      props: { shellId: "mobile", syncPageBackground: true },
    });

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue("--mobile-shell-page-background-image")).toBe("none");
    expect(rootStyle.getPropertyValue("--mobile-shell-page-background-color")).toBe("rgb(1 2 3)");

    wrapper.unmount();
  });
});
