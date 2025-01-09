import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { ref } from "vue";

import Switch from "./Switch.vue";

describe("Switch primitive", () => {
  it("renders role=switch + aria-checked reflecting modelValue", () => {
    const wrapper = mount(Switch, { props: { modelValue: false } });
    const root = wrapper.find('[role="switch"]');
    expect(root.exists()).toBe(true);
    expect(root.attributes("aria-checked")).toBe("false");
    expect(root.attributes("data-state")).toBe("unchecked");
  });

  it("reflects modelValue=true as checked", () => {
    const wrapper = mount(Switch, { props: { modelValue: true } });
    const root = wrapper.find('[role="switch"]');
    expect(root.attributes("aria-checked")).toBe("true");
    expect(root.attributes("data-state")).toBe("checked");
  });

  it("emits update:modelValue on click (v-model contract)", async () => {
    const wrapper = mount(Switch, { props: { modelValue: false } });
    await wrapper.find('[role="switch"]').trigger("click");
    const events = wrapper.emitted("update:modelValue");
    expect(events).toHaveLength(1);
    expect(events?.[0]).toEqual([true]);
  });

  it("v-model round-trip — parent state updates reflect in the DOM", async () => {
    const value = ref(false);
    const wrapper = mount({
      components: { Switch },
      setup() {
        return { value };
      },
      template: '<Switch v-model="value" />',
    });

    let root = wrapper.find('[role="switch"]');
    expect(root.attributes("aria-checked")).toBe("false");

    await root.trigger("click");
    expect(value.value).toBe(true);

    root = wrapper.find('[role="switch"]');
    expect(root.attributes("aria-checked")).toBe("true");
  });

  it("disabled prevents click from emitting update", async () => {
    const wrapper = mount(Switch, { props: { modelValue: false, disabled: true } });
    const root = wrapper.find('[role="switch"]');
    expect(root.attributes("data-disabled")).toBeDefined();

    await root.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("aria-label falls through to the root via attrs inheritance", () => {
    const wrapper = mount(Switch, {
      props: { modelValue: false },
      attrs: { "aria-label": "Enable widget" },
    });
    expect(wrapper.find('[role="switch"]').attributes("aria-label")).toBe("Enable widget");
  });
});
