import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h } from "vue";

import Card from "./Card.vue";

describe("Card (M2b Phase 3 / Commit G)", () => {
  it("renders default slot content inside a div root", () => {
    const wrapper = mount(Card, { slots: { default: "hello" } });
    expect(wrapper.element.tagName).toBe("DIV");
    expect(wrapper.text()).toBe("hello");
  });

  it("renders with `as=button` when interactive", () => {
    const wrapper = mount(Card, {
      props: { as: "button", interactive: true },
      slots: { default: "click me" },
    });
    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.classes()).toContain("ds-card--interactive");
  });

  it("default variant uses the default modifier, subtle variant uses subtle", () => {
    const def = mount(Card);
    expect(def.classes()).toContain("ds-card--default");
    expect(def.classes()).not.toContain("ds-card--subtle");

    const subtle = mount(Card, { props: { variant: "subtle" } });
    expect(subtle.classes()).toContain("ds-card--subtle");
    expect(subtle.classes()).not.toContain("ds-card--default");
  });

  it("selected applies the selected modifier", () => {
    const wrapper = mount(Card, { props: { selected: true } });
    expect(wrapper.classes()).toContain("ds-card--selected");
  });

  it("forwards arbitrary attrs (aria-checked, role) onto the root element", () => {
    const wrapper = mount(Card, {
      props: { as: "button", interactive: true },
      attrs: { role: "radio", "aria-checked": "true" },
    });
    expect(wrapper.attributes("role")).toBe("radio");
    expect(wrapper.attributes("aria-checked")).toBe("true");
  });

  it("emits click events through the fallthrough root", async () => {
    let clicks = 0;
    const wrapper = mount(Card, {
      props: { as: "button", interactive: true },
      attrs: { onClick: () => clicks++ },
      slots: { default: () => h("span", "label") },
    });
    await wrapper.trigger("click");
    expect(clicks).toBe(1);
  });

  it("non-interactive cards omit the interactive modifier", () => {
    const wrapper = mount(Card);
    expect(wrapper.classes()).not.toContain("ds-card--interactive");
  });
});
