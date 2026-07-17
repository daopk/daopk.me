import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { mountVaporRoot, type VaporMount } from "~/test/mountVapor";

import LunarDateWidget from "./LunarDateWidget.vue";

function mountAt(date: Date): VaporMount {
  vi.useFakeTimers();
  vi.setSystemTime(date);
  return mountVaporRoot(LunarDateWidget);
}

describe("LunarDateWidget", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("renders a known Vietnamese lunar date", () => {
    const wrapper = mountAt(new Date(2026, 1, 17, 9));

    expect(wrapper.find(".calendar-lunar-widget__day").textContent).toBe("1");
    expect(wrapper.find(".calendar-lunar-widget__month").textContent).toBe("Tháng 1");
    expect(wrapper.find(".calendar-lunar-widget__year").textContent).toBe("Bính Ngọ");
    expect(wrapper.find("time").getAttribute("datetime")).toBe("2026-02-17");

    wrapper.unmount();
  });

  it("refreshes at local midnight", async () => {
    const wrapper = mountAt(new Date(2026, 1, 17, 23, 59, 50));

    expect(wrapper.find(".calendar-lunar-widget__day").textContent).toBe("1");

    await vi.advanceTimersByTimeAsync(10_000);
    await nextTick();

    expect(wrapper.find("time").getAttribute("datetime")).toBe("2026-02-18");
    expect(wrapper.find(".calendar-lunar-widget__day").textContent).toBe("2");

    wrapper.unmount();
  });

  it("renders a safe fallback outside the supported lunar range", () => {
    const wrapper = mountAt(new Date(2101, 0, 1, 9));

    expect(wrapper.find(".calendar-lunar-widget__day").textContent).toBe("N/A");
    expect(wrapper.find(".calendar-lunar-widget__month").textContent).toBe("Unsupported date");
    expect(wrapper.find(".calendar-lunar-widget__year").textContent).toBe("Supported 1900-2100");

    wrapper.unmount();
  });
});
