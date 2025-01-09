import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, type Ref } from "vue";

import { useClock } from "./useClock";

const clockFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function msUntilNextMinute(d: Date): number {
  return 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds());
}

describe("useClock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("initial value matches Intl.DateTimeFormat of injected now", () => {
    const t0 = new Date(2024, 4, 1, 9, 7, 0, 0);
    const expected = clockFmt.format(t0);

    let time!: Ref<string>;

    const Comp = defineComponent({
      setup() {
        ({ time } = useClock(() => t0));
        return {};
      },
      template: "<span />",
    });

    const wrapper = mount(Comp);
    expect(time.value).toBe(expected);
    wrapper.unmount();
  });

  it("advances HH:MM at the next minute boundary", () => {
    const anchor = new Date(2026, 2, 1, 8, 15, 10, 0);
    let cur = anchor;

    let time!: Ref<string>;

    const Comp = defineComponent({
      setup() {
        ({ time } = useClock(() => cur));
        return {};
      },
      template: "<span />",
    });

    const wrapper = mount(Comp);
    expect(time.value).toBe(clockFmt.format(anchor));

    const ms = msUntilNextMinute(anchor);
    cur = new Date(anchor.getTime() + ms);
    vi.advanceTimersByTime(ms);

    expect(time.value).toBe(clockFmt.format(cur));
    wrapper.unmount();
  });

  it("does not schedule further ticks after unmount", () => {
    const anchor = new Date(2026, 8, 1, 21, 0, 58, 0);
    let cur = anchor;

    let leaked!: Ref<string>;

    const Child = defineComponent({
      setup() {
        ({ time: leaked } = useClock(() => cur));
        return {};
      },
      template: "<span />",
    });

    const wrapper = mount(Child);

    const ms = msUntilNextMinute(anchor);
    cur = new Date(anchor.getTime() + ms);
    vi.advanceTimersByTime(ms);

    const valueAfterMinuteRoll = leaked.value;

    wrapper.unmount();

    vi.advanceTimersByTime(10 * 60_000);
    vi.runOnlyPendingTimers();

    expect(leaked.value).toBe(valueAfterMinuteRoll);
  });
});
