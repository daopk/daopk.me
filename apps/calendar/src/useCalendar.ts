import { computed, ref, unref, type ComputedRef, type Ref } from "vue";

import {
  addMonths,
  buildMonthGrid,
  isValidDateKey,
  localDateKey,
  parseLocalDateKey,
  startOfLocalDay,
  startOfMonth,
  type CalendarDayCell,
} from "./dateGrid";

export interface UseCalendarOptions {
  readonly now?: () => Date;
  readonly weekStartsOn?: number | Ref<number>;
}

export interface UseCalendarBindings {
  readonly visibleMonth: Ref<Date>;
  readonly selectedDate: Ref<Date>;
  readonly monthGrid: ComputedRef<readonly CalendarDayCell[]>;
  readonly selectedDateKey: ComputedRef<string>;
  selectDate(dateKey: string): void;
  goToPreviousMonth(): void;
  goToNextMonth(): void;
  goToToday(): void;
}

export function useCalendar({
  now = () => new Date(),
  weekStartsOn = 1,
}: UseCalendarOptions = {}): UseCalendarBindings {
  const today = startOfLocalDay(now());
  const visibleMonth = ref(startOfMonth(today));
  const selectedDate = ref(today);

  const selectedDateKey = computed(() => localDateKey(selectedDate.value));
  const monthGrid = computed(() =>
    buildMonthGrid({
      month: visibleMonth.value,
      selectedDate: selectedDate.value,
      today: now(),
      weekStartsOn: normalizeWeekStartsOn(unref(weekStartsOn)),
    }),
  );

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

  return {
    visibleMonth,
    selectedDate,
    monthGrid,
    selectedDateKey,
    selectDate,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
  };
}

function normalizeWeekStartsOn(value: number): number {
  return value === 0 || value === 1 ? value : 1;
}
