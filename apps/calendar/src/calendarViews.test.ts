import { describe, expect, it } from "vitest";

import {
  buildAgendaGroups,
  buildWeekCells,
  eventsForDate,
  initialCalendarViewMode,
  isCalendarPreferredViewMode,
  isCalendarViewMode,
} from "./calendarViews";
import type { CalendarEvent } from "./useCalendar";

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

describe("calendar view helpers", () => {
  it("guards supported view modes and preferred view modes", () => {
    expect(isCalendarViewMode("week")).toBe(true);
    expect(isCalendarViewMode("timeline")).toBe(false);
    expect(isCalendarPreferredViewMode("device")).toBe(true);
    expect(isCalendarPreferredViewMode("agenda")).toBe(true);
    expect(isCalendarPreferredViewMode("timeline")).toBe(false);
  });

  it("resolves device defaults and explicit preferred views", () => {
    expect(initialCalendarViewMode("device", true)).toBe("agenda");
    expect(initialCalendarViewMode("device", false)).toBe("month");
    expect(initialCalendarViewMode("week", true)).toBe("week");
    expect(initialCalendarViewMode("week", false)).toBe("week");
  });

  it("builds a Monday-start week around the selected date", () => {
    const cells = buildWeekCells({
      selectedDate: new Date(2026, 4, 28),
      today: new Date(2026, 4, 26),
    });

    expect(cells.map((cell) => cell.dateKey)).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
    ]);
    expect(cells[1]?.isToday).toBe(true);
    expect(cells[3]?.isSelected).toBe(true);
  });

  it("includes multi-day events on every date they occur", () => {
    const events = [
      makeEvent({
        id: "multi",
        title: "Conference",
        startAt: "2026-05-26T12:00",
        endAt: "2026-05-28T10:00",
      }),
    ];

    expect(eventsForDate(events, "2026-05-25")).toHaveLength(0);
    expect(eventsForDate(events, "2026-05-26")).toHaveLength(1);
    expect(eventsForDate(events, "2026-05-27")).toHaveLength(1);
    expect(eventsForDate(events, "2026-05-28")).toHaveLength(1);
  });

  it("groups agenda events from the selected date forward", () => {
    const groups = buildAgendaGroups({
      events: [
        makeEvent({ id: "today", title: "Today" }),
        makeEvent({
          id: "future",
          title: "Future",
          startAt: "2026-05-30T09:00",
          endAt: "2026-05-30T10:00",
        }),
      ],
      startDate: new Date(2026, 4, 26),
      today: new Date(2026, 4, 26),
    });

    expect(groups.map((group) => group.cell.dateKey)).toEqual(["2026-05-26", "2026-05-30"]);
    expect(groups[0]?.events[0]?.id).toBe("today");
    expect(groups[1]?.events[0]?.id).toBe("future");
  });
});
