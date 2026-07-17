import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import ChoiceGrid from "./ChoiceGrid.vue";

describe("ChoiceGrid", () => {
  it("groups choices as a labelled radiogroup", () => {
    const grid = mount(ChoiceGrid, { props: { label: "Theme" }, slots: { default: "cards" } });
    expect(grid.attributes("role")).toBe("radiogroup");
    expect(grid.attributes("aria-label")).toBe("Theme");
    expect(grid.text()).toBe("cards");
  });
});
