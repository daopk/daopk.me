import {
  addDays,
  buildMonthGrid,
  dateKeyFromLocalDateTime,
  localDateKey,
  startOfMonth,
  type CalendarDayCell,
} from "./dateGrid";
import type { CalendarEvent } from "./useCalendar";

export type CalendarViewMode = "month" | "week" | "day" | "agenda";

export const CALENDAR_VIEW_STORAGE_KEY = "daopk:calendar:view-mode";
export const CALENDAR_VIEW_MODES: readonly CalendarViewMode[] = ["month", "week", "day", "agenda"];

export interface AgendaDayGroup {
  readonly cell: CalendarDayCell;
  readonly events: readonly CalendarEvent[];
}

interface BuildWeekCellsOptions {
  readonly selectedDate: Date;
  readonly today?: Date;
  readonly weekStartsOn?: number;
}

interface BuildAgendaGroupsOptions {
  readonly events: readonly CalendarEvent[];
  readonly startDate: Date;
  readonly dayCount?: number;
  readonly today?: Date;
}

const DEFAULT_WEEK_STARTS_ON = 1;
const DEFAULT_AGENDA_DAY_COUNT = 7;

export function isCalendarViewMode(value: unknown): value is CalendarViewMode {
  return typeof value === "string" && CALENDAR_VIEW_MODES.includes(value as CalendarViewMode);
}

export function readCalendarViewMode(
  storage: Pick<Storage, "getItem"> | undefined = safeSessionStorage(),
): CalendarViewMode | null {
  if (storage === undefined) {
    return null;
  }

  try {
    const value = storage.getItem(CALENDAR_VIEW_STORAGE_KEY);
    return isCalendarViewMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeCalendarViewMode(
  viewMode: CalendarViewMode,
  storage: Pick<Storage, "setItem"> | undefined = safeSessionStorage(),
): void {
  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(CALENDAR_VIEW_STORAGE_KEY, viewMode);
  } catch {}
}

export function initialCalendarViewMode(
  isMobile: boolean,
  storage?: Pick<Storage, "getItem">,
): CalendarViewMode {
  return readCalendarViewMode(storage) ?? (isMobile ? "agenda" : "month");
}

export function buildWeekCells({
  selectedDate,
  today = new Date(),
  weekStartsOn = DEFAULT_WEEK_STARTS_ON,
}: BuildWeekCellsOptions): readonly CalendarDayCell[] {
  const selectedDayOffset = (selectedDate.getDay() - weekStartsOn + 7) % 7;
  const weekStart = addDays(selectedDate, -selectedDayOffset);

  return Array.from({ length: 7 }, (_, index) =>
    buildDayCell(addDays(weekStart, index), selectedDate, today),
  );
}

export function buildAgendaGroups({
  events,
  startDate,
  dayCount = DEFAULT_AGENDA_DAY_COUNT,
  today = new Date(),
}: BuildAgendaGroupsOptions): readonly AgendaDayGroup[] {
  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(startDate, index);
    const dateKey = localDateKey(date);
    return {
      cell: buildDayCell(date, startDate, today),
      events: eventsForDate(events, dateKey),
    };
  }).filter((group) => group.events.length > 0);
}

export function eventsForDate(
  events: readonly CalendarEvent[],
  dateKey: string,
): readonly CalendarEvent[] {
  return events.filter(
    (event) =>
      dateKeyFromLocalDateTime(event.startAt) <= dateKey &&
      dateKeyFromLocalDateTime(event.endAt) >= dateKey,
  );
}

export function buildDayCell(
  date: Date,
  selectedDate: Date = date,
  today: Date = new Date(),
): CalendarDayCell {
  const dateKey = localDateKey(date);
  const grid = buildMonthGrid({
    month: startOfMonth(date),
    selectedDate,
    today,
  });
  const cell = grid.find((candidate) => candidate.dateKey === dateKey);
  if (cell === undefined) {
    throw new Error(`Calendar day cell could not be built for ${dateKey}.`);
  }

  return cell;
}

function safeSessionStorage(): Storage | undefined {
  return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
}
