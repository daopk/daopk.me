import { describe, expect, it } from "vitest";

import {
  formatVietnameseLunarLong,
  formatVietnameseLunarMonth,
  formatVietnameseLunarShort,
  formatVietnameseLunarYear,
  gregorianToVietnameseLunar,
} from "./vietnameseLunar";

describe("Vietnamese lunar calendar", () => {
  it("converts known Tet dates in Vietnam's UTC+7 lunar calendar", () => {
    expect(gregorianToVietnameseLunar(new Date(2024, 1, 10))).toEqual({
      day: 1,
      month: 1,
      year: 2024,
      isLeapMonth: false,
    });
    expect(gregorianToVietnameseLunar(new Date(2025, 0, 29))).toEqual({
      day: 1,
      month: 1,
      year: 2025,
      isLeapMonth: false,
    });
    expect(gregorianToVietnameseLunar(new Date(2026, 1, 17))).toEqual({
      day: 1,
      month: 1,
      year: 2026,
      isLeapMonth: false,
    });
  });

  it("marks a Vietnamese leap lunar month", () => {
    expect(gregorianToVietnameseLunar(new Date(2023, 2, 22))).toEqual({
      day: 1,
      month: 2,
      year: 2023,
      isLeapMonth: true,
    });
  });

  it("formats short grid labels and long detail labels", () => {
    const tet2026 = gregorianToVietnameseLunar(new Date(2026, 1, 17));
    expect(tet2026).not.toBeNull();

    expect(formatVietnameseLunarShort(tet2026!)).toBe("Tháng 1");
    expect(formatVietnameseLunarLong(tet2026!)).toBe("Âm lịch: 1 tháng 1, Bính Ngọ");
    expect(formatVietnameseLunarMonth(tet2026!)).toBe("Tháng 1");
    expect(formatVietnameseLunarYear(tet2026!)).toBe("Bính Ngọ");
    expect(formatVietnameseLunarShort({ day: 12, month: 4, year: 2026, isLeapMonth: false })).toBe(
      "12/4",
    );
    expect(formatVietnameseLunarMonth({ day: 1, month: 2, year: 2023, isLeapMonth: true })).toBe(
      "Tháng 2 nhuận",
    );
  });

  it("returns null outside the supported Gregorian year range", () => {
    expect(gregorianToVietnameseLunar(new Date(1899, 11, 31))).toBeNull();
    expect(gregorianToVietnameseLunar(new Date(2101, 0, 1))).toBeNull();
  });
});
