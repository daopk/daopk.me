import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import ClockApp from "./App.vue";

function findButtonByText(wrapper: VueWrapper, selector: string, text: string) {
  const button = wrapper
    .findAll(`${selector} button`)
    .find((candidate) => candidate.text() === text);
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

async function selectTab(wrapper: VueWrapper, label: string): Promise<void> {
  const tab = wrapper.findAll('[role="tab"]').find((candidate) => candidate.text() === label);
  if (!tab) {
    throw new Error(`Tab not found: ${label}`);
  }
  await tab.trigger("click");
}

describe("Clock App", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 14, 30, 0));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("renders Now first and switches tabs accessibly", async () => {
    const wrapper = mount(ClockApp);

    expect(wrapper.find("#clock-tab-now").attributes("aria-selected")).toBe("true");
    expect(wrapper.find("#clock-panel-now time").text()).toBe("14:30:00");

    await selectTab(wrapper, "Stopwatch");

    expect(wrapper.find("#clock-tab-stopwatch").attributes("aria-selected")).toBe("true");
    expect(wrapper.find("#clock-panel-stopwatch").attributes("aria-labelledby")).toBe(
      "clock-tab-stopwatch",
    );

    wrapper.unmount();
  });

  it("keeps the app title separate from tab navigation for mobile layout", () => {
    const wrapper = mount(ClockApp);
    const tablist = wrapper.find(".clock-app__topbar > [role='tablist']");

    expect(wrapper.find(".clock-app__header h2").text()).toBe("Clock");
    expect(wrapper.find(".clock-app__header [role='tablist']").exists()).toBe(false);
    expect(tablist.attributes("aria-label")).toBe("Clock sections");
    expect(tablist.findAll('[role="tab"]')).toHaveLength(3);

    wrapper.unmount();
  });

  it("clamps custom timer inputs", async () => {
    const wrapper = mount(ClockApp);
    await selectTab(wrapper, "Timer");

    await wrapper.find('input[aria-label="Timer hours"]').setValue("99");
    await wrapper.find('input[aria-label="Timer minutes"]').setValue("99");
    await wrapper.find('input[aria-label="Timer seconds"]').setValue("99");
    await nextTick();

    expect(wrapper.find("#clock-panel-timer .clock-app__readout time").text()).toBe("23:59:59");

    wrapper.unmount();
  });

  it("runs timer start, pause, and reset controls", async () => {
    const wrapper = mount(ClockApp);
    await selectTab(wrapper, "Timer");

    await wrapper.find('input[aria-label="Timer minutes"]').setValue("0");
    await wrapper.find('input[aria-label="Timer seconds"]').setValue("10");
    await findButtonByText(wrapper, "#clock-panel-timer", "Start").trigger("click");
    await vi.advanceTimersByTimeAsync(3_000);

    expect(wrapper.find("#clock-panel-timer .clock-app__readout time").text()).toBe("00:00:07");

    await findButtonByText(wrapper, "#clock-panel-timer", "Pause").trigger("click");
    await findButtonByText(wrapper, "#clock-panel-timer", "Reset").trigger("click");

    expect(wrapper.find("#clock-panel-timer .clock-app__readout time").text()).toBe("00:00:10");

    wrapper.unmount();
  });

  it("runs stopwatch lap and reset controls", async () => {
    const wrapper = mount(ClockApp);
    await selectTab(wrapper, "Stopwatch");

    await findButtonByText(wrapper, "#clock-panel-stopwatch", "Start").trigger("click");
    await vi.advanceTimersByTimeAsync(5_123);
    await findButtonByText(wrapper, "#clock-panel-stopwatch", "Lap").trigger("click");

    expect(wrapper.find("#clock-panel-stopwatch .clock-app__laps").text()).toContain("Lap 1");
    expect(wrapper.find("#clock-panel-stopwatch .clock-app__laps").text()).toContain(
      "00:00:05.123",
    );

    await findButtonByText(wrapper, "#clock-panel-stopwatch", "Reset").trigger("click");
    expect(wrapper.find("#clock-panel-stopwatch .clock-app__laps").exists()).toBe(false);

    wrapper.unmount();
  });

  it("exposes labelled controls for assistive tech", async () => {
    const wrapper = mount(ClockApp);

    expect(wrapper.find('[role="tablist"][aria-label="Clock sections"]').exists()).toBe(true);

    await selectTab(wrapper, "Timer");
    expect(wrapper.find('input[aria-label="Timer hours"]').exists()).toBe(true);
    expect(wrapper.find('input[aria-label="Timer minutes"]').exists()).toBe(true);
    expect(wrapper.find('input[aria-label="Timer seconds"]').exists()).toBe(true);

    wrapper.unmount();
  });
});
