import { localDateTimeFromParts } from "./dateGrid";
import type { CalendarEventColor, CalendarEventInput } from "./useCalendar";

export interface EventFormState {
  id: string | null;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  notes: string;
  color: CalendarEventColor;
  confirmingDelete: boolean;
}

export const EVENT_COLORS: readonly CalendarEventColor[] = [
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
  "gray",
];

export function createEventFormState(): EventFormState {
  return {
    id: null,
    title: "",
    date: "",
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    notes: "",
    color: "blue",
    confirmingDelete: false,
  };
}

export function setEventForm(
  form: EventFormState,
  id: string | null,
  input: CalendarEventInput,
): void {
  form.id = id;
  form.title = input.title;
  form.date = input.startAt.slice(0, 10);
  form.startTime = input.startAt.slice(11, 16);
  form.endTime = input.endAt.slice(11, 16);
  form.allDay = input.allDay;
  form.notes = input.notes;
  form.color = input.color;
  form.confirmingDelete = false;
}

export function eventInputFromForm(form: EventFormState): CalendarEventInput {
  return {
    title: form.title,
    startAt: localDateTimeFromParts(form.date, form.allDay ? "00:00" : form.startTime),
    endAt: localDateTimeFromParts(form.date, form.allDay ? "23:59" : form.endTime),
    allDay: form.allDay,
    notes: form.notes,
    color: form.color,
  };
}

export function updateAllDayTimes(form: EventFormState, defaults: CalendarEventInput): void {
  if (form.allDay) {
    form.startTime = "00:00";
    form.endTime = "23:59";
    return;
  }

  form.startTime = defaults.startAt.slice(11, 16);
  form.endTime = defaults.endAt.slice(11, 16);
}

export function colorLabel(color: CalendarEventColor): string {
  return `${color[0]!.toUpperCase()}${color.slice(1)}`;
}
