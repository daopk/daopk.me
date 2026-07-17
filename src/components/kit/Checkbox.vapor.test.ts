import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import Checkbox from "./Checkbox.vue";

describe("Checkbox", () => {
  it("renders its label slot and reflects the model value", () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false }, slots: { default: "Accept" } });
    expect(wrapper.text()).toContain("Accept");
    expect((wrapper.find("input").element as HTMLInputElement).checked).toBe(false);
  });

  it("emits update:modelValue on change", async () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false } });
    await wrapper.find("input").setValue(true);
    expect(wrapper.emitted("update:modelValue")).toEqual([[true]]);
  });

  it("reflects the indeterminate flag onto the native input", async () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false, indeterminate: true } });
    expect((wrapper.find("input").element as HTMLInputElement).indeterminate).toBe(true);

    await wrapper.setProps({ indeterminate: false });
    expect((wrapper.find("input").element as HTMLInputElement).indeterminate).toBe(false);
  });

  it("forwards an aria-label when there is no visible label", () => {
    const wrapper = mount(Checkbox, { props: { modelValue: true, ariaLabel: "Select row" } });
    expect(wrapper.find("input").attributes("aria-label")).toBe("Select row");
  });
});
