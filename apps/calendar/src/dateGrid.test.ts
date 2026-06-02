import { describe, expect, it } from "vitest";

import { buildDayCell, buildMonthGrid, localDateKey, sameLocalDate } from "./dateGrid";

describe("calendar dateGrid", () => {
  it("builds full Monday-start weeks across month boundaries", () => {
    const grid = buildMonthGrid({
      month: new Date(2026, 4, 1),
      today: new Date(2026, 4, 26),
    });

    expect(grid).toHaveLength(35);
    expect(grid.length % 7).toBe(0);
    expect(grid[0]?.dateKey).toBe("2026-04-27");
    expect(grid.at(-1)?.dateKey).toBe("2026-05-31");
  });

  it("pads months that require six visible weeks", () => {
    const grid = buildMonthGrid({
      month: new Date(2026, 2, 1),
      today: new Date(2026, 2, 10),
    });

    expect(grid).toHaveLength(42);
    expect(grid[0]?.dateKey).toBe("2026-02-23");
    expect(grid.at(-1)?.dateKey).toBe("2026-04-05");
  });

  it("keeps leap-day February visible", () => {
    const grid = buildMonthGrid({
      month: new Date(2024, 1, 1),
      today: new Date(2024, 1, 1),
    });

    expect(grid.some((cell) => cell.dateKey === "2024-02-29" && cell.inCurrentMonth)).toBe(true);
  });

  it("adds Vietnamese lunar metadata to supported dates", () => {
    const grid = buildMonthGrid({
      month: new Date(2026, 1, 1),
      today: new Date(2026, 1, 1),
    });

    const tet = grid.find((candidate) => candidate.dateKey === "2026-02-17");
    expect(tet).toMatchObject({
      lunarDay: 1,
      lunarMonth: 1,
      lunarYear: 2026,
      isLeapMonth: false,
      lunarLabel: "Tháng 1",
      lunarLongLabel: "Âm lịch: 1 tháng 1, Bính Ngọ",
    });
  });

  it("hides Vietnamese lunar metadata outside the supported range", () => {
    const grid = buildMonthGrid({
      month: new Date(2101, 0, 1),
      today: new Date(2101, 0, 1),
    });

    const cell = grid.find((candidate) => candidate.dateKey === "2101-01-01");
    expect(cell).toMatchObject({
      lunarDay: null,
      lunarMonth: null,
      lunarYear: null,
      isLeapMonth: null,
      lunarLabel: null,
      lunarLongLabel: null,
    });
  });

  it("marks today and selected date by local date only", () => {
    const grid = buildMonthGrid({
      month: new Date(2026, 4, 1),
      selectedDate: new Date(2026, 4, 26, 23, 59),
      today: new Date(2026, 4, 26, 1, 5),
    });

    const cell = grid.find((candidate) => candidate.dateKey === "2026-05-26");
    expect(cell?.isToday).toBe(true);
    expect(cell?.isSelected).toBe(true);
    expect(sameLocalDate(new Date(2026, 4, 26, 1), new Date(2026, 4, 26, 23))).toBe(true);
    expect(localDateKey(new Date(2026, 4, 26))).toBe("2026-05-26");
  });

  it("builds a single day cell without requiring a full month grid", () => {
    const cell = buildDayCell({
      date: new Date(2026, 4, 31),
      month: new Date(2026, 5, 1),
      selectedDate: new Date(2026, 4, 31, 23, 59),
      today: new Date(2026, 4, 31, 1, 5),
    });

    expect(cell).toMatchObject({
      dateKey: "2026-05-31",
      dayOfMonth: 31,
      inCurrentMonth: false,
      isSelected: true,
      isToday: true,
    });
  });
});
