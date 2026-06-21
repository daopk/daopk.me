import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import AppToolbar from "./AppToolbar.vue";

describe("AppToolbar", () => {
  it("renders sections and density/wrap variants", () => {
    const wrapper = mount(AppToolbar, {
      props: { density: "comfortable", wrap: true },
      slots: { start: "left", default: "main", end: "right" },
    });

    expect(wrapper.element.tagName).toBe("HEADER");
    expect(wrapper.classes()).toContain("ds-kit-toolbar--comfortable");
    expect(wrapper.classes()).toContain("ds-kit-toolbar--wrap");
    expect(wrapper.text()).toContain("left");
    expect(wrapper.text()).toContain("main");
    expect(wrapper.text()).toContain("right");
  });
});
