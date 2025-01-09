import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import AppSwitcherCard from "./AppSwitcherCard.vue";

const StubIcon = defineComponent({ template: "<svg data-testid='stub-icon' />" });

function makeProps() {
  return {
    frameId: "frame-1",
    handleId: "h-1",
    manifestId: "about",
    name: "About",
    icon: StubIcon,
  };
}

describe("AppSwitcherCard", () => {
  it("renders the manifest name, icon, and dismiss button", () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });

    expect(wrapper.text()).toContain("About");
    expect(wrapper.find("[data-testid='stub-icon']").exists()).toBe(true);
    expect(wrapper.find(".app-switcher-card__dismiss").exists()).toBe(true);
  });

  it("emits `select` with the frameId when the card body is clicked", async () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });

    await wrapper.trigger("click");

    expect(wrapper.emitted("select")).toEqual([["frame-1"]]);
  });

  it("emits `select` on Enter / Space key when focused (a11y keyboard activation)", async () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });

    await wrapper.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("select")).toEqual([["frame-1"]]);

    await wrapper.trigger("keydown", { key: " " });
    expect(wrapper.emitted("select")).toEqual([["frame-1"], ["frame-1"]]);
  });

  it("emits `dismiss` (not `select`) with the frameId when the dismiss button is clicked", async () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });

    await wrapper.find(".app-switcher-card__dismiss").trigger("click");

    expect(wrapper.emitted("dismiss")).toEqual([["frame-1"]]);
    // Critical — dismiss must not bubble into the outer card's select handler.
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("exposes correct ARIA labels (select includes 'currently running'; dismiss is per-app)", () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });

    expect(wrapper.attributes("aria-label")).toBe("Switch to About, currently running");
    expect(wrapper.find(".app-switcher-card__dismiss").attributes("aria-label")).toBe(
      "Dismiss About",
    );
  });

  it("renders `role='button'` + `tabindex='0'` on the outer card surface", () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });

    expect(wrapper.attributes("role")).toBe("button");
    expect(wrapper.attributes("tabindex")).toBe("0");
  });

  it("exposes frameId + handleId + manifestId data attributes for DOM lookups", () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });

    expect(wrapper.attributes("data-frame-id")).toBe("frame-1");
    expect(wrapper.attributes("data-handle-id")).toBe("h-1");
    expect(wrapper.attributes("data-manifest-id")).toBe("about");
  });
});
