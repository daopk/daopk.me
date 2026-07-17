import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import HomePageIndicator from "./HomePageIndicator.vue";

describe("HomePageIndicator (M1.4)", () => {
  it("renders one dot per pageCount", () => {
    const wrapper = mount(HomePageIndicator, {
      props: { pageCount: 3, activeIndex: 0 },
    });
    expect(wrapper.findAll(".home-page-indicator__dot").length).toBe(3);
  });

  it("marks the active dot with aria-current and a modifier class", () => {
    const wrapper = mount(HomePageIndicator, {
      props: { pageCount: 2, activeIndex: 1 },
    });

    const dots = wrapper.findAll(".home-page-indicator__dot");
    expect(dots[0].attributes("aria-current")).toBeUndefined();
    expect(dots[0].classes()).not.toContain("home-page-indicator__dot--active");
    expect(dots[1].attributes("aria-current")).toBe("true");
    expect(dots[1].classes()).toContain("home-page-indicator__dot--active");
  });

  it("emits seek with the clicked index", async () => {
    const wrapper = mount(HomePageIndicator, {
      props: { pageCount: 3, activeIndex: 0 },
    });

    await wrapper.findAll(".home-page-indicator__dot")[2].trigger("click");

    const events = wrapper.emitted("seek");
    expect(events).toBeTruthy();
    expect(events?.[0]).toEqual([2]);
  });

  it("does not emit seek when clicking the active dot", async () => {
    const wrapper = mount(HomePageIndicator, {
      props: { pageCount: 2, activeIndex: 0 },
    });

    await wrapper.findAll(".home-page-indicator__dot")[0].trigger("click");

    expect(wrapper.emitted("seek")).toBeUndefined();
  });

  it("differentiates active and inactive aria-labels for screen readers", () => {
    const wrapper = mount(HomePageIndicator, {
      props: { pageCount: 2, activeIndex: 0 },
    });

    const dots = wrapper.findAll(".home-page-indicator__dot");
    expect(dots[0].attributes("aria-label")).toBe("Page 1, current page");
    expect(dots[1].attributes("aria-label")).toBe("Page 2");
  });

  it("exposes a group landmark with an aria-label", () => {
    const wrapper = mount(HomePageIndicator, {
      props: { pageCount: 2, activeIndex: 0 },
    });
    expect(wrapper.attributes("role")).toBe("group");
    expect(wrapper.attributes("aria-label")).toBe("Home pages");
  });
});
