import { mountVaporTest, type VaporTestMountOptions } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import App from "./App.vue";

function mount(component: typeof App, options: VaporTestMountOptions = {}) {
  return mountVaporTest(component, { ...options, toastProvider: true });
}

// Smoke test for the dev-only gallery: mounting the whole catalog at once is a
// cheap guard that every kit + ui primitive still renders together with valid
// props after refactors.
describe("Kit Gallery", () => {
  it("mounts the full component catalog", () => {
    const wrapper = mount(App);

    expect(wrapper.text()).toContain("Kit Gallery");
    expect(wrapper.text()).toContain("Button (ui)");
    expect(wrapper.text()).toContain("Field + inputs (Ropav)");
    expect(wrapper.text()).toContain("Facade additions (Ropav)");
    expect(wrapper.text()).toContain("Overlays (ui)");

    // Representative primitives from each layer render.
    expect(wrapper.findAll(".rp-button").length).toBeGreaterThan(0);
    expect(wrapper.find("a.rp-button").exists()).toBe(true);
    expect(wrapper.find(".rp-aspect-ratio").exists()).toBe(true);
    expect(wrapper.find(".rp-avatar").exists()).toBe(true);
    expect(wrapper.find(".rp-color-swatch").exists()).toBe(true);
    expect(wrapper.find(".rp-number-input").exists()).toBe(true);
    expect(wrapper.find(".rp-overlay").exists()).toBe(true);
    expect(wrapper.findAll(".gallery__choice")).toHaveLength(3);
    expect(wrapper.find('[role="switch"]').exists()).toBe(true);
    expect(wrapper.find(".ds-kit-data-table").exists()).toBe(true);
  });

  it("keeps the selected styled Radio card in sync", async () => {
    const wrapper = mount(App);
    const cards = wrapper.findAll(".gallery__choice");
    const inputs = cards.map((card) => card.find<HTMLInputElement>('input[type="radio"]'));

    // The middle card ("Comfortable") is selected by default.
    expect(inputs[1].element.checked).toBe(true);

    await inputs[0].setChecked();
    expect(inputs[0].element.checked).toBe(true);
    expect(inputs[1].element.checked).toBe(false);
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
