import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Slider from "./Slider.vue";

describe("Slider (M2b Phase 3 / Commit I — reka-ui wrap)", () => {
  beforeEach(() => {
    // happy-dom doesn't implement ResizeObserver; reka-ui's SliderRoot
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the SliderRoot/Track/Range/Thumb structure", () => {
    const wrapper = mount(Slider, { props: { modelValue: 0.5, min: 0, max: 1, step: 0.05 } });
    expect(wrapper.find("[role='slider']").exists()).toBe(true);
  });

  it("uses overflow thumb alignment by default", () => {
    const wrapper = mount(Slider, { props: { modelValue: 50 } });
    expect(wrapper.findComponent({ name: "SliderRoot" }).props("thumbAlignment")).toBe("overflow");
  });

  it("emits update:modelValue with a scalar number when reka-ui fires update:modelValue", () => {
    const wrapper = mount(Slider, { props: { modelValue: 0.2, min: 0, max: 1, step: 0.05 } });
    wrapper.findComponent({ name: "SliderRoot" }).vm.$emit("update:modelValue", [0.45]);
    const events = wrapper.emitted("update:modelValue");
    expect(events).toHaveLength(1);
    expect(events?.[0]?.[0]).toBeCloseTo(0.45, 2);
  });

  it("clamps emitted value to [min, max]", () => {
    const wrapper = mount(Slider, { props: { modelValue: 0.5, min: 0, max: 1 } });
    const root = wrapper.findComponent({ name: "SliderRoot" });
    root.vm.$emit("update:modelValue", [-0.5]);
    root.vm.$emit("update:modelValue", [1.5]);
    const events = wrapper.emitted("update:modelValue") ?? [];
    expect(events[0]?.[0]).toBe(0);
    expect(events[1]?.[0]).toBe(1);
  });

  it("emits commit when reka-ui fires value-commit", () => {
    const wrapper = mount(Slider, { props: { modelValue: 0.2, min: 0, max: 1, step: 0.05 } });
    wrapper.findComponent({ name: "SliderRoot" }).vm.$emit("valueCommit", [0.75]);
    const events = wrapper.emitted("commit");
    expect(events).toHaveLength(1);
    expect(events?.[0]?.[0]).toBeCloseTo(0.75, 2);
  });

  it("forwards aria-* attributes to SliderRoot for the thumb surface", () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: 0.3,
        min: 0,
        max: 1,
        ariaLabelledby: "dim-label",
        ariaValuetext: "30% darkening",
      },
    });
    const thumb = wrapper.find("[role='slider']");
    expect(thumb.attributes("aria-labelledby")).toBe("dim-label");
    expect(thumb.attributes("aria-valuetext")).toBe("30% darkening");
  });

  it("disabled state cascades through to reka-ui's SliderThumb", () => {
    const wrapper = mount(Slider, {
      props: { modelValue: 0.5, min: 0, max: 1, disabled: true },
    });
    const thumb = wrapper.find("[role='slider']");
    expect(thumb.attributes("tabindex")).toBeUndefined();
    expect(thumb.attributes("data-disabled")).toBeDefined();
  });
});
