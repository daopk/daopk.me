import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useCalendar } from "./useCalendar";

describe("useCalendar", () => {
  it("initializes the selected day, visible month, and month grid from today", () => {
    const calendar = useCalendar({ now: () => new Date(2026, 4, 26, 10, 15) });

    expect(calendar.selectedDateKey.value).toBe("2026-05-26");
    expect(calendar.visibleMonth.value).toEqual(new Date(2026, 4, 1));
    expect(calendar.monthGrid.value[0]?.dateKey).toBe("2026-04-27");
    expect(calendar.monthGrid.value.find((cell) => cell.dateKey === "2026-05-26")).toMatchObject({
      isSelected: true,
      isToday: true,
    });
  });

  it("selects valid dates and moves the visible month when needed", () => {
    const calendar = useCalendar({ now: () => new Date(2026, 4, 26, 10, 15) });

    calendar.selectDate("2026-05-27");
    expect(calendar.selectedDateKey.value).toBe("2026-05-27");
    expect(calendar.visibleMonth.value).toEqual(new Date(2026, 4, 1));

    calendar.selectDate("2026-06-02");
    expect(calendar.selectedDateKey.value).toBe("2026-06-02");
    expect(calendar.visibleMonth.value).toEqual(new Date(2026, 5, 1));

    calendar.selectDate("2026-06-99");
    expect(calendar.selectedDateKey.value).toBe("2026-06-02");
  });

  it("navigates months and returns to today", () => {
    const now = vi.fn(() => new Date(2026, 4, 26, 10, 15));
    const calendar = useCalendar({ now });

    calendar.goToNextMonth();
    expect(calendar.visibleMonth.value).toEqual(new Date(2026, 5, 1));

    calendar.goToPreviousMonth();
    calendar.goToPreviousMonth();
    expect(calendar.visibleMonth.value).toEqual(new Date(2026, 3, 1));

    now.mockReturnValue(new Date(2026, 7, 4, 9, 0));
    calendar.goToToday();

    expect(calendar.selectedDateKey.value).toBe("2026-08-04");
    expect(calendar.visibleMonth.value).toEqual(new Date(2026, 7, 1));
  });

  it("reacts to configured week starts when building the grid", () => {
    const weekStartsOn = ref<0 | 1>(0);
    const calendar = useCalendar({
      now: () => new Date(2026, 4, 26, 10, 15),
      weekStartsOn,
    });

    expect(calendar.monthGrid.value[0]?.dateKey).toBe("2026-04-26");

    weekStartsOn.value = 1;
    expect(calendar.monthGrid.value[0]?.dateKey).toBe("2026-04-27");
  });

  it("builds reactive month sections for the scrollable mobile view", () => {
    const weekStartsOn = ref<0 | 1>(0);
    const calendar = useCalendar({
      now: () => new Date(2026, 4, 26, 10, 15),
      weekStartsOn,
    });

    let section = calendar.monthSectionFor(new Date(2026, 4, 1));
    expect(section.monthKey).toBe("2026-05");
    expect(section.leadingOffset).toBe(5);
    expect(section.cells.find((cell) => cell.dateKey === "2026-05-26")).toMatchObject({
      isSelected: true,
      isToday: true,
    });

    calendar.selectDate("2026-05-27");
    weekStartsOn.value = 1;
    section = calendar.monthSectionFor(new Date(2026, 4, 1));

    expect(section.leadingOffset).toBe(4);
    expect(section.cells.find((cell) => cell.dateKey === "2026-05-26")?.isSelected).toBe(false);
    expect(section.cells.find((cell) => cell.dateKey === "2026-05-27")?.isSelected).toBe(true);
  });
});
