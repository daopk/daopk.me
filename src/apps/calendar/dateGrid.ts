import {
  formatVietnameseLunarLong,
  formatVietnameseLunarShort,
  gregorianToVietnameseLunar,
} from "./vietnameseLunar";

export interface CalendarDayCell {
  readonly date: Date;
  readonly dateKey: string;
  readonly dayOfMonth: number;
  readonly inCurrentMonth: boolean;
  readonly isSelected: boolean;
  readonly isToday: boolean;
  readonly lunarDay: number | null;
  readonly lunarMonth: number | null;
  readonly lunarYear: number | null;
  readonly isLeapMonth: boolean | null;
  readonly lunarLabel: string | null;
  readonly lunarLongLabel: string | null;
}

export interface BuildMonthGridOptions {
  readonly month: Date;
  readonly selectedDate?: Date;
  readonly today?: Date;
  readonly weekStartsOn?: number;
}

const DEFAULT_WEEK_STARTS_ON = 1;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function buildMonthGrid({
  month,
  selectedDate,
  today = new Date(),
  weekStartsOn = DEFAULT_WEEK_STARTS_ON,
}: BuildMonthGridOptions): CalendarDayCell[] {
  const firstDay = startOfMonth(month);
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  const leadingDays = dayOffset(firstDay, weekStartsOn);
  const trailingDays = 6 - dayOffset(lastDay, weekStartsOn);
  const totalDays = leadingDays + lastDay.getDate() + trailingDays;
  const gridStart = addDays(firstDay, -leadingDays);
  const todayKey = localDateKey(today);
  const selectedKey = selectedDate === undefined ? undefined : localDateKey(selectedDate);

  return Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(gridStart, index);
    const dateKey = localDateKey(date);
    const lunar = gregorianToVietnameseLunar(date);

    return {
      date,
      dateKey,
      dayOfMonth: date.getDate(),
      inCurrentMonth: date.getMonth() === firstDay.getMonth(),
      isSelected: selectedKey === dateKey,
      isToday: todayKey === dateKey,
      lunarDay: lunar?.day ?? null,
      lunarMonth: lunar?.month ?? null,
      lunarYear: lunar?.year ?? null,
      isLeapMonth: lunar?.isLeapMonth ?? null,
      lunarLabel: lunar === null ? null : formatVietnameseLunarShort(lunar),
      lunarLongLabel: lunar === null ? null : formatVietnameseLunarLong(lunar),
    };
  });
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function addMonths(date: Date, amount: number): Date {
  return startOfMonth(new Date(date.getFullYear(), date.getMonth() + amount, 1));
}

export function localDateKey(date: Date): string {
  return [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}

export function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, day);
}

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) {
    return false;
  }

  return localDateKey(parseLocalDateKey(value)) === value;
}

export function sameLocalDate(a: Date, b: Date): boolean {
  return localDateKey(a) === localDateKey(b);
}

export function localDateTimeString(date: Date): string {
  return `${localDateKey(date)}T${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export function localDateTimeFromParts(dateKey: string, time: string): string {
  return `${dateKey}T${time}`;
}

export function dateKeyFromLocalDateTime(value: string): string {
  return value.slice(0, 10);
}

function dayOffset(date: Date, weekStartsOn: number): number {
  return (date.getDay() - weekStartsOn + 7) % 7;
}
