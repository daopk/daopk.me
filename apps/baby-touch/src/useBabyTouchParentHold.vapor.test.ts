import { mountVaporComposable } from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PARENT_HOLD_MS } from "./babyTouchTiming";
import { useBabyTouchParentHold } from "./useBabyTouchParentHold";

function mountBabyTouchParentHoldHarness() {
  const onComplete = vi.fn();
  const mounted = mountVaporComposable(() => useBabyTouchParentHold({ onComplete }));
  return { api: mounted.result, onComplete, wrapper: mounted.wrapper };
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
