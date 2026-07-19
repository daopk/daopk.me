import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { mountVaporRoot, type VaporMount } from "~/test/mountVapor";

import ClockApp from "./App.vue";

const mounted: VaporMount[] = [];

function mountClockApp(): VaporMount {
  const wrapper = mountVaporRoot(ClockApp);
  mounted.push(wrapper);
  return wrapper;
}

function elementText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function findButtonByText(wrapper: VaporMount, selector: string, text: string): HTMLButtonElement {
  const button = wrapper
    .findAll<HTMLButtonElement>(`${selector} button`)
    .find((candidate) => elementText(candidate) === text);
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

async function click(element: HTMLElement): Promise<void> {
  element.click();
  await nextTick();
}

async function selectTab(wrapper: VaporMount, label: string): Promise<void> {
  const tab = wrapper
    .findAll<HTMLElement>('[role="tab"]')
    .find((candidate) => elementText(candidate) === label);
  if (!tab) {
    throw new Error(`Tab not found: ${label}`);
  }
  await click(tab);
}

describe("Clock App", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 14, 30, 0));
    localStorage.clear();
  });

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
      wrapper.unmount();
    }
    vi.useRealTimers();
    localStorage.clear();
  });

  it("renders Now first and switches tabs accessibly", async () => {
    const wrapper = mountClockApp();
    await nextTick();

    expect(wrapper.find("#clock-tab-now").getAttribute("aria-selected")).toBe("true");
    expect(wrapper.find("#clock-tab-now").getAttribute("aria-controls")).toBe("clock-panel-now");
    expect(elementText(wrapper.find("#clock-panel-now time"))).toBe("14:30:00");
    expect(wrapper.find("#clock-panel-now").hasAttribute("hidden")).toBe(false);
    expect(wrapper.find("#clock-panel-stopwatch").hasAttribute("hidden")).toBe(true);

    await selectTab(wrapper, "Stopwatch");

    expect(wrapper.find("#clock-tab-stopwatch").getAttribute("aria-selected")).toBe("true");
    expect(wrapper.find("#clock-panel-stopwatch").getAttribute("aria-labelledby")).toBe(
      "clock-tab-stopwatch",
    );
    expect(wrapper.find("#clock-panel-now").hasAttribute("hidden")).toBe(true);
    expect(wrapper.find("#clock-panel-stopwatch").hasAttribute("hidden")).toBe(false);
  });

  it("keeps tab navigation in the topbar without duplicating the app title", () => {
    const wrapper = mountClockApp();
    const tablist = wrapper.find(".clock-app__topbar [role='tablist']");

    expect(wrapper.exists(".clock-app__header")).toBe(false);
    expect(tablist.getAttribute("aria-label")).toBe("Clock sections");
    expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });

  it("clamps custom timer inputs", async () => {
    const wrapper = mountClockApp();
    await selectTab(wrapper, "Timer");

    await wrapper.setValue('input[aria-label="Timer hours"]', "99");
    await wrapper.setValue('input[aria-label="Timer minutes"]', "99");
    await wrapper.setValue('input[aria-label="Timer seconds"]', "99");
    await nextTick();

    expect(elementText(wrapper.find("#clock-panel-timer .clock-app__readout time"))).toBe(
      "23:59:59",
    );
  });

  it("runs timer start, pause, and reset controls", async () => {
    const wrapper = mountClockApp();
    await selectTab(wrapper, "Timer");

    await wrapper.setValue('input[aria-label="Timer minutes"]', "0");
    await wrapper.setValue('input[aria-label="Timer seconds"]', "10");
    await click(findButtonByText(wrapper, "#clock-panel-timer", "Start"));
    await vi.advanceTimersByTimeAsync(3_000);
    await nextTick();

    expect(elementText(wrapper.find("#clock-panel-timer .clock-app__readout time"))).toBe(
      "00:00:07",
    );

    await click(findButtonByText(wrapper, "#clock-panel-timer", "Pause"));
    await click(findButtonByText(wrapper, "#clock-panel-timer", "Reset"));

    expect(elementText(wrapper.find("#clock-panel-timer .clock-app__readout time"))).toBe(
      "00:00:10",
    );
  });

  it("runs stopwatch lap and reset controls", async () => {
    const wrapper = mountClockApp();
    await selectTab(wrapper, "Stopwatch");

    await click(findButtonByText(wrapper, "#clock-panel-stopwatch", "Start"));
    await vi.advanceTimersByTimeAsync(5_123);
    await click(findButtonByText(wrapper, "#clock-panel-stopwatch", "Lap"));

    const laps = wrapper.find("#clock-panel-stopwatch .clock-app__laps");
    expect(elementText(laps)).toContain("Lap 1");
    expect(elementText(laps)).toContain("00:00:05.123");

    await click(findButtonByText(wrapper, "#clock-panel-stopwatch", "Reset"));
    expect(wrapper.exists("#clock-panel-stopwatch .clock-app__laps")).toBe(false);
  });

  it("exposes labelled controls for assistive tech", async () => {
    const wrapper = mountClockApp();

    expect(wrapper.exists('[role="tablist"][aria-label="Clock sections"]')).toBe(true);

    await selectTab(wrapper, "Timer");
    expect(wrapper.exists('input[aria-label="Timer hours"]')).toBe(true);
    expect(wrapper.exists('input[aria-label="Timer minutes"]')).toBe(true);
    expect(wrapper.exists('input[aria-label="Timer seconds"]')).toBe(true);
  });

  it("sizes action button icons relative to the button text", async () => {
    const wrapper = mountClockApp();

    await selectTab(wrapper, "Timer");
    await selectTab(wrapper, "Stopwatch");

    const icons = wrapper.findAll<SVGElement>(".clock-app__controls svg");
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.getAttribute("width")).toBe("1em");
      expect(icon.getAttribute("height")).toBe("1em");
    }
  });
});
