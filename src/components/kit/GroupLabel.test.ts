import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import GroupLabel from "./GroupLabel.vue";

describe("GroupLabel", () => {
  it("renders its slot with the group-label class", () => {
    const label = mount(GroupLabel, { slots: { default: "Appearance" } });
    expect(label.classes()).toContain("ds-kit-group-label");
    expect(label.text()).toBe("Appearance");
  });
});
