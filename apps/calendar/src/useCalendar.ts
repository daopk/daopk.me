import { computed, ref, unref, type ComputedRef, type Ref } from "vue";

import { toActionErrorMessage, VfsError, type VfsStat } from "@daopk/sdk";

import {
  addMonths,
  buildMonthGrid,
  dateKeyFromLocalDateTime,
  isValidDateKey,
  localDateKey,
  localDateTimeFromParts,
  localDateTimeString,
  parseLocalDateKey,
  startOfLocalDay,
  startOfMonth,
  type CalendarDayCell,
} from "./dateGrid";

export const CALENDAR_ROOT = "/home/calendar";
export const CALENDAR_FILE_PATH = `${CALENDAR_ROOT}/events.json`;
export const CALENDAR_MIME_TYPE = "application/json;charset=utf-8";

export type CalendarStatus = "idle" | "loading" | "empty" | "ready" | "saving" | "error";
export type CalendarEventColor = "blue" | "green" | "yellow" | "red" | "purple" | "gray";

export interface CalendarDocumentV1 {
  readonly version: 1;
  readonly events: readonly CalendarEvent[];
}

export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly allDay: boolean;
  readonly notes: string;
  readonly color: CalendarEventColor;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CalendarEventInput = Pick<
  CalendarEvent,
  "title" | "startAt" | "endAt" | "allDay" | "notes" | "color"
>;

export interface CalendarMutationResult {
  readonly ok: boolean;
  readonly event: CalendarEvent | null;
}

export interface CalendarVfsClient {
  readText(path: string): Promise<string | null>;
  writeText(
    path: string,
    text: string,
    options?: { overwrite?: boolean; mimeType?: string },
  ): Promise<VfsStat | null>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<VfsStat | null>;
}

export interface UseCalendarOptions {
  readonly vfs: CalendarVfsClient;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
  readonly weekStartsOn?: number | Ref<number>;
  readonly defaultEventDurationMinutes?: number | Ref<number>;
  readonly defaultEventColor?: CalendarEventColor | Ref<CalendarEventColor>;
}

export interface UseCalendarBindings {
  readonly events: Ref<readonly CalendarEvent[]>;
  readonly visibleMonth: Ref<Date>;
  readonly selectedDate: Ref<Date>;
  readonly status: Ref<CalendarStatus>;
  readonly error: Ref<string | null>;
  readonly monthGrid: ComputedRef<readonly CalendarDayCell[]>;
  readonly selectedDateKey: ComputedRef<string>;
  readonly selectedDateEvents: ComputedRef<readonly CalendarEvent[]>;
  loadCalendar(): Promise<boolean>;
  selectDate(dateKey: string): void;
  goToPreviousMonth(): void;
  goToNextMonth(): void;
  goToToday(): void;
  defaultEventInputForDate(dateKey?: string): CalendarEventInput;
  eventsForDate(dateKey: string): readonly CalendarEvent[];
  createEvent(input: CalendarEventInput): Promise<CalendarMutationResult>;
  updateEvent(id: string, input: CalendarEventInput): Promise<CalendarMutationResult>;
  deleteEvent(id: string): Promise<boolean>;
}

const CALENDAR_DOCUMENT_VERSION = 1;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const EVENT_COLORS: readonly CalendarEventColor[] = [
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
  "gray",
];

export function useCalendar({
  vfs,
  now = () => new Date(),
  idFactory = defaultIdFactory,
  weekStartsOn = 1,
  defaultEventDurationMinutes = 60,
  defaultEventColor = "blue",
}: UseCalendarOptions): UseCalendarBindings {
  const today = startOfLocalDay(now());
  const events = ref<readonly CalendarEvent[]>([]);
  const visibleMonth = ref(startOfMonth(today));
  const selectedDate = ref(today);
  const status = ref<CalendarStatus>("idle");
  const error = ref<string | null>(null);

  const selectedDateKey = computed(() => localDateKey(selectedDate.value));
  const monthGrid = computed(() =>
    buildMonthGrid({
      month: visibleMonth.value,
      selectedDate: selectedDate.value,
      today: now(),
      weekStartsOn: normalizeWeekStartsOn(unref(weekStartsOn)),
    }),
  );
  const selectedDateEvents = computed(() => eventsForDate(selectedDateKey.value));

  async function loadCalendar(): Promise<boolean> {
    status.value = "loading";
    error.value = null;

    try {
      if (!(await ensureCalendarRoot())) {
        return false;
      }

      const source = await readCalendarSource();
      if (source === null) {
        events.value = [];
        status.value = "empty";
        return true;
      }

      const document = parseCalendarDocument(source);
      events.value = sortEvents(document.events);
      status.value = events.value.length === 0 ? "empty" : "ready";
      return true;
    } catch (loadError) {
      fail(toActionErrorMessage(loadError, "load calendar"));
      return false;
    }
  }

  function selectDate(dateKey: string): void {
    if (!isValidDateKey(dateKey)) {
      return;
    }

    const nextDate = startOfLocalDay(parseLocalDateKey(dateKey));
    selectedDate.value = nextDate;
    if (visibleMonth.value.getMonth() !== nextDate.getMonth()) {
      visibleMonth.value = startOfMonth(nextDate);
    }
  }

  function goToPreviousMonth(): void {
    visibleMonth.value = addMonths(visibleMonth.value, -1);
  }

  function goToNextMonth(): void {
    visibleMonth.value = addMonths(visibleMonth.value, 1);
  }

  function goToToday(): void {
    const nextToday = startOfLocalDay(now());
    selectedDate.value = nextToday;
    visibleMonth.value = startOfMonth(nextToday);
  }

  function defaultEventInputForDate(dateKey = selectedDateKey.value): CalendarEventInput {
    const safeDateKey = isValidDateKey(dateKey) ? dateKey : selectedDateKey.value;
    const [startTime, endTime] = defaultTimedRange(
      safeDateKey,
      now(),
      normalizeDefaultDuration(unref(defaultEventDurationMinutes)),
    );

    return {
      title: "",
      startAt: localDateTimeFromParts(safeDateKey, startTime),
      endAt: localDateTimeFromParts(safeDateKey, endTime),
      allDay: false,
      notes: "",
      color: normalizeDefaultColor(unref(defaultEventColor)),
    };
  }

  function eventsForDate(dateKey: string): readonly CalendarEvent[] {
    if (!isValidDateKey(dateKey)) {
      return [];
    }

    return events.value.filter((event) => eventOccursOnDate(event, dateKey));
  }

  async function createEvent(input: CalendarEventInput): Promise<CalendarMutationResult> {
    const normalized = normalizeEventInput(input);
    if (typeof normalized === "string") {
      fail(normalized);
      return { ok: false, event: null };
    }

    const timestamp = localDateTimeString(now());
    const event: CalendarEvent = {
      id: idFactory(),
      ...normalized,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const ok = await persistEvents([...events.value, event], "create event");
    return { ok, event };
  }

  async function updateEvent(
    id: string,
    input: CalendarEventInput,
  ): Promise<CalendarMutationResult> {
    const existing = events.value.find((event) => event.id === id);
    if (existing === undefined) {
      fail("Calendar event could not be found.");
      return { ok: false, event: null };
    }

    const normalized = normalizeEventInput(input);
    if (typeof normalized === "string") {
      fail(normalized);
      return { ok: false, event: null };
    }

    const event: CalendarEvent = {
      ...existing,
      ...normalized,
      updatedAt: localDateTimeString(now()),
    };
    const ok = await persistEvents(
      events.value.map((candidate) => (candidate.id === id ? event : candidate)),
      "update event",
    );
    return { ok, event };
  }

  async function deleteEvent(id: string): Promise<boolean> {
    const previousEvents = events.value;
    const nextEvents = previousEvents.filter((event) => event.id !== id);
    if (nextEvents.length === previousEvents.length) {
      fail("Calendar event could not be found.");
      return false;
    }

    const ok = await persistEvents(nextEvents, "delete event");
    if (!ok) {
      events.value = previousEvents;
    }
    return ok;
  }

  async function persistEvents(
    nextEvents: readonly CalendarEvent[],
    action: string,
  ): Promise<boolean> {
    events.value = sortEvents(nextEvents);
    status.value = "saving";
    error.value = null;

    try {
      if (!(await ensureCalendarRoot())) {
        return false;
      }

      const stat = await vfs.writeText(CALENDAR_FILE_PATH, serializeCalendar(events.value), {
        overwrite: true,
        mimeType: CALENDAR_MIME_TYPE,
      });
      if (stat === null) {
        fail("Calendar does not have permission to save events.");
        return false;
      }

      status.value = events.value.length === 0 ? "empty" : "ready";
      error.value = null;
      return true;
    } catch (saveError) {
      fail(toActionErrorMessage(saveError, action));
      return false;
    }
  }

  async function ensureCalendarRoot(): Promise<boolean> {
    const stat = await vfs.mkdir(CALENDAR_ROOT, { recursive: true });
    if (stat === null) {
      fail("Calendar does not have permission to prepare its folder.");
      return false;
    }

    return true;
  }

  async function readCalendarSource(): Promise<string | null> {
    try {
      return await vfs.readText(CALENDAR_FILE_PATH);
    } catch (readError) {
      if (readError instanceof VfsError && readError.code === "NOT_FOUND") {
        return null;
      }

      throw readError;
    }
  }

  function fail(message: string): void {
    status.value = "error";
    error.value = message;
  }

  return {
    events,
    visibleMonth,
    selectedDate,
    status,
    error,
    monthGrid,
    selectedDateKey,
    selectedDateEvents,
    loadCalendar,
    selectDate,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
    defaultEventInputForDate,
    eventsForDate,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

export function parseCalendarDocument(source: string): CalendarDocumentV1 {
  const parsed = JSON.parse(source) as unknown;
  if (!isCalendarDocument(parsed)) {
    throw new Error("Calendar data is not a supported document.");
  }

  return {
    version: CALENDAR_DOCUMENT_VERSION,
    events: sortEvents(parsed.events),
  };
}

export function serializeCalendar(events: readonly CalendarEvent[]): string {
  const document: CalendarDocumentV1 = {
    version: CALENDAR_DOCUMENT_VERSION,
    events: sortEvents(events),
  };

  return `${JSON.stringify(document, null, 2)}\n`;
}

export function validateEventInput(input: CalendarEventInput): string | null {
  const title = input.title.trim();
  if (title.length === 0) {
    return "Event title is required.";
  }
  if (!isValidLocalDateTime(input.startAt) || !isValidLocalDateTime(input.endAt)) {
    return "Event date and time are invalid.";
  }
  if (input.endAt < input.startAt) {
    return "Event end time must be after the start time.";
  }
  if (!EVENT_COLORS.includes(input.color)) {
    return "Event color is invalid.";
  }

  return null;
}

function normalizeEventInput(input: CalendarEventInput): CalendarEventInput | string {
  const validationError = validateEventInput(input);
  if (validationError !== null) {
    return validationError;
  }

  return {
    title: input.title.trim(),
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay,
    notes: input.notes,
    color: input.color,
  };
}

function isCalendarDocument(value: unknown): value is CalendarDocumentV1 {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<CalendarDocumentV1>;
  return (
    candidate.version === CALENDAR_DOCUMENT_VERSION &&
    Array.isArray(candidate.events) &&
    candidate.events.every(isCalendarEvent)
  );
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<CalendarEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.startAt === "string" &&
    typeof candidate.endAt === "string" &&
    typeof candidate.allDay === "boolean" &&
    typeof candidate.notes === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.color === "string" &&
    EVENT_COLORS.includes(candidate.color as CalendarEventColor) &&
    validateEventInput(candidate as CalendarEventInput) === null
  );
}

function sortEvents(items: readonly CalendarEvent[]): readonly CalendarEvent[] {
  return [...items].sort((a, b) => {
    const start = a.startAt.localeCompare(b.startAt);
    return start === 0 ? a.title.localeCompare(b.title) : start;
  });
}

function eventOccursOnDate(event: CalendarEvent, dateKey: string): boolean {
  return (
    dateKeyFromLocalDateTime(event.startAt) <= dateKey &&
    dateKeyFromLocalDateTime(event.endAt) >= dateKey
  );
}

function defaultTimedRange(
  dateKey: string,
  current: Date,
  durationMinutes: number,
): readonly [string, string] {
  const start =
    localDateKey(current) === dateKey
      ? nextWholeHour(current)
      : new Date(parseLocalDateKey(dateKey).setHours(9, 0, 0, 0));

  if (localDateKey(start) !== dateKey) {
    return ["23:00", "23:59"];
  }

  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMinutes);
  if (localDateKey(end) !== dateKey) {
    return [timeString(start), "23:59"];
  }

  return [timeString(start), timeString(end)];
}

function nextWholeHour(current: Date): Date {
  const nextHour = new Date(current);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  return nextHour;
}

function normalizeWeekStartsOn(value: number): number {
  return value === 0 || value === 1 ? value : 1;
}

function normalizeDefaultDuration(value: number): number {
  return value === 30 || value === 60 || value === 90 || value === 120 ? value : 60;
}

function normalizeDefaultColor(value: CalendarEventColor): CalendarEventColor {
  return EVENT_COLORS.includes(value) ? value : "blue";
}

function isValidLocalDateTime(value: string): boolean {
  if (!LOCAL_DATE_TIME_PATTERN.test(value)) {
    return false;
  }

  const dateKey = value.slice(0, 10);
  const hours = Number.parseInt(value.slice(11, 13), 10);
  const minutes = Number.parseInt(value.slice(14, 16), 10);
  return isValidDateKey(dateKey) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function timeString(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function defaultIdFactory(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
