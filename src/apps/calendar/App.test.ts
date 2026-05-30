import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VfsStat } from "~/core/vfs/nodes";
import { normalizeVfsPath } from "~/core/vfs/path";
import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  type AppChromeController,
  type AppContext,
} from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import App from "./App.vue";
import type { CalendarViewMode } from "./calendarViews";
import {
  CALENDAR_KV_NAMESPACE,
  CALENDAR_SETTINGS_KV_KEY,
  type CalendarSettingsState,
} from "./useCalendarSettings";
import {
  CALENDAR_FILE_PATH,
  CALENDAR_MIME_TYPE,
  CALENDAR_ROOT,
  type CalendarEvent,
  serializeCalendar,
} from "./useCalendar";

interface FakeNode {
  kind: "file" | "directory";
  text?: string;
  mimeType?: string;
  updatedAt?: number;
}

interface FakeKernel extends Kernel {
  readonly writes: Array<{ path: string; text: string; options: Record<string, unknown> }>;
}

const CALENDAR_SETTINGS_STORAGE_KEY = `${CALENDAR_KV_NAMESPACE}:${CALENDAR_SETTINGS_KV_KEY}`;

function stat(path: string, node: FakeNode): VfsStat {
  const normalized = normalizeVfsPath(path);
  return {
    path: normalized,
    kind: node.kind,
    size: node.text?.length ?? 0,
    createdAt: node.updatedAt ?? 0,
    updatedAt: node.updatedAt ?? 0,
    readonly: false,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function makeKernel(seed: Record<string, FakeNode> = {}): FakeKernel {
  const nodes: Record<string, FakeNode> = { ...seed };
  const writes: FakeKernel["writes"] = [];
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
  let now = 20;

  return {
    writes,
    events: {
      on,
      emit,
      once: vi.fn(),
      off: vi.fn(),
    },
    vfs: {
      stat: vi.fn(async (path: string) => stat(path, nodes[normalizeVfsPath(path)]!)),
      list: vi.fn(async () => []),
      read: vi.fn(async () => null),
      readText: vi.fn(async (path: string) => nodes[normalizeVfsPath(path)]?.text ?? null),
      write: vi.fn(async () => null),
      writeText: vi.fn(
        async (
          path: string,
          text: string,
          options: { handleId?: string; overwrite?: boolean; mimeType?: string } = {},
        ) => {
          const normalized = normalizeVfsPath(path);
          writes.push({ path: normalized, text, options });
          nodes[normalized] = {
            kind: "file",
            text,
            updatedAt: ++now,
            ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
          };
          return stat(normalized, nodes[normalized]!);
        },
      ),
      mkdir: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        nodes[normalized] ??= { kind: "directory", updatedAt: ++now };
        return stat(normalized, nodes[normalized]!);
      }),
      remove: vi.fn(async () => false),
    },
  } as unknown as FakeKernel;
}

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "calendar",
    handleId: "calendar-handle",
    args: Object.freeze(args),
  });
}

function mountCalendar(
  kernel: Kernel = makeKernel(),
  options: {
    readonly args?: Readonly<Record<string, unknown>>;
    readonly appChrome?: AppChromeController;
  } = {},
) {
  const provide: Record<symbol, unknown> = {
    [KernelInjectionKey as symbol]: kernel,
    [AppContextInjectionKey as symbol]: makeContext(options.args),
  };

  if (options.appChrome !== undefined) {
    provide[AppChromeInjectionKey as symbol] = options.appChrome;
  }

  return mount(App, {
    attachTo: document.body,
    global: {
      provide,
    },
  });
}

function defaultSettings(overrides: Partial<CalendarSettingsState> = {}): CalendarSettingsState {
  return {
    preferredViewMode: "device",
    weekStartsOn: 1,
    agendaDayCount: 7,
    showLunarCalendar: true,
    defaultEventDurationMinutes: 60,
    defaultEventColor: "blue",
    ...overrides,
  };
}

function persistSettings(overrides: Partial<CalendarSettingsState>): void {
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

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-a",
    title: "Planning",
    startAt: "2026-05-26T09:00",
    endAt: "2026-05-26T10:00",
    allDay: false,
    notes: "",
    color: "blue",
    createdAt: "2026-05-26T08:00",
    updatedAt: "2026-05-26T08:00",
    ...overrides,
  };
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

function dayButton(dateKey: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll("button")].find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith(dateKey),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Day button not found: ${dateKey}`);
  }

  return button;
}

function viewButton(view: CalendarViewMode): HTMLButtonElement {
  const label = `${view[0]!.toUpperCase()}${view.slice(1)} view`;
  const button = document.body.querySelector(`button[aria-label="${label}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`View button not found: ${label}`);
  }

  return button;
}

function toolbarNewButton(): HTMLButtonElement {
  const button = document.body.querySelector(".calendar__new-button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Toolbar New button not found");
  }

  return button;
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 820 });
  window.dispatchEvent(new Event("resize"));
}

async function setField(selector: string, value: string, eventName = "input"): Promise<void> {
  const field = document.body.querySelector(selector);
  if (
    !(
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    )
  ) {
    throw new Error(`Field not found: ${selector}`);
  }

  field.value = value;
  field.dispatchEvent(new Event(eventName, { bubbles: true }));
  await flushPromises();
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  setViewportWidth(1024);
  document.body.innerHTML = "";
});

describe("Calendar App.vue", () => {
  it("renders the empty state and New button", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const wrapper = mountCalendar(makeKernel({ [CALENDAR_ROOT]: { kind: "directory" } }));

    await flushPromises();

    expect(wrapper.text()).toContain("May 2026");
    expect(wrapper.text()).toContain("No events.");
    expect(
      [...document.body.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("New"),
      ),
    ).toBe(true);

    wrapper.unmount();
  });

  it("renders Vietnamese lunar labels in the grid and agenda", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 17, 10, 15));
    const wrapper = mountCalendar(makeKernel({ [CALENDAR_ROOT]: { kind: "directory" } }));

    await flushPromises();

    expect(dayButton("2026-02-17").textContent).toContain("Tháng 1");
    expect(wrapper.find(".calendar__agenda-lunar").text()).toBe("Âm lịch: 1 tháng 1, Bính Ngọ");
    expect(dayButton("2026-02-17").getAttribute("aria-label")).toContain(
      "Âm lịch: 1 tháng 1, Bính Ngọ",
    );

    wrapper.unmount();
  });

  it("navigates previous, next, and today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const wrapper = mountCalendar(makeKernel());

    await flushPromises();
    await wrapper.find('button[aria-label="Next month"]').trigger("click");
    expect(wrapper.text()).toContain("June 2026");

    await wrapper.find('button[aria-label="Previous month"]').trigger("click");
    expect(wrapper.text()).toContain("May 2026");

    await wrapper.find('button[aria-label="Next month"]').trigger("click");
    textButton("Today").click();
    await flushPromises();
    expect(wrapper.text()).toContain("May 2026");

    wrapper.unmount();
  });

  it("renders the multi-view switcher and persists the selected view", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const wrapper = mountCalendar(makeKernel());

    await flushPromises();

    expect(viewButton("month").getAttribute("aria-selected")).toBe("true");

    await viewButton("week").click();
    await flushPromises();
    expect(viewButton("week").getAttribute("aria-selected")).toBe("true");

    await viewButton("day").click();
    await flushPromises();
    expect(viewButton("day").getAttribute("aria-selected")).toBe("true");

    await viewButton("agenda").click();
    await flushPromises();

    expect(viewButton("agenda").getAttribute("aria-selected")).toBe("true");
    expect(readSettings().preferredViewMode).toBe("agenda");

    wrapper.unmount();
  });

  it("restores a valid preferred view and ignores invalid preferred views", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));

    persistSettings({ preferredViewMode: "week" });
    const first = mountCalendar(makeKernel());
    await flushPromises();

    expect(viewButton("week").getAttribute("aria-selected")).toBe("true");
    first.unmount();
    document.body.innerHTML = "";

    localStorage.setItem(
      CALENDAR_SETTINGS_STORAGE_KEY,
      JSON.stringify({ __v: 1, data: { ...defaultSettings(), preferredViewMode: "timeline" } }),
    );
    const second = mountCalendar(makeKernel());
    await flushPromises();

    expect(viewButton("month").getAttribute("aria-selected")).toBe("true");
    second.unmount();
  });

  it("defaults to agenda on mobile when no stored view exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    setViewportWidth(375);
    const wrapper = mountCalendar(makeKernel());

    await flushPromises();

    expect(viewButton("agenda").getAttribute("aria-selected")).toBe("true");
    expect(wrapper.text()).toContain("No events in this range.");

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
    expect(wrapper.find(".calendar__view-switcher").exists()).toBe(false);

    textButton("Back").click();
    await flushPromises();

    expect(wrapper.text()).toContain("May 2026");
    expect(wrapper.find(".calendar__view-switcher").exists()).toBe(true);

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

    expect(wrapper.text()).toContain("Calendar settings");
    expect(appChrome.setTitle).toHaveBeenLastCalledWith("Calendar settings");
    expect(backAction?.ariaLabel).toBe("Back to Calendar");

    backAction?.handler();
    await flushPromises();

    expect(viewButton("agenda").getAttribute("aria-selected")).toBe("true");
    expect(appChrome.setTitle).toHaveBeenLastCalledWith(null);

    wrapper.unmount();
  });

  it("applies Calendar settings to labels, grid, agenda range, and new event defaults", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 17, 10, 15));
    const kernel = makeKernel({
      [CALENDAR_ROOT]: { kind: "directory" },
      [CALENDAR_FILE_PATH]: {
        kind: "file",
        text: serializeCalendar([
          makeEvent({
            id: "future-range",
            title: "Future range",
            startAt: "2026-03-01T09:00",
            endAt: "2026-03-01T10:00",
          }),
        ]),
        mimeType: CALENDAR_MIME_TYPE,
      },
    });
    const wrapper = mountCalendar(kernel);

    await flushPromises();
    expect(dayButton("2026-02-17").textContent).toContain("Tháng 1");

    kernel.events.emit("app.settings.requested", {
      manifestId: "calendar",
      handleId: "calendar-handle",
    });
    await flushPromises();
    textButton("Sunday").click();
    textButton("14 days").click();
    textButton("90m").click();
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Purple"]')?.click();
    document.body
      .querySelector<HTMLButtonElement>('button[aria-label="Hide lunar labels"]')
      ?.click();
    textButton("Back").click();
    await flushPromises();

    expect(dayButton("2026-02-01")).toBeInstanceOf(HTMLButtonElement);
    expect(dayButton("2026-02-17").textContent).not.toContain("Tháng 1");

    await viewButton("agenda").click();
    await flushPromises();
    expect(wrapper.text()).toContain("Future range");

    toolbarNewButton().click();
    await flushPromises();
    const timeInputs = [...document.body.querySelectorAll('input[type="time"]')];
    expect((timeInputs[0] as HTMLInputElement | undefined)?.value).toBe("11:00");
    expect((timeInputs[1] as HTMLInputElement | undefined)?.value).toBe("12:30");
    expect(document.body.querySelector<HTMLSelectElement>("select")?.value).toBe("purple");

    expect(readSettings()).toMatchObject({
      weekStartsOn: 0,
      agendaDayCount: 14,
      showLunarCalendar: false,
      defaultEventDurationMinutes: 90,
      defaultEventColor: "purple",
      preferredViewMode: "agenda",
    });

    wrapper.unmount();
  });

  it("selects a day and shows its events in the agenda", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const kernel = makeKernel({
      [CALENDAR_ROOT]: { kind: "directory" },
      [CALENDAR_FILE_PATH]: {
        kind: "file",
        text: serializeCalendar([
          makeEvent({
            id: "event-next-day",
            title: "Next day agenda",
            startAt: "2026-05-27T13:00",
            endAt: "2026-05-27T14:00",
          }),
        ]),
        mimeType: CALENDAR_MIME_TYPE,
      },
    });
    const wrapper = mountCalendar(kernel);

    await flushPromises();
    expect(wrapper.find(".calendar__event-button").exists()).toBe(false);

    dayButton("2026-05-27").click();
    await flushPromises();

    expect(wrapper.find(".calendar__event-button").text()).toContain("Next day agenda");

    wrapper.unmount();
  });

  it("renders multi-day events across week, day, and agenda views", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const kernel = makeKernel({
      [CALENDAR_ROOT]: { kind: "directory" },
      [CALENDAR_FILE_PATH]: {
        kind: "file",
        text: serializeCalendar([
          makeEvent({
            id: "multi-day",
            title: "Conference",
            startAt: "2026-05-26T12:00",
            endAt: "2026-05-28T10:00",
          }),
          makeEvent({
            id: "future",
            title: "Future planning",
            startAt: "2026-05-30T09:00",
            endAt: "2026-05-30T10:00",
          }),
        ]),
        mimeType: CALENDAR_MIME_TYPE,
      },
    });
    const wrapper = mountCalendar(kernel);

    await flushPromises();
    await viewButton("week").click();
    await flushPromises();

    const weekButtons = [
      ...document.body.querySelectorAll(".calendar__week-day-events .calendar__event-button"),
    ];
    expect(weekButtons.filter((button) => button.textContent?.includes("Conference"))).toHaveLength(
      3,
    );

    await viewButton("day").click();
    await flushPromises();
    expect(document.body.querySelector(".calendar__event-button")?.textContent).toContain(
      "Conference",
    );

    await viewButton("agenda").click();
    await flushPromises();
    expect(wrapper.text()).toContain("Conference");
    expect(wrapper.text()).toContain("Future planning");

    wrapper.unmount();
  });

  it("creates an event through the dialog", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const kernel = makeKernel();
    const wrapper = mountCalendar(kernel);

    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "New")!
      .trigger("click");
    await flushPromises();
    await setField('input[type="text"]', "Created from test");
    textButton("Save").click();
    await flushPromises();

    expect(wrapper.text()).toContain("Created from test");
    expect(JSON.parse(kernel.writes.at(-1)!.text)).toMatchObject({
      version: 1,
      events: [{ title: "Created from test", startAt: "2026-05-26T11:00" }],
    });

    wrapper.unmount();
  });

  it("creates events from non-month views through the shared toolbar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));

    for (const view of ["week", "day", "agenda"] as const) {
      const kernel = makeKernel();
      const wrapper = mountCalendar(kernel);

      await flushPromises();
      await viewButton(view).click();
      toolbarNewButton().click();
      await flushPromises();
      await setField('input[type="text"]', `Created from ${view}`);
      textButton("Save").click();
      await flushPromises();

      expect(JSON.parse(kernel.writes.at(-1)!.text)).toMatchObject({
        events: [{ title: `Created from ${view}` }],
      });

      wrapper.unmount();
      document.body.innerHTML = "";
      localStorage.clear();
    }
  });

  it("edits and deletes an event through the dialog", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));
    const kernel = makeKernel({
      [CALENDAR_ROOT]: { kind: "directory" },
      [CALENDAR_FILE_PATH]: {
        kind: "file",
        text: serializeCalendar([makeEvent({ id: "event-edit", title: "Original title" })]),
        mimeType: CALENDAR_MIME_TYPE,
      },
    });
    const wrapper = mountCalendar(kernel);

    await flushPromises();
    await wrapper.find(".calendar__event-button").trigger("click");
    await flushPromises();
    await setField('input[type="text"]', "Updated title");
    textButton("Save").click();
    await flushPromises();

    expect(wrapper.text()).toContain("Updated title");
    expect(JSON.parse(kernel.writes.at(-1)!.text)).toMatchObject({
      events: [{ id: "event-edit", title: "Updated title" }],
    });

    const eventButton = document.body.querySelector(".calendar__event-button");
    expect(eventButton).toBeInstanceOf(HTMLButtonElement);
    (eventButton as HTMLButtonElement).click();
    await flushPromises();
    textButton("Delete").click();
    await flushPromises();
    textButton("Delete").click();
    await flushPromises();

    expect(JSON.parse(kernel.writes.at(-1)!.text)).toMatchObject({ version: 1, events: [] });
    expect(wrapper.find(".calendar__event-button").exists()).toBe(false);

    wrapper.unmount();
  });

  it("uses modal dialogs on desktop and sheet dialogs on mobile", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));

    const desktop = mountCalendar(makeKernel());
    await flushPromises();
    toolbarNewButton().click();
    await flushPromises();

    expect(document.body.querySelector(".ds-dialog__content--modal")).toBeInstanceOf(HTMLElement);
    desktop.unmount();
    document.body.innerHTML = "";

    setViewportWidth(375);
    const mobile = mountCalendar(makeKernel());
    await flushPromises();
    toolbarNewButton().click();
    await flushPromises();

    expect(document.body.querySelector(".ds-dialog__content--sheet")).toBeInstanceOf(HTMLElement);
    mobile.unmount();
  });
});
