import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import App from "./App.vue";

// Smoke test for the dev-only gallery: mounting the whole catalog at once is a
// cheap guard that every kit + ui primitive still renders together with valid
// props after refactors.
describe("Kit Gallery", () => {
  it("mounts the full component catalog", () => {
    const wrapper = mount(App);

    expect(wrapper.text()).toContain("Kit Gallery");
    expect(wrapper.text()).toContain("Button (ui)");
    expect(wrapper.text()).toContain("Inputs (kit)");
    expect(wrapper.text()).toContain("Overlays (ui)");

    // Representative primitives from each layer render.
    expect(wrapper.findAll(".ds-button").length).toBeGreaterThan(0);
    expect(wrapper.findAll(".ds-kit-choice-card")).toHaveLength(3);
    expect(wrapper.find('[role="switch"]').exists()).toBe(true);
    expect(wrapper.find(".ds-kit-data-table").exists()).toBe(true);
  });

  it("keeps the selected ChoiceCard in sync", async () => {
    const wrapper = mount(App);
    const cards = wrapper.findAll(".ds-kit-choice-card");

    // The middle card ("Comfortable") is selected by default.
    expect(cards[1].attributes("aria-checked")).toBe("true");

    await cards[0].trigger("click");
    expect(cards[0].attributes("aria-checked")).toBe("true");
    expect(cards[1].attributes("aria-checked")).toBe("false");
  });
});
