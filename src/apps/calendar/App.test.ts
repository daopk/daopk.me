import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VfsStat } from "~/core/vfs/nodes";
import { normalizeVfsPath } from "~/core/vfs/path";
import { AppContextInjectionKey, type AppContext } from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import App from "./App.vue";
import { CALENDAR_VIEW_STORAGE_KEY, type CalendarViewMode } from "./calendarViews";
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
  let now = 20;

  return {
    writes,
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

function mountCalendar(kernel: Kernel = makeKernel()) {
  return mount(App, {
    attachTo: document.body,
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
        [AppContextInjectionKey as symbol]: makeContext(),
      },
    },
  });
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
  sessionStorage.clear();
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
    expect(sessionStorage.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe("agenda");

    wrapper.unmount();
  });

  it("restores a valid stored view and ignores invalid stored views", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 26, 10, 15));

    sessionStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, "week");
    const first = mountCalendar(makeKernel());
    await flushPromises();

    expect(viewButton("week").getAttribute("aria-selected")).toBe("true");
    first.unmount();
    document.body.innerHTML = "";

    sessionStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, "timeline");
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
      sessionStorage.clear();
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
