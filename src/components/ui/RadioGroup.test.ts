import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h } from "vue";

import RadioGroup from "./RadioGroup.vue";
import RadioGroupItem from "./RadioGroupItem.vue";

function mountGroup(modelValue = "a") {
  return mount(RadioGroup, {
    props: { modelValue, label: "Density" },
    slots: {
      default: () => [
        h(RadioGroupItem, { value: "a", label: "A" }),
        h(RadioGroupItem, { value: "b", label: "B" }),
        h(RadioGroupItem, { value: "c", label: "C", disabled: true }),
      ],
    },
  });
}

describe("RadioGroup", () => {
  it("exposes radiogroup semantics with a label", () => {
    const wrapper = mountGroup();
    expect(wrapper.attributes("role")).toBe("radiogroup");
    expect(wrapper.attributes("aria-label")).toBe("Density");
  });

  it("renders one radio per item and marks the selected one", () => {
    const wrapper = mountGroup("a");
    const radios = wrapper.findAll('[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[0].attributes("aria-checked")).toBe("true");
  });

  it("emits update:modelValue when another item is chosen", async () => {
    const wrapper = mountGroup("a");
    await wrapper.findAll('[role="radio"]')[1].trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["b"]);
  });

  it("applies the orientation modifier", () => {
    const wrapper = mount(RadioGroup, {
      props: { modelValue: "a", label: "Density", orientation: "horizontal" },
      slots: { default: () => [h(RadioGroupItem, { value: "a", label: "A" })] },
    });
    expect(wrapper.classes()).toContain("ds-radio-group--horizontal");
  });
});
