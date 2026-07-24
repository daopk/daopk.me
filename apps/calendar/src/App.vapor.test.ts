import { afterEach, describe, expect, it, vi } from "vitest";

import { flushPromises, mountVaporRoot, type VaporMount } from "~/test/mountVapor";

import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  KernelInjectionKey,
  type AppChromeController,
  type AppContext,
  type Kernel,
} from "@daopk/sdk";

import App from "./App.vue";
import {
  CALENDAR_KV_NAMESPACE,
  CALENDAR_SETTINGS_KV_KEY,
  type CalendarSettingsState,
} from "./useCalendarSettings";

const CALENDAR_SETTINGS_STORAGE_KEY = `${CALENDAR_KV_NAMESPACE}:${CALENDAR_SETTINGS_KV_KEY}`;

function makeKernel(): Kernel {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const on = vi.fn((channel: string, listener: (payload: unknown) => void) => {
    const bucket = listeners.get(channel) ?? new Set<(payload: unknown) => void>();
    bucket.add(listener);
    listeners.set(channel, bucket);
    return (): void => {
      bucket.delete(listener);
    };
  });
  const emit = vi.fn((channel: string, payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  });

  return {
    events: {
      on,
      emit,
      once: vi.fn(),
      off: vi.fn(),
    },
  } as unknown as Kernel;
}

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "calendar",
    handleId: "calendar-handle",
    args: Object.freeze(args),
    isActive: () => true,
  });
}

function mountCalendar(
  kernel: Kernel = makeKernel(),
  options: {
    readonly args?: Readonly<Record<string, unknown>>;
    readonly appChrome?: AppChromeController;
  } = {},
): VaporMount {
  return mountVaporRoot(App, {
    provide: [
      [KernelInjectionKey, kernel],
      [AppContextInjectionKey, makeContext(options.args)],
      ...(options.appChrome === undefined
        ? []
        : ([[AppChromeInjectionKey, options.appChrome]] as const)),
    ],
  });
}

function defaultSettings(overrides: Partial<CalendarSettingsState> = {}): CalendarSettingsState {
  return {
    weekStartsOn: 1,
    showLunarCalendar: true,
    ...overrides,
  };
}

function persistSettings(
  overrides: Partial<CalendarSettingsState> & { readonly preferredViewMode?: string },
): void {
  localStorage.setItem(
    CALENDAR_SETTINGS_STORAGE_KEY,
    JSON.stringify({ __v: 1, data: defaultSettings(overrides) }),
  );
}

function readSettings(): CalendarSettingsState {
  const raw = localStorage.getItem(CALENDAR_SETTINGS_STORAGE_KEY);
  if (raw === null) {
    throw new Error("Calendar settings missing");
  }
  return (JSON.parse(raw) as { data: CalendarSettingsState }).data;
}

function textButton(label: string, index = 0): HTMLButtonElement {
  const matches = [...document.body.querySelectorAll("button")].filter(
    (button) => button.textContent?.trim() === label,
  );
  const button = matches[index];
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

function radioInput(label: string): HTMLInputElement {
  const radio = [...document.body.querySelectorAll('label:has(input[type="radio"])')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  const input = radio?.querySelector('input[type="radio"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Radio not found: ${label}`);
  }
  return input;
}

function dayButton(dateKey: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll("button")].find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith(dateKey),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Day button not found: ${dateKey}`);
  }

  return button;
}

function weekdayHeaderLabels(): string[] {
  return [...document.body.querySelectorAll(".calendar__weekdays span")].map(
    (label) => label.textContent?.trim() ?? "",
  );
}

function visibleMonthDateKeys(): string[] {
  return [...document.body.querySelectorAll(".calendar__grid .calendar__day")]
    .map((button) => button.getAttribute("aria-label")?.slice(0, 10))
    .filter((dateKey): dateKey is string => dateKey !== undefined);
}

function scrollMonthSections(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>(".calendar__scroll-month")];
}

function scrollMonthLabels(): string[] {
  return [...document.body.querySelectorAll(".calendar__scroll-month-heading")].map(
    (label) => label.textContent?.trim() ?? "",
  );
}

function scrollMonthKeys(): string[] {
  return scrollMonthSections()
    .map((section) => section.dataset.calendarMonth)
    .filter((monthKey): monthKey is string => monthKey !== undefined);
}

function monthHeading(label: string): HTMLElement {
  const heading = [
    ...document.body.querySelectorAll<HTMLElement>(".calendar__scroll-month-heading"),
  ].find((candidate) => candidate.textContent?.trim() === label);
  if (heading === undefined) {
    throw new Error(`Month heading not found: ${label}`);
  }

  return heading;
}

function scrollRoot(): HTMLElement {
  const root = document.body.querySelector(".calendar__surface");
  if (!(root instanceof HTMLElement)) {
    throw new Error("Calendar scroll root not found");
  }
  return root;
}

function expectNoViewSwitcher(): void {
  expect(document.body.querySelector(".calendar__view-switcher")).toBeNull();
  expect(document.body.querySelector('button[aria-label="Month view"]')).toBeNull();
  expect(document.body.querySelector('button[aria-label="Week view"]')).toBeNull();
  expect(document.body.querySelector('button[aria-label="Day view"]')).toBeNull();
}

function expectNoSidePanelOrSubtitle(): void {
  expect(document.body.querySelector(".calendar__selected-panel")).toBeNull();
  expect(document.body.querySelector(".ds-kit-toolbar-title__subtitle")).toBeNull();
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 820 });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  setViewportWidth(1024);
  document.body.innerHTML = "";
});

describe("Calendar App.vue", () => {
  it("renders a date-only month view without event controls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const wrapper = mountCalendar();

    await flushPromises();

    expect(wrapper.text()).toContain("May 2026");
    expect(dayButton("2026-05-26")).toBeInstanceOf(HTMLButtonElement);
    expect(document.body.querySelector(".calendar__new-button")).toBeNull();
    expect(document.body.querySelector('button[aria-label="Agenda view"]')).toBeNull();
    expectNoViewSwitcher();
    expectNoSidePanelOrSubtitle();
    expect(wrapper.text()).not.toContain("No events");
    expect(wrapper.text()).not.toContain("New event");

    wrapper.unmount();
  });

  it("renders Vietnamese lunar labels in the grid and date aria labels", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 17, 10, 15));
    const wrapper = mountCalendar();

    await flushPromises();

    expect(dayButton("2026-02-17").textContent).toContain("Tháng 1");
    expect(dayButton("2026-02-17").getAttribute("aria-label")).toContain(
      "Âm lịch: 1 tháng 1, Bính Ngọ",
    );
    expectNoSidePanelOrSubtitle();

    wrapper.unmount();
  });

  it("navigates previous, next, and today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const wrapper = mountCalendar();

    await flushPromises();
    const navigation = document.body.querySelector(".calendar__nav");
    expect(navigation?.getAttribute("role")).toBe("group");
    expect(navigation?.getAttribute("aria-label")).toBe("Calendar navigation");
    expect(navigation?.classList.contains("rp-button-group--attached")).toBe(true);
    expect(navigation?.querySelectorAll(":scope > .rp-button")).toHaveLength(3);

    await wrapper.click('button[aria-label="Next month"]');
    expect(wrapper.text()).toContain("June 2026");

    await wrapper.click('button[aria-label="Previous month"]');
    expect(wrapper.text()).toContain("May 2026");

    await wrapper.click('button[aria-label="Next month"]');
    textButton("Today").click();
    await flushPromises();
    expect(wrapper.text()).toContain("May 2026");

    wrapper.unmount();
  });

  it("does not render week or day view controls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const wrapper = mountCalendar();

    await flushPromises();

    expectNoViewSwitcher();
    expectNoSidePanelOrSubtitle();
    expect(wrapper.text()).toContain("May 2026");
    expect(document.body.querySelector('[aria-label="Month view"]')).toBeInstanceOf(HTMLElement);
    expect(document.body.querySelector('button[aria-label="Agenda view"]')).toBeNull();

    wrapper.unmount();
  });

  it("repairs legacy preferred views while preserving remaining settings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));

    persistSettings({ preferredViewMode: "week", weekStartsOn: 0, showLunarCalendar: false });
    const first = mountCalendar();
    await flushPromises();

    expectNoViewSwitcher();
    expectNoSidePanelOrSubtitle();
    expect(first.text()).toContain("May 2026");
    expect(readSettings()).toEqual({
      weekStartsOn: 0,
      showLunarCalendar: false,
    });
    first.unmount();
    document.body.innerHTML = "";

    localStorage.setItem(
      CALENDAR_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          ...defaultSettings(),
          preferredViewMode: "day",
          agendaDayCount: 14,
          defaultEventDurationMinutes: 90,
          defaultEventColor: "purple",
        },
      }),
    );
    const second = mountCalendar();
    await flushPromises();

    expectNoViewSwitcher();
    expectNoSidePanelOrSubtitle();
    expect(second.text()).toContain("May 2026");
    expect(readSettings()).toEqual(defaultSettings());
    second.unmount();
  });

  it("renders month-only calendar on mobile", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    setViewportWidth(375);
    const wrapper = mountCalendar();

    await flushPromises();

    expectNoViewSwitcher();
    expectNoSidePanelOrSubtitle();
    expect(dayButton("2026-05-26")).toBeInstanceOf(HTMLButtonElement);
    expect(scrollMonthSections()).toHaveLength(37);
    expect(scrollMonthLabels()[0]).toBe("Nov 2024");
    expect(scrollMonthLabels().at(-1)).toBe("Nov 2027");
    expect(monthHeading("Nov 2024").style.gridColumn).toBe("4 / span 3");
    expect(monthHeading("Nov 2024").style.justifySelf).toBe("center");
    expect(monthHeading("Dec 2024").style.gridColumn).toBe("6 / span 2");
    expect(monthHeading("Dec 2024").style.justifySelf).toBe("end");
    expect(monthHeading("Sep 2025").style.gridColumn).toBe("1 / span 2");
    expect(monthHeading("Sep 2025").style.justifySelf).toBe("start");
    expect(document.body.querySelector(".calendar__month-panel")).toBeNull();
    expect(document.body.querySelector('button[aria-label="Agenda view"]')).toBeNull();

    wrapper.unmount();
  });

  it("selects a day in the mobile scrollable month list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    setViewportWidth(375);
    const wrapper = mountCalendar();

    await flushPromises();
    expect(dayButton("2026-05-26").getAttribute("aria-selected")).toBe("true");

    dayButton("2026-06-02").click();
    await flushPromises();

    expect(dayButton("2026-05-26").getAttribute("aria-selected")).toBe("false");
    expect(dayButton("2026-06-02").getAttribute("aria-selected")).toBe("true");
    expect(dayButton("2026-06-02").classList.contains("calendar__day--selected")).toBe(true);
    expect(document.body.querySelector('[data-calendar-month="2026-06"]')).toBeInstanceOf(
      HTMLElement,
    );

    wrapper.unmount();
  });

  it("caps mobile scrollable months while extending in either direction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    setViewportWidth(375);
    const wrapper = mountCalendar();

    await flushPromises();
    const root = scrollRoot();
    Object.defineProperties(root, {
      clientHeight: { configurable: true, value: 820 },
      scrollHeight: { configurable: true, value: 10_000 },
    });

    root.scrollTop = 9_400;
    root.dispatchEvent(new Event("scroll"));
    await flushPromises();
    root.dispatchEvent(new Event("scroll"));
    await flushPromises();

    expect(scrollMonthSections()).toHaveLength(60);
    expect(scrollMonthKeys()[0]).toBe("2025-12");
    expect(scrollMonthKeys().at(-1)).toBe("2030-11");

    root.scrollTop = 0;
    root.dispatchEvent(new Event("scroll"));
    await flushPromises();
    root.dispatchEvent(new Event("scroll"));
    await flushPromises();

    expect(scrollMonthSections()).toHaveLength(60);
    expect(scrollMonthKeys()[0]).toBe("2022-12");
    expect(scrollMonthKeys().at(-1)).toBe("2027-11");

    wrapper.unmount();
  });

  it("opens Calendar settings from an app settings request and returns to Calendar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const kernel = makeKernel();
    const wrapper = mountCalendar(kernel);

    await flushPromises();
    kernel.events.emit("app.settings.requested", {
      manifestId: "calendar",
      handleId: "calendar-handle",
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Calendar settings");
    expect(wrapper.text()).not.toContain("View");
    expectNoViewSwitcher();
    expect(document.body.querySelector(".calendar__selected-panel")).toBeNull();

    textButton("Back").click();
    await flushPromises();

    expect(wrapper.text()).toContain("May 2026");
    expectNoViewSwitcher();
    expectNoSidePanelOrSubtitle();

    wrapper.unmount();
  });

  it("opens Calendar settings from app args and uses mobile chrome back", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    setViewportWidth(375);

    let backAction: Parameters<AppChromeController["setBackAction"]>[0] = null;
    const appChrome: AppChromeController = {
      setTitle: vi.fn(),
      setBackAction: vi.fn((action) => {
        backAction = action;
      }),
    };
    const wrapper = mountCalendar(makeKernel(), {
      args: { pane: "settings" },
      appChrome,
    });

    await flushPromises();

    expect(wrapper.exists(".calendar-settings__header")).toBe(false);
    expect(appChrome.setTitle).toHaveBeenLastCalledWith("Calendar settings");
    expect(backAction?.ariaLabel).toBe("Back to Calendar");

    backAction?.handler();
    await flushPromises();

    expect(dayButton("2026-05-26")).toBeInstanceOf(HTMLButtonElement);
    expectNoViewSwitcher();
    expectNoSidePanelOrSubtitle();
    expect(appChrome.setTitle).toHaveBeenLastCalledWith(null);

    wrapper.unmount();
  });

  it("applies Calendar settings to labels and grid layout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 17, 10, 15));
    const kernel = makeKernel();
    const wrapper = mountCalendar(kernel);

    await flushPromises();
    expect(dayButton("2026-02-17").textContent).toContain("Tháng 1");
    expect(weekdayHeaderLabels()).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

    kernel.events.emit("app.settings.requested", {
      manifestId: "calendar",
      handleId: "calendar-handle",
    });
    await flushPromises();
    radioInput("Sunday").click();
    document.body
      .querySelector<HTMLInputElement>('[role="switch"][aria-label="Hide lunar labels"]')
      ?.click();
    textButton("Back").click();
    await flushPromises();

    expect(dayButton("2026-02-01")).toBeInstanceOf(HTMLButtonElement);
    expect(weekdayHeaderLabels()).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(visibleMonthDateKeys()[0]).toBe("2026-02-01");
    expect(dayButton("2026-02-17").textContent).not.toContain("Tháng 1");
    expect(readSettings()).toMatchObject({
      weekStartsOn: 0,
      showLunarCalendar: false,
    });

    wrapper.unmount();
  });

  it("selects a day and reflects it in the month grid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const wrapper = mountCalendar();

    await flushPromises();
    expect(dayButton("2026-05-26").getAttribute("aria-selected")).toBe("true");
    dayButton("2026-05-27").click();
    await flushPromises();

    expect(dayButton("2026-05-26").getAttribute("aria-selected")).toBe("false");
    expect(dayButton("2026-05-27").getAttribute("aria-selected")).toBe("true");
    expect(dayButton("2026-05-27").classList.contains("calendar__day--selected")).toBe(true);
    expectNoViewSwitcher();
    expectNoSidePanelOrSubtitle();
    expect(wrapper.text()).not.toContain("No events");

    wrapper.unmount();
  });
});
