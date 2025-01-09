import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import BackgroundStagePreview from "./BackgroundStagePreview.vue";

const baseProps = {
  previewStyle: {},
  wallpaperEffectStyle: {},
};

describe("BackgroundStagePreview", () => {
  it("renders desktop chrome for desktop shell previews", () => {
    const wrapper = mount(BackgroundStagePreview, {
      props: {
        ...baseProps,
        shellId: "desktop",
      },
    });

    expect(wrapper.attributes("data-shell")).toBe("desktop");
    expect(wrapper.find(".background__stage-menubar").exists()).toBe(true);
    expect(wrapper.find(".background__stage-window").exists()).toBe(true);
    expect(wrapper.find(".background__stage-dock").exists()).toBe(true);
    expect(wrapper.find(".background__stage-phone").exists()).toBe(false);
    expect(wrapper.find(".background__stage-wallpaper").exists()).toBe(true);
  });

  it("renders mobile chrome without desktop menubar or dock", () => {
    const wrapper = mount(BackgroundStagePreview, {
      props: {
        ...baseProps,
        shellId: "mobile",
      },
    });

    expect(wrapper.attributes("data-shell")).toBe("mobile");
    expect(wrapper.find(".background__stage-menubar").exists()).toBe(false);
    expect(wrapper.find(".background__stage-dock").exists()).toBe(false);
    expect(wrapper.find(".background__stage-phone").exists()).toBe(true);
    expect(wrapper.findAll(".background__stage-mobile-icon")).toHaveLength(9);
  });
});
