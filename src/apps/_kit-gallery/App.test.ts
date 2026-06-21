import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

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

  // Smoke a11y guard over the whole catalog. color-contrast needs real layout
  // (unavailable in happy-dom) so it is disabled; we fail only on serious or
  // critical structural violations (labels, roles, names, duplicate ids).
  it("has no serious accessibility violations", async () => {
    const axe = (await import("axe-core")).default;
    const wrapper = mount(App, { attachTo: document.body });
    await nextTick();

    const results = await axe.run(wrapper.element as HTMLElement, {
      resultTypes: ["violations"],
      rules: { "color-contrast": { enabled: false } },
    });

    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    const summary = blocking.map(
      (violation) =>
        `${violation.id}: ${violation.help} -> ${violation.nodes
          .map((node) => node.html)
          .join(" | ")}`,
    );
    expect(summary).toEqual([]);

    wrapper.unmount();
  });
});
