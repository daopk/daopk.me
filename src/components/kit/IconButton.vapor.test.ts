import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";
import { defineVaporComponent } from "vue";

import IconButton from "./IconButton.vue";

const StubIcon = defineVaporComponent(() => {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.dataset.testid = "icon";
  return icon;
});

describe("IconButton", () => {
  it("renders accessible icon-only semantics and handles clicks", async () => {
    let clicks = 0;
    const wrapper = mount(IconButton, {
      props: { label: "Refresh", icon: StubIcon, pressed: true },
      attrs: { onClick: () => clicks++ },
    });

    expect(wrapper.attributes("aria-label")).toBe("Refresh");
    expect(wrapper.attributes("aria-pressed")).toBe("true");
    expect(wrapper.find("[data-testid='icon']").exists()).toBe(true);

    await wrapper.trigger("click");
    expect(clicks).toBe(1);
  });
});
