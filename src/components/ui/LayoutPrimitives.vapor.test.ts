import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { Button } from "ropav/button";
import { Card } from "ropav/card";

import { assertVaporComponents, mountVaporRoot, type VaporMount } from "~/test/mountVapor";

const mounted: VaporMount[] = [];

function text(value: string): Text {
  return document.createTextNode(value);
}

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

it("keeps the direct Ropav layout exports compiled in Vapor mode", () => {
  assertVaporComponents({ Button, Card });
});

describe("Button", () => {
  it("preserves native attributes, variants and compound slots", () => {
    const wrapper = mount(Button, {
      props: { variant: "solid", size: "sm", type: "submit", "data-action": "save" },
      slots: {
        left: () => text("Before"),
        default: () => text("Save"),
        right: () => text("After"),
      },
    });
    const button = wrapper.find<HTMLButtonElement>("button");

    expect(button.type).toBe("submit");
    expect(button.dataset.action).toBe("save");
    expect(button.classList).toContain("rp-button--solid");
    expect(button.classList).toContain("rp-button--size-sm");
    expect(wrapper.find(".rp-button__left").textContent).toBe("Before");
    expect(wrapper.find(".rp-button__label").textContent).toBe("Save");
    expect(wrapper.find(".rp-button__right").textContent).toBe("After");
  });

  it("disables interaction and exposes busy state while loading", async () => {
    let clicks = 0;
    const loader = () => {
      const loader = document.createElement("span");
      loader.dataset.testid = "loader";
      return loader;
    };
    const wrapper = mount(Button, {
      props: { loading: true, onClick: () => clicks++ },
      slots: { loading: loader, default: () => text("Save") },
    });
    const button = wrapper.find<HTMLButtonElement>("button");

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("data-loading")).toBe(true);
    expect(wrapper.findAll('[data-testid="loader"]')).toHaveLength(1);
    button.click();
    await nextTick();
    expect(clicks).toBe(0);
  });
});

describe("Card", () => {
  it("renders semantic sections and exposes the public Styles API", () => {
    const wrapper = mount(Card, {
      props: {
        title: "Storage",
        description: "12 GB available",
        layer: "raised",
        padding: "lg",
        radius: "md",
        headerBorder: true,
        footerBorder: true,
        classNames: { root: "consumer-card", body: "consumer-body" },
        "data-card": "storage",
      },
      slots: {
        default: () => text("Card body"),
        footer: () => text("Card footer"),
      },
    });
    const card = wrapper.find<HTMLElement>(".rp-card");

    expect(card.dataset.card).toBe("storage");
    expect(card.classList).toContain("consumer-card");
    expect(card.classList).toContain("rp-card--layer-raised");
    expect(card.classList).toContain("rp-card--padding-lg");
    expect(card.classList).toContain("rp-card--radius-md");
    expect(wrapper.find(".rp-card__title").textContent).toBe("Storage");
    expect(wrapper.find(".rp-card__description").textContent).toBe("12 GB available");
    expect(wrapper.find(".consumer-body").textContent).toBe("Card body");
    expect(wrapper.find(".rp-card__footer").textContent).toBe("Card footer");
  });
});
