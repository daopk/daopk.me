import { getCurrentScope, onScopeDispose, ref, type Ref } from "vue";

import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import { KVStore } from "~/core/storage/KVStore";

import { isCalendarPreferredViewMode, type CalendarPreferredViewMode } from "./calendarViews";
import type { CalendarEventColor } from "./useCalendar";

export const CALENDAR_KV_NAMESPACE = "calendar";
export const CALENDAR_SETTINGS_KV_KEY = "settings";

export type CalendarWeekStart = 0 | 1;
export type CalendarAgendaDayCount = 7 | 14 | 30;
export type CalendarDefaultEventDurationMinutes = 30 | 60 | 90 | 120;

export interface CalendarSettingsState {
  preferredViewMode: CalendarPreferredViewMode;
  weekStartsOn: CalendarWeekStart;
  agendaDayCount: CalendarAgendaDayCount;
  showLunarCalendar: boolean;
  defaultEventDurationMinutes: CalendarDefaultEventDurationMinutes;
  defaultEventColor: CalendarEventColor;
}

export interface CalendarSettingsBindings {
  readonly preferredViewMode: Ref<CalendarSettingsState["preferredViewMode"]>;
  readonly weekStartsOn: Ref<CalendarSettingsState["weekStartsOn"]>;
  readonly agendaDayCount: Ref<CalendarSettingsState["agendaDayCount"]>;
  readonly showLunarCalendar: Ref<CalendarSettingsState["showLunarCalendar"]>;
  readonly defaultEventDurationMinutes: Ref<CalendarSettingsState["defaultEventDurationMinutes"]>;
  readonly defaultEventColor: Ref<CalendarSettingsState["defaultEventColor"]>;
  setPreferredViewMode(value: CalendarSettingsState["preferredViewMode"]): void;
  setWeekStartsOn(value: CalendarSettingsState["weekStartsOn"]): void;
  setAgendaDayCount(value: CalendarSettingsState["agendaDayCount"]): void;
  setShowLunarCalendar(value: CalendarSettingsState["showLunarCalendar"]): void;
  setDefaultEventDurationMinutes(value: CalendarSettingsState["defaultEventDurationMinutes"]): void;
  setDefaultEventColor(value: CalendarSettingsState["defaultEventColor"]): void;
  snapshot(): CalendarSettingsState;
  reset(): void;
  dispose(): void;
}

export interface UseCalendarSettingsOptions {
  readonly storageNamespace?: string;
}

const DEFAULT_CALENDAR_SETTINGS: CalendarSettingsState = {
  preferredViewMode: "device",
  weekStartsOn: 1,
  agendaDayCount: 7,
  showLunarCalendar: true,
  defaultEventDurationMinutes: 60,
  defaultEventColor: "blue",
};

const AGENDA_DAY_COUNTS: readonly CalendarAgendaDayCount[] = [7, 14, 30];
const DEFAULT_EVENT_DURATIONS: readonly CalendarDefaultEventDurationMinutes[] = [30, 60, 90, 120];
const EVENT_COLORS: readonly CalendarEventColor[] = [
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
  "gray",
];

interface CoerceResult {
  readonly state: CalendarSettingsState;
  readonly changed: boolean;
}

function defaultCalendarSettingsSnapshot(): CalendarSettingsState {
  return { ...DEFAULT_CALENDAR_SETTINGS };
}

function isCalendarWeekStart(value: unknown): value is CalendarWeekStart {
  return value === 0 || value === 1;
}

function isCalendarAgendaDayCount(value: unknown): value is CalendarAgendaDayCount {
  return AGENDA_DAY_COUNTS.includes(value as CalendarAgendaDayCount);
}

function isCalendarDefaultEventDurationMinutes(
  value: unknown,
): value is CalendarDefaultEventDurationMinutes {
  return DEFAULT_EVENT_DURATIONS.includes(value as CalendarDefaultEventDurationMinutes);
}

function isCalendarEventColor(value: unknown): value is CalendarEventColor {
  return typeof value === "string" && EVENT_COLORS.includes(value as CalendarEventColor);
}

function coerceCalendarSettingsResult(candidate: unknown): CoerceResult {
  if (typeof candidate !== "object" || candidate === null) {
    return { state: defaultCalendarSettingsSnapshot(), changed: true };
  }

  const source = candidate as Partial<Record<keyof CalendarSettingsState, unknown>>;
  const state = defaultCalendarSettingsSnapshot();
  let changed = false;

  if (isCalendarPreferredViewMode(source.preferredViewMode)) {
    state.preferredViewMode = source.preferredViewMode;
  } else {
    changed = true;
  }

  if (isCalendarWeekStart(source.weekStartsOn)) {
    state.weekStartsOn = source.weekStartsOn;
  } else {
    changed = true;
  }

  if (isCalendarAgendaDayCount(source.agendaDayCount)) {
    state.agendaDayCount = source.agendaDayCount;
  } else {
    changed = true;
  }

  if (typeof source.showLunarCalendar === "boolean") {
    state.showLunarCalendar = source.showLunarCalendar;
  } else {
    changed = true;
  }

  if (isCalendarDefaultEventDurationMinutes(source.defaultEventDurationMinutes)) {
    state.defaultEventDurationMinutes = source.defaultEventDurationMinutes;
  } else {
    changed = true;
  }

  if (isCalendarEventColor(source.defaultEventColor)) {
    state.defaultEventColor = source.defaultEventColor;
  } else {
    changed = true;
  }

  return { state, changed };
}

export function coerceCalendarSettings(candidate: unknown): CalendarSettingsState {
  return coerceCalendarSettingsResult(candidate).state;
}

export function useCalendarSettings(
  options: UseCalendarSettingsOptions = {},
): CalendarSettingsBindings {
  const kv = new KVStore<CalendarSettingsState>(
    options.storageNamespace ?? activeProfileKvNamespace(CALENDAR_KV_NAMESPACE),
    { version: 1 },
  );
  const loaded = coerceCalendarSettingsResult(kv.get(CALENDAR_SETTINGS_KV_KEY));

  const preferredViewMode = ref<CalendarSettingsState["preferredViewMode"]>(
    loaded.state.preferredViewMode,
  );
  const weekStartsOn = ref<CalendarSettingsState["weekStartsOn"]>(loaded.state.weekStartsOn);
  const agendaDayCount = ref<CalendarSettingsState["agendaDayCount"]>(loaded.state.agendaDayCount);
  const showLunarCalendar = ref<CalendarSettingsState["showLunarCalendar"]>(
    loaded.state.showLunarCalendar,
  );
  const defaultEventDurationMinutes = ref<CalendarSettingsState["defaultEventDurationMinutes"]>(
    loaded.state.defaultEventDurationMinutes,
  );
  const defaultEventColor = ref<CalendarSettingsState["defaultEventColor"]>(
    loaded.state.defaultEventColor,
  );

  if (loaded.changed) {
    kv.set(CALENDAR_SETTINGS_KV_KEY, loaded.state);
  }

  function snapshot(): CalendarSettingsState {
    return {
      preferredViewMode: preferredViewMode.value,
      weekStartsOn: weekStartsOn.value,
      agendaDayCount: agendaDayCount.value,
      showLunarCalendar: showLunarCalendar.value,
      defaultEventDurationMinutes: defaultEventDurationMinutes.value,
      defaultEventColor: defaultEventColor.value,
    };
  }

  function persist(): void {
    kv.set(CALENDAR_SETTINGS_KV_KEY, snapshot());
  }

  function apply(next: CalendarSettingsState): void {
    preferredViewMode.value = next.preferredViewMode;
    weekStartsOn.value = next.weekStartsOn;
    agendaDayCount.value = next.agendaDayCount;
    showLunarCalendar.value = next.showLunarCalendar;
    defaultEventDurationMinutes.value = next.defaultEventDurationMinutes;
    defaultEventColor.value = next.defaultEventColor;
  }

  function setPreferredViewMode(value: CalendarSettingsState["preferredViewMode"]): void {
    if (!isCalendarPreferredViewMode(value) || value === preferredViewMode.value) {
      return;
    }
    preferredViewMode.value = value;
    persist();
  }

  function setWeekStartsOn(value: CalendarSettingsState["weekStartsOn"]): void {
    if (!isCalendarWeekStart(value) || value === weekStartsOn.value) {
      return;
    }
    weekStartsOn.value = value;
    persist();
  }

  function setAgendaDayCount(value: CalendarSettingsState["agendaDayCount"]): void {
    if (!isCalendarAgendaDayCount(value) || value === agendaDayCount.value) {
      return;
    }
    agendaDayCount.value = value;
    persist();
  }

  function setShowLunarCalendar(value: CalendarSettingsState["showLunarCalendar"]): void {
    if (value === showLunarCalendar.value) {
      return;
    }
    showLunarCalendar.value = value;
    persist();
  }

  function setDefaultEventDurationMinutes(
    value: CalendarSettingsState["defaultEventDurationMinutes"],
  ): void {
    if (
      !isCalendarDefaultEventDurationMinutes(value) ||
      value === defaultEventDurationMinutes.value
    ) {
      return;
    }
    defaultEventDurationMinutes.value = value;
    persist();
  }

  function setDefaultEventColor(value: CalendarSettingsState["defaultEventColor"]): void {
    if (!isCalendarEventColor(value) || value === defaultEventColor.value) {
      return;
    }
    defaultEventColor.value = value;
    persist();
  }

  function reset(): void {
    apply(defaultCalendarSettingsSnapshot());
    persist();
  }

  function dispose(): void {
    kv.dispose();
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(dispose);
  }

  return {
    preferredViewMode,
    weekStartsOn,
    agendaDayCount,
    showLunarCalendar,
    defaultEventDurationMinutes,
    defaultEventColor,
    setPreferredViewMode,
    setWeekStartsOn,
    setAgendaDayCount,
    setShowLunarCalendar,
    setDefaultEventDurationMinutes,
    setDefaultEventColor,
    snapshot,
    reset,
    dispose,
  };
}
