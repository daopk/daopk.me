import { getCurrentScope, onScopeDispose, ref, type Ref } from "vue";

import { activeProfileKvNamespace, KVStore } from "@daopk/sdk";

export const CALENDAR_KV_NAMESPACE = "calendar";
export const CALENDAR_SETTINGS_KV_KEY = "settings";

export type CalendarWeekStart = 0 | 1;

export interface CalendarSettingsState {
  weekStartsOn: CalendarWeekStart;
  showLunarCalendar: boolean;
}

export interface CalendarSettingsBindings {
  readonly weekStartsOn: Ref<CalendarSettingsState["weekStartsOn"]>;
  readonly showLunarCalendar: Ref<CalendarSettingsState["showLunarCalendar"]>;
  setWeekStartsOn(value: CalendarSettingsState["weekStartsOn"]): void;
  setShowLunarCalendar(value: CalendarSettingsState["showLunarCalendar"]): void;
  snapshot(): CalendarSettingsState;
  reset(): void;
  dispose(): void;
}

export interface UseCalendarSettingsOptions {
  readonly storageNamespace?: string;
}

const DEFAULT_CALENDAR_SETTINGS: CalendarSettingsState = {
  weekStartsOn: 1,
  showLunarCalendar: true,
};

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

function coerceCalendarSettingsResult(candidate: unknown): CoerceResult {
  if (typeof candidate !== "object" || candidate === null) {
    return { state: defaultCalendarSettingsSnapshot(), changed: true };
  }

  const source = candidate as Partial<Record<keyof CalendarSettingsState | string, unknown>>;
  const state = defaultCalendarSettingsSnapshot();
  let changed = false;

  changed ||= "preferredViewMode" in source;

  if (isCalendarWeekStart(source.weekStartsOn)) {
    state.weekStartsOn = source.weekStartsOn;
  } else {
    changed = true;
  }

  if (typeof source.showLunarCalendar === "boolean") {
    state.showLunarCalendar = source.showLunarCalendar;
  } else {
    changed = true;
  }

  if (
    "agendaDayCount" in source ||
    "defaultEventDurationMinutes" in source ||
    "defaultEventColor" in source
  ) {
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

  const weekStartsOn = ref<CalendarSettingsState["weekStartsOn"]>(loaded.state.weekStartsOn);
  const showLunarCalendar = ref<CalendarSettingsState["showLunarCalendar"]>(
    loaded.state.showLunarCalendar,
  );

  if (loaded.changed) {
    kv.set(CALENDAR_SETTINGS_KV_KEY, loaded.state);
  }

  function snapshot(): CalendarSettingsState {
    return {
      weekStartsOn: weekStartsOn.value,
      showLunarCalendar: showLunarCalendar.value,
    };
  }

  function persist(): void {
    kv.set(CALENDAR_SETTINGS_KV_KEY, snapshot());
  }

  function apply(next: CalendarSettingsState): void {
    weekStartsOn.value = next.weekStartsOn;
    showLunarCalendar.value = next.showLunarCalendar;
  }

  function setWeekStartsOn(value: CalendarSettingsState["weekStartsOn"]): void {
    if (!isCalendarWeekStart(value) || value === weekStartsOn.value) {
      return;
    }
    weekStartsOn.value = value;
    persist();
  }

  function setShowLunarCalendar(value: CalendarSettingsState["showLunarCalendar"]): void {
    if (value === showLunarCalendar.value) {
      return;
    }
    showLunarCalendar.value = value;
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
    weekStartsOn,
    showLunarCalendar,
    setWeekStartsOn,
    setShowLunarCalendar,
    snapshot,
    reset,
    dispose,
  };
}
