import { afterEach, describe, expect, it } from "vitest";
import { createComponent, defineVaporComponent, nextTick, ref } from "vue";
import { Radio, RadioGroup } from "ropav/radio";
import { Slider } from "ropav/slider";
import { Switch } from "ropav/switch";

import { assertVaporComponents, mountVaporRoot, type VaporMount } from "~/test/mountVapor";

const mounted: VaporMount[] = [];

function text(value: string): Text {
  return document.createTextNode(value);
}

function mount(
  component: Parameters<typeof mountVaporRoot>[0],
  options?: Parameters<typeof mountVaporRoot>[1],
) {
  const wrapper = mountVaporRoot(component, options);
  mounted.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

it("keeps the direct Ropav form controls compiled in Vapor mode", () => {
  assertVaporComponents({ Radio, RadioGroup, Slider, Switch });
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
    expect(wrapper.find(".rp-switch").getAttribute("data-state")).toBe("unchecked");
    expect(wrapper.find(".rp-switch__track")).toBeTruthy();
    expect(wrapper.find(".rp-switch__thumb")).toBeTruthy();

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
    const Host = defineVaporComponent(() =>
      createComponent(Switch, {
        modelValue: () => value.value,
        "onUpdate:modelValue": () => (next: boolean) => (value.value = next),
      }),
    );
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
        describedby: "notifications-error",
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
  it("emits scalar updates from the native input event", async () => {
    const updates: number[] = [];
    const wrapper = mount(Slider, {
      props: {
        modelValue: 0.2,
        min: 0,
        max: 1,
        step: 0.05,
        tooltip: false,
        "onUpdate:modelValue": (next: number) => updates.push(next),
      },
    });
    const input = wrapper.find<HTMLInputElement>('input[type="range"]');

    expect(input.classList).toContain("rp-slider__native");

    input.value = "0.45";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(updates.at(-1)).toBeCloseTo(0.45, 2);
  });

  it("clamps values and preserves orientation, disabled and ARIA attributes", () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: 2,
        min: 0,
        max: 1,
        orientation: "vertical",
        disabled: true,
        labelledby: "dim-label",
        ariaValueText: "100% darkening",
        tooltip: false,
      },
    });
    const root = wrapper.find(".rp-slider");
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
        describedby: "volume-help",
        tooltip: false,
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
        ariaLabel: "Density",
        name: "density",
        "onUpdate:modelValue": onUpdate,
      },
      slots: {
        default: () => [
          createComponent(Radio, { value: "a" }, { default: () => text("A") }),
          createComponent(Radio, { value: "b" }, { default: () => text("B") }),
          createComponent(Radio, { value: "c", disabled: true }, { default: () => text("C") }),
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
    expect(wrapper.findAll(".rp-radio__dot")).toHaveLength(3);

    radios[1]?.click();
    await nextTick();
    expect(updates).toEqual(["b"]);
  });

  it("keeps the orientation modifier and rich item labels", () => {
    const wrapper = mount(RadioGroup, {
      props: { modelValue: "a", orientation: "horizontal", ariaLabel: "Density" },
      slots: {
        default: () =>
          createComponent(
            Radio,
            { value: "a" },
            {
              default: () => {
                const label = document.createElement("strong");
                label.textContent = "Comfortable";
                return label;
              },
            },
          ),
      },
    });

    expect(wrapper.find<HTMLElement>(".rp-radio-group").dataset.orientation).toBe("horizontal");
    expect(wrapper.find(".rp-radio__label").textContent).toBe("Comfortable");
  });

  it("forwards group validation and item-level native attributes", () => {
    const wrapper = mount(RadioGroup, {
      props: {
        id: "density-group",
        modelValue: undefined,
        name: "density",
        ariaLabel: "Density",
        required: true,
        invalid: true,
        describedby: "density-error",
      },
      slots: {
        default: () =>
          createComponent(
            Radio,
            {
              value: "compact",
              inputAttrs: { form: "appearance", autocomplete: "off" },
            },
            { default: () => text("Compact") },
          ),
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
