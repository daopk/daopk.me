import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { mountVapor, type VaporMount } from "~/test/mountVapor";

import RadioGroup from "./RadioGroup.vue";
import RadioGroupItem from "./RadioGroupItem.vue";
import Slider from "./Slider.vue";
import Switch from "./Switch.vue";

const mounted: VaporMount[] = [];

function mount(
  component: Parameters<typeof mountVapor>[0],
  options?: Parameters<typeof mountVapor>[1],
) {
  const wrapper = mountVapor(component, options);
  mounted.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("Switch", () => {
  it("keeps the model, disabled and ARIA contract on a native switch", async () => {
    const updates: boolean[] = [];
    const wrapper = mount(Switch, {
      props: {
        modelValue: false,
        ariaLabel: "Enable widget",
        "onUpdate:modelValue": (next: boolean) => updates.push(next),
      },
    });
    const input = wrapper.find<HTMLInputElement>('input[role="switch"]');

    expect(input.checked).toBe(false);
    expect(input.getAttribute("aria-checked")).toBe("false");
    expect(input.getAttribute("aria-label")).toBe("Enable widget");
    expect(wrapper.find(".ds-switch").getAttribute("data-state")).toBe("unchecked");
    expect(wrapper.find(".ds-switch__track")).toBeTruthy();
    expect(wrapper.find(".ds-switch__thumb")).toBeTruthy();

    input.click();
    await nextTick();
    expect(updates).toEqual([true]);

    const disabled = mount(Switch, {
      props: {
        modelValue: false,
        disabled: true,
        "onUpdate:modelValue": (next: boolean) => updates.push(next),
      },
    });
    const disabledInput = disabled.find<HTMLInputElement>('input[role="switch"]');
    expect(disabledInput.disabled).toBe(true);
    disabledInput.click();
    await nextTick();
    expect(updates).toEqual([true]);
  });

  it("round-trips v-model state through the Vapor boundary", async () => {
    const value = ref(false);
    const Host = defineComponent({
      setup: () => () =>
        h(Switch, {
          modelValue: value.value,
          "onUpdate:modelValue": (next: boolean) => (value.value = next),
        }),
    });
    const wrapper = mount(Host);
    const input = wrapper.find<HTMLInputElement>('input[role="switch"]');

    input.click();
    await nextTick();
    expect(value.value).toBe(true);
    expect(input.checked).toBe(true);
    expect(input.getAttribute("aria-checked")).toBe("true");
  });

  it("forwards native form and validation attributes", () => {
    const wrapper = mount(Switch, {
      props: {
        modelValue: false,
        id: "notifications",
        name: "notifications",
        required: true,
        invalid: true,
        ariaDescribedby: "notifications-error",
        inputAttrs: {
          form: "preferences",
          autocomplete: "off",
          "data-native-control": "notifications",
        },
      },
    });
    const input = wrapper.find<HTMLInputElement>('input[type="checkbox"]');

    expect(input.id).toBe("notifications");
    expect(input.name).toBe("notifications");
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("notifications-error");
    expect(input.getAttribute("form")).toBe("preferences");
    expect(input.dataset.nativeControl).toBe("notifications");
  });
});

describe("Slider", () => {
  it("emits scalar updates and commits from native input/change events", async () => {
    const updates: number[] = [];
    const commits: number[] = [];
    const wrapper = mount(Slider, {
      props: {
        modelValue: 0.2,
        min: 0,
        max: 1,
        step: 0.05,
        "onUpdate:modelValue": (next: number) => updates.push(next),
        onCommit: (next: number) => commits.push(next),
      },
    });
    const input = wrapper.find<HTMLInputElement>('input[type="range"]');

    expect(input.classList).toContain("ds-slider__input");

    input.value = "0.45";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(updates.at(-1)).toBeCloseTo(0.45, 2);

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(commits).toEqual([0.45]);
  });

  it("clamps values and preserves orientation, disabled and ARIA attributes", () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: 2,
        min: 0,
        max: 1,
        orientation: "vertical",
        disabled: true,
        ariaLabelledby: "dim-label",
        ariaValuetext: "100% darkening",
      },
    });
    const root = wrapper.find(".ds-slider");
    const input = wrapper.find<HTMLInputElement>('input[type="range"]');

    expect(root.getAttribute("data-orientation")).toBe("vertical");
    expect(input.valueAsNumber).toBe(1);
    expect(input.disabled).toBe(true);
    expect(input.getAttribute("aria-orientation")).toBe("vertical");
    expect(input.getAttribute("aria-labelledby")).toBe("dim-label");
    expect(input.getAttribute("aria-valuetext")).toBe("100% darkening");
  });

  it("forwards native range form attributes", () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: 25,
        id: "volume",
        name: "volume",
        ariaDescribedby: "volume-help",
        inputAttrs: { form: "player-settings", list: "volume-marks" },
      },
    });
    const input = wrapper.find<HTMLInputElement>('input[type="range"]');

    expect(input.id).toBe("volume");
    expect(input.name).toBe("volume");
    expect(input.getAttribute("aria-describedby")).toBe("volume-help");
    expect(input.getAttribute("form")).toBe("player-settings");
    expect(input.getAttribute("list")).toBe("volume-marks");
  });
});

describe("RadioGroup", () => {
  function mountGroup(modelValue = "a", onUpdate?: (next: string) => void) {
    return mount(RadioGroup, {
      props: {
        modelValue,
        label: "Density",
        name: "density",
        "onUpdate:modelValue": onUpdate,
      },
      slots: {
        default: () => [
          h(RadioGroupItem, { value: "a", label: "A" }),
          h(RadioGroupItem, { value: "b", label: "B" }),
          h(RadioGroupItem, { value: "c", label: "C", disabled: true }),
        ],
      },
    });
  }

  it("exposes native radio semantics and emits the selected string", async () => {
    const updates: string[] = [];
    const wrapper = mountGroup("a", (next) => updates.push(next));
    const group = wrapper.find('[role="radiogroup"]');
    const radios = wrapper.findAll<HTMLInputElement>('input[type="radio"]');

    expect(group.getAttribute("aria-label")).toBe("Density");
    expect(wrapper.findAll('[role="radiogroup"]')).toHaveLength(1);
    expect(wrapper.findAll('[role="presentation"]')).toHaveLength(0);
    expect(radios).toHaveLength(3);
    expect(radios[0]?.checked).toBe(true);
    expect(radios[0]?.name).toBe("density");
    expect(radios[2]?.disabled).toBe(true);
    expect(wrapper.findAll(".ds-radio__indicator")).toHaveLength(3);

    radios[1]?.click();
    await nextTick();
    expect(updates).toEqual(["b"]);
  });

  it("keeps the orientation modifier and rich item labels", () => {
    const wrapper = mount(RadioGroup, {
      props: { modelValue: "a", orientation: "horizontal", label: "Density" },
      slots: {
        default: () =>
          h(RadioGroupItem, { value: "a" }, { default: () => h("strong", "Comfortable") }),
      },
    });

    expect(wrapper.find(".ds-radio-group").classList).toContain("ds-radio-group--horizontal");
    expect(wrapper.find(".ds-radio__label").textContent).toBe("Comfortable");
  });

  it("forwards group validation and item-level native attributes", () => {
    const wrapper = mount(RadioGroup, {
      props: {
        id: "density-group",
        modelValue: undefined,
        name: "density",
        label: "Density",
        required: true,
        invalid: true,
        ariaDescribedby: "density-error",
      },
      slots: {
        default: () =>
          h(RadioGroupItem, {
            value: "compact",
            label: "Compact",
            inputAttrs: { form: "appearance", autocomplete: "off" },
          }),
      },
    });
    const group = wrapper.find<HTMLElement>('[role="radiogroup"]');
    const input = wrapper.find<HTMLInputElement>('input[type="radio"]');

    expect(group.id).toBe("density-group");
    expect(group.getAttribute("aria-orientation")).toBe("vertical");
    expect(group.getAttribute("aria-required")).toBe("true");
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(group.getAttribute("aria-describedby")).toBe("density-error");
    expect(input.name).toBe("density");
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("form")).toBe("appearance");
  });
});
