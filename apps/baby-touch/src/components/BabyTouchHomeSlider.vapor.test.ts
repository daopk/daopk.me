import { mountVaporTest as mount, type VaporTestWrapper } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import BabyTouchHomeSlider from "./BabyTouchHomeSlider.vue";

function testRect(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function setElementRect(element: Element, width: number, height: number): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => testRect(width, height),
  });
}

function setHomeSliderRect(wrapper: VaporTestWrapper, width = 260, height = 48): void {
  const slider = wrapper.find('[data-testid="baby-touch-home-slider"]');
  setElementRect(slider.element, width, height);
}

describe("BabyTouchHomeSlider", () => {
  it("emits complete once the horizontal slide passes the threshold", async () => {
    const wrapper = mount(BabyTouchHomeSlider, { attachTo: document.body });
    setHomeSliderRect(wrapper);
    const thumb = wrapper.find('[data-testid="baby-touch-home-slider-thumb"]');

    await thumb.trigger("pointerdown", { clientX: 24, clientY: 24, pointerId: 1 });
    await thumb.trigger("pointermove", { clientX: 210, clientY: 24, pointerId: 1 });
    await nextTick();

    expect(wrapper.emitted("complete")).toHaveLength(1);

    wrapper.unmount();
  });

  it("does not emit complete for a short slide", async () => {
    const wrapper = mount(BabyTouchHomeSlider, { attachTo: document.body });
    setHomeSliderRect(wrapper);
    const thumb = wrapper.find('[data-testid="baby-touch-home-slider-thumb"]');

    await thumb.trigger("pointerdown", { clientX: 24, clientY: 24, pointerId: 1 });
    await thumb.trigger("pointermove", { clientX: 74, clientY: 24, pointerId: 1 });
    await thumb.trigger("pointerup", { clientX: 74, clientY: 24, pointerId: 1 });

    expect(wrapper.emitted("complete")).toBeUndefined();

    wrapper.unmount();
  });

  it("uses the vertical axis when the slider is taller than wide", async () => {
    const wrapper = mount(BabyTouchHomeSlider, { attachTo: document.body });
    setHomeSliderRect(wrapper, 48, 260);
    const thumb = wrapper.find('[data-testid="baby-touch-home-slider-thumb"]');

    await thumb.trigger("pointerdown", { clientX: 24, clientY: 24, pointerId: 1 });
    await thumb.trigger("pointermove", { clientX: 24, clientY: 210, pointerId: 1 });
    await nextTick();

    expect(wrapper.emitted("complete")).toHaveLength(1);

    wrapper.unmount();
  });
});
