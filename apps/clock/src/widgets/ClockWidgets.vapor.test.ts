import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountVaporRoot } from "~/test/mountVapor";

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
    const wrapper = mountVaporRoot(MenubarClockWidget);
    const timeEl = wrapper.find<HTMLTimeElement>("time");

    expect(timeEl.textContent).toBe("14:30");
    expect(timeEl.getAttribute("datetime")).toBe("2026-05-15T14:30:00");
    wrapper.unmount();
  });

  it("renders the desktop clock with date context", () => {
    const wrapper = mountVaporRoot(DesktopBigClockWidget);

    expect(wrapper.find("time").textContent).toBe("14:30");
    expect(wrapper.find(".clock-desktop-widget__date").textContent).toContain("Friday");
    expect(wrapper.find(".clock-desktop-widget").getAttribute("aria-label")).toBe("Clock");
    wrapper.unmount();
  });

  it("renders the mobile clock as an accessible group", () => {
    const wrapper = mountVaporRoot(MobileBigClockWidget);
    const root = wrapper.find(".clock-mobile-widget");

    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-label")).toBe("Clock");
    expect(wrapper.find("time").textContent).toBe("14:30");
    expect(wrapper.find(".clock-mobile-widget__date").textContent).toContain("May");
    wrapper.unmount();
  });
});
