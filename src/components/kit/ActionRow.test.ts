import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ActionRow from "./ActionRow.vue";

describe("ActionRow", () => {
  it("renders title, description, and the control slot", () => {
    const row = mount(ActionRow, {
      props: { title: "Reduce motion", description: "Use simpler transitions." },
      slots: { default: "<button>Toggle</button>" },
    });
    expect(row.text()).toContain("Reduce motion");
    expect(row.text()).toContain("Use simpler transitions.");
    expect(row.find("button").text()).toBe("Toggle");
  });
});
