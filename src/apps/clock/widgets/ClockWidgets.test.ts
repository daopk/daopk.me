import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DesktopBigClockWidget from "./DesktopBigClockWidget.vue";
import MenubarClockWidget from "./MenubarClockWidget.vue";
import MobileBigClockWidget from "./MobileBigClockWidget.vue";

describe("Clock widgets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 14, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the menubar clock as a compact <time>", () => {
    const wrapper = mount(MenubarClockWidget);
    const timeEl = wrapper.find("time");

    expect(timeEl.exists()).toBe(true);
    expect(timeEl.text()).toBe("14:30");
    expect(timeEl.attributes("datetime")).toBe("2026-05-15T14:30:00");
    wrapper.unmount();
  });

  it("renders the desktop clock with date context", () => {
    const wrapper = mount(DesktopBigClockWidget);

    expect(wrapper.find("time").text()).toBe("14:30");
    expect(wrapper.find(".clock-desktop-widget__date").text()).toContain("Friday");
    expect(wrapper.find(".clock-desktop-widget").attributes("aria-label")).toBe("Clock");
    wrapper.unmount();
  });

  it("renders the mobile clock as an accessible group", () => {
    const wrapper = mount(MobileBigClockWidget);
    const root = wrapper.find(".clock-mobile-widget");

    expect(root.attributes("role")).toBe("group");
    expect(root.attributes("aria-label")).toBe("Clock");
    expect(wrapper.find("time").text()).toBe("14:30");
    expect(wrapper.find(".clock-mobile-widget__date").text()).toContain("May");
    wrapper.unmount();
  });
});
