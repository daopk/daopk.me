import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import TextInput from "./TextInput.vue";

describe("TextInput", () => {
  it("emits update:modelValue on input", async () => {
    const wrapper = mount(TextInput, { props: { modelValue: "old" } });
    await wrapper.setValue("new");
    expect(wrapper.emitted("update:modelValue")).toEqual([["new"]]);
  });

  it("renders typed native attributes", () => {
    const wrapper = mount(TextInput, {
      props: {
        modelValue: "",
        type: "email",
        name: "email",
        placeholder: "you@example.com",
        inputmode: "email",
      },
    });
    const input = wrapper.find("input");
    expect(input.attributes("type")).toBe("email");
    expect(input.attributes("name")).toBe("email");
    expect(input.attributes("placeholder")).toBe("you@example.com");
    expect(input.attributes("inputmode")).toBe("email");
  });

  it("marks itself invalid via the prop", () => {
    const wrapper = mount(TextInput, { props: { modelValue: "", invalid: true } });
    expect(wrapper.find("input").attributes("aria-invalid")).toBe("true");
    expect(wrapper.classes()).toContain("ds-kit-text-input--invalid");
  });

  it("exposes focus/blur/select methods", () => {
    const wrapper = mount(TextInput, { props: { modelValue: "" } });
    const vm = wrapper.vm as unknown as {
      focus: () => void;
      blur: () => void;
      select: () => void;
    };
    expect(() => {
      vm.focus();
      vm.select();
      vm.blur();
    }).not.toThrow();
  });
});
