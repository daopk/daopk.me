import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import FormField from "./FormField.vue";
import TextInput from "./TextInput.vue";

describe("FormField", () => {
  it("renders label, hint, and required marker", () => {
    const wrapper = mount(FormField, {
      props: { label: "Title", hint: "Required", required: true },
      slots: { default: '<input id="title" />' },
    });

    expect(wrapper.text()).toContain("Title");
    expect(wrapper.text()).toContain("Required");
    expect(wrapper.find("input").exists()).toBe(true);
  });

  it("shows the error instead of the hint and announces it", () => {
    const wrapper = mount(FormField, {
      props: { label: "Title", hint: "Required", error: "Missing title" },
    });

    const message = wrapper.find(".ds-kit-form-field__message");
    expect(message.text()).toBe("Missing title");
    expect(message.attributes("role")).toBe("alert");
    expect(message.attributes("aria-live")).toBe("assertive");
    expect(wrapper.text()).not.toContain("Required");
  });

  it("auto-wires the nested control's id, describedby, invalid, and required", () => {
    const Harness = defineComponent({
      components: { FormField, TextInput },
      template: `<FormField label="Email" error="Required" required><TextInput /></FormField>`,
    });

    const wrapper = mount(Harness);
    const label = wrapper.find("label");
    const input = wrapper.find("input");
    const message = wrapper.find(".ds-kit-form-field__message--error");

    const controlId = input.attributes("id");
    expect(controlId).toBeTruthy();
    expect(label.attributes("for")).toBe(controlId);
    expect(input.attributes("aria-describedby")).toBe(message.attributes("id"));
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(input.attributes("aria-required")).toBe("true");
  });

  it("leaves aria-describedby unset when there is no hint or error", () => {
    const Harness = defineComponent({
      components: { FormField, TextInput },
      template: `<FormField label="Email"><TextInput /></FormField>`,
    });

    const wrapper = mount(Harness);
    expect(wrapper.find("input").attributes("aria-describedby")).toBeUndefined();
  });

  it("prefers an explicit `for` over the generated id", () => {
    const wrapper = mount(FormField, {
      props: { label: "Title", for: "custom-id" },
      slots: { default: '<input id="custom-id" />' },
    });
    expect(wrapper.find("label").attributes("for")).toBe("custom-id");
  });
});
