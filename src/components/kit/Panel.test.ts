import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import Panel from "./Panel.vue";

describe("Panel", () => {
  it("applies variant and padding modifiers", () => {
    const panel = mount(Panel, {
      props: { variant: "elevated", padding: "lg" },
      slots: { default: "Panel" },
    });
    expect(panel.classes()).toContain("ds-kit-panel--elevated");
    expect(panel.classes()).toContain("ds-kit-panel--padding-lg");
    expect(panel.text()).toBe("Panel");
  });
});
