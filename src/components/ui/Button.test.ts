import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h } from "vue";

import Button from "./Button.vue";

describe("Button (M2b Phase 3 / Commit H)", () => {
  it("renders default slot inside a <button type='button'>", () => {
    const wrapper = mount(Button, { slots: { default: "Save" } });
    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.attributes("type")).toBe("button");
    expect(wrapper.text()).toBe("Save");
  });

  it("applies the primary variant modifier", () => {
    const wrapper = mount(Button, { props: { variant: "primary" } });
    const cls = wrapper.classes();
    expect(cls).toContain("ds-button");
    expect(cls).toContain("ds-button--primary");
    expect(cls).not.toContain("ds-button--secondary");
    expect(cls).not.toContain("ds-button--ghost");
  });

  it("applies the secondary (default) variant modifier", () => {
    const wrapper = mount(Button);
    const cls = wrapper.classes();
    expect(cls).toContain("ds-button--secondary");
    expect(cls).not.toContain("ds-button--primary");
    expect(cls).not.toContain("ds-button--ghost");
  });

  it("applies the ghost variant modifier", () => {
    const wrapper = mount(Button, { props: { variant: "ghost" } });
    const cls = wrapper.classes();
    expect(cls).toContain("ds-button--ghost");
    expect(cls).not.toContain("ds-button--primary");
    expect(cls).not.toContain("ds-button--secondary");
  });

  it("applies the danger variant modifier", () => {
    const wrapper = mount(Button, { props: { variant: "danger" } });
    const cls = wrapper.classes();
    expect(cls).toContain("ds-button--danger");
    expect(cls).not.toContain("ds-button--primary");
    expect(cls).not.toContain("ds-button--secondary");
  });

  it("applies the size modifier (sm vs md)", () => {
    const sm = mount(Button, { props: { size: "sm" } });
    expect(sm.classes()).toContain("ds-button--sm");
    expect(sm.classes()).not.toContain("ds-button--md");

    const md = mount(Button, { props: { size: "md" } });
    expect(md.classes()).toContain("ds-button--md");
    expect(md.classes()).not.toContain("ds-button--sm");
  });

  it("loading sets aria-busy + disabled and applies the loading modifier", async () => {
    let clicks = 0;
    const wrapper = mount(Button, {
      props: { loading: true },
      attrs: { onClick: () => clicks++ },
    });
    expect(wrapper.attributes("aria-busy")).toBe("true");
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.classes()).toContain("ds-button--loading");

    await wrapper.trigger("click");
    expect(clicks).toBe(0);
  });

  it("disabled sets disabled + the disabled modifier (without aria-busy)", () => {
    const wrapper = mount(Button, { props: { disabled: true } });
    expect(wrapper.attributes("aria-busy")).toBeUndefined();
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.classes()).toContain("ds-button--disabled");
    expect(wrapper.classes()).not.toContain("ds-button--loading");
  });

  it("renders iconStart / iconEnd slots when provided", () => {
    const Star = { template: '<svg data-testid="icon-star"/>' };
    const Arrow = { template: '<svg data-testid="icon-arrow"/>' };
    const wrapper = mount(Button, {
      props: { iconStart: Star, iconEnd: Arrow },
      slots: { default: "go" },
    });
    expect(wrapper.find("[data-testid='icon-star']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='icon-arrow']").exists()).toBe(true);
  });

  it("emits click events through the fallthrough root when active", async () => {
    let clicks = 0;
    const wrapper = mount(Button, {
      slots: { default: () => h("span", "click") },
      attrs: { onClick: () => clicks++ },
    });
    await wrapper.trigger("click");
    expect(clicks).toBe(1);
  });

  it("honors `type='submit'` for form usage", () => {
    const wrapper = mount(Button, { props: { type: "submit" } });
    expect(wrapper.attributes("type")).toBe("submit");
  });
});
