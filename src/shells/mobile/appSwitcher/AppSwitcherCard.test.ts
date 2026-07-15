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

    await wrapper.find(".app-switcher-card__select").trigger("click");

    expect(wrapper.emitted("select")).toEqual([["frame-1"]]);
  });

  it("uses a native button for keyboard selection", async () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });
    const select = wrapper.find(".app-switcher-card__select");

    expect(select.element.tagName).toBe("BUTTON");
    expect(select.attributes("type")).toBe("button");
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

    expect(wrapper.find(".app-switcher-card__select").attributes("aria-label")).toBe(
      "Switch to About, currently running",
    );
    expect(wrapper.find(".app-switcher-card__dismiss").attributes("aria-label")).toBe(
      "Dismiss About",
    );
  });

  it("keeps select and dismiss as sibling controls", () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });
    const card = wrapper.find(".app-switcher-card");
    const select = wrapper.find(".app-switcher-card__select");
    const dismiss = wrapper.find(".app-switcher-card__dismiss");

    expect(card.attributes("role")).toBeUndefined();
    expect(select.element.parentElement).toBe(card.element);
    expect(dismiss.element.parentElement).toBe(card.element);
    expect(select.element.contains(dismiss.element)).toBe(false);
  });

  it("exposes frameId + handleId + manifestId data attributes for DOM lookups", () => {
    const wrapper = mount(AppSwitcherCard, { props: makeProps() });

    expect(wrapper.attributes("data-frame-id")).toBe("frame-1");
    expect(wrapper.attributes("data-handle-id")).toBe("h-1");
    expect(wrapper.attributes("data-manifest-id")).toBe("about");
  });
});
