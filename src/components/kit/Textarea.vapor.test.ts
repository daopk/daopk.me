import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import Textarea from "./Textarea.vue";

describe("Textarea", () => {
  it("emits update:modelValue on input", async () => {
    const wrapper = mount(Textarea, { props: { modelValue: "old" } });
    await wrapper.setValue("body");
    expect(wrapper.emitted("update:modelValue")).toEqual([["body"]]);
  });

  it("applies rows, resize, and variant", () => {
    const wrapper = mount(Textarea, {
      props: { modelValue: "", rows: 5, resize: "none", variant: "plain" },
    });
    const textarea = wrapper.find("textarea");
    expect(textarea.attributes("rows")).toBe("5");
    expect(wrapper.classes()).toContain("ds-kit-textarea--resize-none");
    expect(wrapper.classes()).toContain("ds-kit-textarea--plain");
  });

  it("exposes focus/blur methods", () => {
    const wrapper = mount(Textarea, { props: { modelValue: "" } });
    const vm = wrapper.vm as unknown as { focus: () => void; blur: () => void };
    expect(() => {
      vm.focus();
      vm.blur();
    }).not.toThrow();
  });
});
