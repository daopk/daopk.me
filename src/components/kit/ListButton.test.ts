import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ListButton from "./ListButton.vue";

const StubIcon = { template: '<svg data-testid="icon" />' };

describe("ListButton", () => {
  it("renders title/meta/icon, marks the active row, and handles clicks", async () => {
    let clicks = 0;
    const row = mount(ListButton, {
      props: { title: "Alpha", meta: "Today", active: true, icon: StubIcon },
      attrs: { onClick: () => clicks++ },
    });
    expect(row.attributes("aria-current")).toBe("page");
    expect(row.text()).toContain("Alpha");
    expect(row.text()).toContain("Today");
    expect(row.find("[data-testid='icon']").exists()).toBe(true);

    await row.trigger("click");
    expect(clicks).toBe(1);
  });
});
