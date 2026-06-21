import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import IconButton from "./IconButton.vue";

const StubIcon = { template: '<svg data-testid="icon" />' };

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
