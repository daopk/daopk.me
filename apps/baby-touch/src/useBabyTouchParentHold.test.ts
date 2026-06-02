import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { PARENT_HOLD_MS } from "./babyTouchTiming";
import { useBabyTouchParentHold } from "./useBabyTouchParentHold";

function mountBabyTouchParentHoldHarness() {
  let api!: ReturnType<typeof useBabyTouchParentHold>;
  const onComplete = vi.fn();
  const wrapper = mount(
    defineComponent({
      name: "BabyTouchParentHoldHarness",
      setup() {
        api = useBabyTouchParentHold({ onComplete });
        return () => h("div");
      },
    }),
  );
  return { api, onComplete, wrapper };
}

describe("useBabyTouchParentHold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("completes only after both top corners are held", async () => {
    const { api, onComplete, wrapper } = mountBabyTouchParentHoldHarness();

    expect(api.handleParentCornerDown(1, { x: 0.08, y: 0.08 })).toBe(true);
    await vi.advanceTimersByTimeAsync(PARENT_HOLD_MS);
    expect(onComplete).not.toHaveBeenCalled();

    api.handleParentCornerUp(1);
    expect(api.handleParentCornerDown(2, { x: 0.08, y: 0.08 })).toBe(true);
    expect(api.handleParentCornerDown(3, { x: 0.92, y: 0.08 })).toBe(true);
    await vi.advanceTimersByTimeAsync(PARENT_HOLD_MS - 1);
    expect(onComplete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onComplete).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("cancels a short or partial parent hold", async () => {
    const { api, onComplete, wrapper } = mountBabyTouchParentHoldHarness();

    api.handleParentCornerDown(1, { x: 0.08, y: 0.08 });
    api.handleParentCornerDown(2, { x: 0.92, y: 0.08 });
    await vi.advanceTimersByTimeAsync(PARENT_HOLD_MS - 200);
    api.handleParentCornerUp(2);
    await vi.advanceTimersByTimeAsync(300);

    expect(onComplete).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
