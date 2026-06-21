import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import Select from "./Select.vue";
import type { SelectOption } from "./types";

const options: readonly SelectOption[] = [
  { value: "one", label: "One" },
  { value: "two", label: "Two" },
  { value: "three", label: "Three", disabled: true },
];

describe("Select", () => {
  it("renders options and emits the chosen value", async () => {
    const wrapper = mount(Select, { props: { modelValue: "one", options } });
    expect(wrapper.findAll("option")).toHaveLength(3);
    await wrapper.setValue("two");
    expect(wrapper.emitted("update:modelValue")).toEqual([["two"]]);
  });

  it("renders a disabled placeholder option when provided", () => {
    const wrapper = mount(Select, {
      props: { modelValue: "", options, placeholder: "Choose one" },
    });
    const first = wrapper.findAll("option")[0];
    expect(first.text()).toBe("Choose one");
    expect(first.attributes("disabled")).toBeDefined();
  });

  it("disables individual options", () => {
    const wrapper = mount(Select, { props: { modelValue: "one", options } });
    const third = wrapper.findAll("option")[2];
    expect(third.attributes("disabled")).toBeDefined();
  });

  it("exposes focus/blur methods", () => {
    const wrapper = mount(Select, { props: { modelValue: "one", options } });
    const vm = wrapper.vm as unknown as { focus: () => void; blur: () => void };
    expect(() => {
      vm.focus();
      vm.blur();
    }).not.toThrow();
  });
});
