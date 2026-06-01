import { afterEach, describe, expect, it } from "vitest";

import {
  CALENDAR_SETTINGS_KV_KEY,
  coerceCalendarSettings,
  useCalendarSettings,
  type CalendarSettingsState,
} from "./useCalendarSettings";

const STORAGE_NAMESPACE = "calendar-settings-test";
const STORAGE_KEY = `${STORAGE_NAMESPACE}:${CALENDAR_SETTINGS_KV_KEY}`;

function persistRaw(data: unknown): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: 1, data }));
}

function readState(): CalendarSettingsState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    throw new Error("missing calendar settings state");
  }
  return (JSON.parse(raw) as { data: CalendarSettingsState }).data;
}

describe("useCalendarSettings", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("loads defaults into the configured storage namespace", () => {
    const settings = useCalendarSettings({ storageNamespace: STORAGE_NAMESPACE });

    expect(settings.snapshot()).toEqual({
      preferredViewMode: "device",
      weekStartsOn: 1,
      agendaDayCount: 7,
      showLunarCalendar: true,
      defaultEventDurationMinutes: 60,
      defaultEventColor: "blue",
    });
    expect(readState()).toEqual(settings.snapshot());

    settings.dispose();
  });

  it("persists typed setting changes", () => {
    const settings = useCalendarSettings({ storageNamespace: STORAGE_NAMESPACE });

    settings.setPreferredViewMode("week");
    settings.setWeekStartsOn(0);
    settings.setAgendaDayCount(14);
    settings.setShowLunarCalendar(false);
    settings.setDefaultEventDurationMinutes(90);
    settings.setDefaultEventColor("purple");

    expect(readState()).toEqual({
      preferredViewMode: "week",
      weekStartsOn: 0,
      agendaDayCount: 14,
      showLunarCalendar: false,
      defaultEventDurationMinutes: 90,
      defaultEventColor: "purple",
    });

    settings.dispose();
  });

  it("coerces invalid persisted payloads and repairs storage", () => {
    persistRaw({
      preferredViewMode: "timeline",
      weekStartsOn: 6,
      agendaDayCount: 365,
      showLunarCalendar: "yes",
      defaultEventDurationMinutes: 15,
      defaultEventColor: "orange",
    });

    const settings = useCalendarSettings({ storageNamespace: STORAGE_NAMESPACE });

    expect(settings.snapshot()).toEqual({
      preferredViewMode: "device",
      weekStartsOn: 1,
      agendaDayCount: 7,
      showLunarCalendar: true,
      defaultEventDurationMinutes: 60,
      defaultEventColor: "blue",
    });
    expect(readState()).toEqual(settings.snapshot());

    settings.dispose();
  });

  it("keeps valid persisted fields while defaulting invalid fields", () => {
    persistRaw({
      preferredViewMode: "agenda",
      weekStartsOn: 0,
      agendaDayCount: "bad",
      showLunarCalendar: false,
      defaultEventDurationMinutes: 120,
      defaultEventColor: "green",
    });

    const settings = useCalendarSettings({ storageNamespace: STORAGE_NAMESPACE });

    expect(settings.snapshot()).toEqual({
      preferredViewMode: "agenda",
      weekStartsOn: 0,
      agendaDayCount: 7,
      showLunarCalendar: false,
      defaultEventDurationMinutes: 120,
      defaultEventColor: "green",
    });

    settings.dispose();
  });

  it("resets settings to defaults", () => {
    const settings = useCalendarSettings({ storageNamespace: STORAGE_NAMESPACE });

    settings.setPreferredViewMode("day");
    settings.setAgendaDayCount(30);
    settings.reset();

    expect(settings.snapshot()).toEqual(coerceCalendarSettings(null));
    expect(readState()).toEqual(coerceCalendarSettings(null));

    settings.dispose();
  });
});
