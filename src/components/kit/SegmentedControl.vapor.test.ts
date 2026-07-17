import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";
import { defineVaporComponent } from "vue";

import SegmentedControl from "./SegmentedControl.vue";

const StubIcon = defineVaporComponent(() => {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.dataset.testid = "icon";
  return icon;
});

describe("SegmentedControl", () => {
  it("reflects the active option and emits selection", async () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: "list",
        label: "View mode",
        showLabels: false,
        options: [
          { value: "list", label: "List", icon: StubIcon },
          { value: "grid", label: "Grid", icon: StubIcon },
        ],
      },
    });

    expect(wrapper.find('[data-value="list"]').attributes("aria-pressed")).toBe("true");
    await wrapper.find('[data-value="grid"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["grid"]]);
    expect(wrapper.emitted("change")).toEqual([["grid"]]);
  });

  it("does not emit for a disabled option", async () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: "list",
        label: "View mode",
        options: [
          { value: "list", label: "List" },
          { value: "grid", label: "Grid", disabled: true },
        ],
      },
    });
    await wrapper.find('[data-value="grid"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});
