import { afterEach, describe, expect, it } from "vitest";
import { defineVaporComponent, nextTick } from "vue";

import { mountVaporRoot, type VaporMount } from "~/test/mountVapor";

import Button from "./Button.vue";
import Card from "./Card.vue";
import DialogActions from "./DialogActions.vue";

const mounted: VaporMount[] = [];

function mount(
  component: Parameters<typeof mountVaporRoot>[0],
  options?: Parameters<typeof mountVaporRoot>[1],
) {
  const wrapper = mountVaporRoot(component, options);
  mounted.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("Button", () => {
  it("preserves variants, size, type and slot content", () => {
    const wrapper = mount(Button, {
      props: { variant: "primary", size: "sm", type: "submit" },
      slots: { default: "<span>Save</span>" },
    });
    const button = wrapper.find<HTMLButtonElement>("button");

    expect(button.type).toBe("submit");
    expect(button.textContent).toBe("Save");
    expect(button.classList).toContain("ds-button--primary");
    expect(button.classList).toContain("ds-button--sm");
  });

  it("disables interaction while loading and swaps icons for status", async () => {
    let clicks = 0;
    const Icon = defineVaporComponent(() => {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.dataset.testid = "icon";
      return icon;
    });
    const wrapper = mount(Button, {
      props: { loading: true, iconStart: Icon, iconEnd: Icon, onClick: () => clicks++ },
      slots: { default: () => "Save" },
    });
    const button = wrapper.find<HTMLButtonElement>("button");

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(wrapper.find('[role="status"]').getAttribute("aria-label")).toBe("Loading");
    expect(wrapper.findAll('[data-testid="icon"]')).toHaveLength(0);
    button.click();
    await nextTick();
    expect(clicks).toBe(0);
  });

  it("forwards click listeners when active", async () => {
    let clicks = 0;
    const wrapper = mount(Button, { props: { onClick: () => clicks++ } });
    wrapper.find<HTMLButtonElement>("button").click();
    await nextTick();
    expect(clicks).toBe(1);
  });
});

describe("Card", () => {
  it("preserves dynamic roots, state classes and fallthrough attrs", () => {
    const wrapper = mount(Card, {
      props: {
        as: "button",
        interactive: true,
        selected: true,
        variant: "subtle",
        role: "radio",
        "aria-checked": "true",
      },
      slots: { default: () => "Choice" },
    });
    const card = wrapper.find<HTMLButtonElement>("button");

    expect(card.textContent).toBe("Choice");
    expect(card.getAttribute("role")).toBe("radio");
    expect(card.getAttribute("aria-checked")).toBe("true");
    expect(card.classList).toContain("ds-card--interactive");
    expect(card.classList).toContain("ds-card--selected");
    expect(card.classList).toContain("ds-card--subtle");
  });
});

describe("DialogActions", () => {
  it("renders slots with the default and requested alignment", () => {
    const end = mount(DialogActions, { slots: { default: "<button>OK</button>" } });
    expect(end.find(".ds-dialog-actions").classList).toContain("ds-dialog-actions--end");
    expect(end.find("button").textContent).toBe("OK");

    const between = mount(DialogActions, { props: { align: "between" } });
    expect(between.find(".ds-dialog-actions").classList).toContain("ds-dialog-actions--between");
  });
});
