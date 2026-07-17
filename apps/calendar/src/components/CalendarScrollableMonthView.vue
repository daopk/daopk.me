<script setup vapor lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

import {
  addMonths,
  localMonthKey,
  startOfMonth,
  type CalendarDayCell,
  type CalendarMonthSection,
} from "../dateGrid";
import { formatMonthLabel, formatShortMonthLabel } from "../utils/calendarLabels";

const INITIAL_MONTH_RADIUS = 18;
const MONTH_BUFFER_CHUNK = 18;
const MAX_RENDERED_MONTHS = 60;
const SCROLL_EDGE_PX = 640;

const props = defineProps<{
  readonly dateCellAriaLabel: (cell: CalendarDayCell) => string;
  readonly monthSectionFor: (month: Date) => CalendarMonthSection;
  readonly scrollRoot: HTMLElement | null;
  readonly showLunarCalendar: boolean;
  readonly visibleMonth: Date;
  readonly weekdayLabels: readonly string[];
}>();

const emit = defineEmits<{
  selectDate: [dateKey: string];
  visibleMonthChange: [month: Date];
}>();

const initialMonth = startOfMonth(props.visibleMonth);
const rangeStart = ref(addMonths(initialMonth, -INITIAL_MONTH_RADIUS));
const rangeEnd = ref(addMonths(initialMonth, INITIAL_MONTH_RADIUS));

let appendingMonths = false;
let prependingMonths = false;
let scrollSyncedMonthKey: string | null = null;
let pendingSelectionMonthKey: string | null = null;
let observedScrollRoot: HTMLElement | null = null;

interface ScrollAnchor {
  readonly monthKey: string;
  readonly top: number;
}

const sections = computed<readonly CalendarMonthSection[]>(() =>
  Array.from({ length: monthDistance(rangeEnd.value, rangeStart.value) + 1 }, (_, index) =>
    props.monthSectionFor(addMonths(rangeStart.value, index)),
  ),
);

watch(
  () => props.scrollRoot,
  (nextRoot, previousRoot) => {
    previousRoot?.removeEventListener("scroll", onScroll);
    observedScrollRoot = nextRoot;
    nextRoot?.addEventListener("scroll", onScroll, { passive: true });

    if (nextRoot !== null) {
      void scrollToMonth(props.visibleMonth);
    }
  },
  { immediate: true },
);

watch(
  () => props.visibleMonth,
  (nextMonth) => {
    const nextMonthKey = localMonthKey(nextMonth);

    if (scrollSyncedMonthKey === nextMonthKey) {
      scrollSyncedMonthKey = null;
      return;
    }

    if (pendingSelectionMonthKey === nextMonthKey) {
      pendingSelectionMonthKey = null;
      ensureMonthInRange(nextMonth);
      return;
    }

    void scrollToMonth(nextMonth);
  },
);

onBeforeUnmount(() => {
  observedScrollRoot?.removeEventListener("scroll", onScroll);
});

function onSelectDate(cell: CalendarDayCell, section: CalendarMonthSection): void {
  pendingSelectionMonthKey = section.monthKey;
  emit("selectDate", cell.dateKey);

  void nextTick(() => {
    if (pendingSelectionMonthKey === section.monthKey) {
      pendingSelectionMonthKey = null;
    }
  });
}

function monthHeadingStyle(section: CalendarMonthSection): Record<string, string> {
  const dayOneColumn = section.leadingOffset + 1;
  if (dayOneColumn === 1) {
    return { gridColumn: "1 / span 2", justifySelf: "start" };
  }

  if (dayOneColumn === 7) {
    return { gridColumn: "6 / span 2", justifySelf: "end" };
  }

  return { gridColumn: `${dayOneColumn - 1} / span 3`, justifySelf: "center" };
}

function onScroll(): void {
  extendRangeNearEdges();
  updateVisibleMonthFromScroll();
}

function extendRangeNearEdges(): void {
  const root = props.scrollRoot;
  if (root === null) {
    return;
  }

  if (root.scrollTop < SCROLL_EDGE_PX && !prependingMonths) {
    prependingMonths = true;
    const anchor = captureScrollAnchor(root);
    rangeStart.value = addMonths(rangeStart.value, -MONTH_BUFFER_CHUNK);
    trimRangeEndToLimit();

    void nextTick(() => {
      restoreScrollAnchor(root, anchor);
      prependingMonths = false;
      updateVisibleMonthFromScroll();
    });
    return;
  }

  if (root.scrollTop + root.clientHeight > root.scrollHeight - SCROLL_EDGE_PX && !appendingMonths) {
    appendingMonths = true;
    const anchor = captureScrollAnchor(root);
    rangeEnd.value = addMonths(rangeEnd.value, MONTH_BUFFER_CHUNK);
    trimRangeStartToLimit();

    void nextTick(() => {
      restoreScrollAnchor(root, anchor);
      appendingMonths = false;
      updateVisibleMonthFromScroll();
    });
  }
}

function updateVisibleMonthFromScroll(): void {
  const root = props.scrollRoot;
  if (root === null) {
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const visibleTop = rootRect.top + stickyWeekdayHeight(root);
  let closestMonthKey: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const monthElement of root.querySelectorAll<HTMLElement>(".calendar__scroll-month")) {
    const monthKey = monthElement.dataset.calendarMonth;
    if (monthKey === undefined) {
      continue;
    }

    const distance = Math.abs(monthElement.getBoundingClientRect().top - visibleTop);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestMonthKey = monthKey;
    }
  }

  if (closestMonthKey === null || closestMonthKey === localMonthKey(props.visibleMonth)) {
    return;
  }

  const visibleMonth = parseMonthKey(closestMonthKey);
  scrollSyncedMonthKey = closestMonthKey;
  emit("visibleMonthChange", visibleMonth);
}

async function scrollToMonth(month: Date): Promise<void> {
  const root = props.scrollRoot;
  if (root === null) {
    ensureMonthInRange(month);
    return;
  }

  const targetMonth = startOfMonth(month);
  ensureMonthInRange(targetMonth);
  await nextTick();

  const monthElement = findMonthElement(localMonthKey(targetMonth));
  if (monthElement === null) {
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const monthRect = monthElement.getBoundingClientRect();
  root.scrollTop += monthRect.top - rootRect.top - stickyWeekdayHeight(root);
}

function ensureMonthInRange(month: Date): void {
  const targetMonth = startOfMonth(month);

  if (monthIsInRange(targetMonth)) {
    return;
  }

  rangeStart.value = addMonths(targetMonth, -INITIAL_MONTH_RADIUS);
  rangeEnd.value = addMonths(targetMonth, INITIAL_MONTH_RADIUS);
}

function findMonthElement(monthKey: string): HTMLElement | null {
  return (
    props.scrollRoot?.querySelector<HTMLElement>(`[data-calendar-month="${monthKey}"]`) ?? null
  );
}

function stickyWeekdayHeight(root: HTMLElement): number {
  return (
    root.querySelector<HTMLElement>(".calendar__scroll-weekdays")?.getBoundingClientRect().height ??
    0
  );
}

function captureScrollAnchor(root: HTMLElement): ScrollAnchor | null {
  const rootRect = root.getBoundingClientRect();
  const visibleTop = rootRect.top + stickyWeekdayHeight(root);
  let closestMonthKey: string | null = null;
  let closestTop = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const monthElement of root.querySelectorAll<HTMLElement>(".calendar__scroll-month")) {
    const monthKey = monthElement.dataset.calendarMonth;
    if (monthKey === undefined) {
      continue;
    }

    const rect = monthElement.getBoundingClientRect();
    const distance = Math.abs(rect.top - visibleTop);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestMonthKey = monthKey;
      closestTop = rect.top - rootRect.top;
    }
  }

  return closestMonthKey === null ? null : { monthKey: closestMonthKey, top: closestTop };
}

function restoreScrollAnchor(root: HTMLElement, anchor: ScrollAnchor | null): void {
  if (anchor === null) {
    return;
  }

  const monthElement = findMonthElement(anchor.monthKey);
  if (monthElement === null) {
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const nextTop = monthElement.getBoundingClientRect().top - rootRect.top;
  root.scrollTop += nextTop - anchor.top;
}

function trimRangeStartToLimit(): void {
  const overflow = renderedMonthCount() - MAX_RENDERED_MONTHS;
  if (overflow > 0) {
    rangeStart.value = addMonths(rangeStart.value, overflow);
  }
}

function trimRangeEndToLimit(): void {
  const overflow = renderedMonthCount() - MAX_RENDERED_MONTHS;
  if (overflow > 0) {
    rangeEnd.value = addMonths(rangeEnd.value, -overflow);
  }
}

function renderedMonthCount(): number {
  return monthDistance(rangeEnd.value, rangeStart.value) + 1;
}

function monthIsInRange(month: Date): boolean {
  return monthDistance(month, rangeStart.value) >= 0 && monthDistance(month, rangeEnd.value) <= 0;
}

function parseMonthKey(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, 1);
}

function monthDistance(a: Date, b: Date): number {
  return monthSerial(a) - monthSerial(b);
}

function monthSerial(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}
</script>

<template>
  <section
    class="calendar__view calendar__view--scroll-months"
    aria-label="Scrollable calendar months"
  >
    <div class="calendar__scroll-weekdays calendar__weekdays" aria-hidden="true">
      <span v-for="label in weekdayLabels" :key="label">
        {{ label }}
      </span>
    </div>

    <div class="calendar__scroll-months">
      <section
        v-for="section in sections"
        :key="section.monthKey"
        class="calendar__scroll-month"
        :data-calendar-month="section.monthKey"
        :aria-label="formatMonthLabel(section.month)"
      >
        <div class="calendar__scroll-month-heading-row">
          <h2 class="calendar__scroll-month-heading" :style="monthHeadingStyle(section)">
            {{ formatShortMonthLabel(section.month) }}
          </h2>
        </div>

        <div
          class="calendar__scroll-grid"
          role="grid"
          :aria-label="formatMonthLabel(section.month)"
        >
          <span
            v-if="section.leadingOffset > 0"
            class="calendar__scroll-spacer"
            :style="{ gridColumn: `span ${section.leadingOffset}` }"
            aria-hidden="true"
          />

          <button
            v-for="cell in section.cells"
            :key="cell.dateKey"
            type="button"
            class="calendar__day calendar__scroll-day"
            :class="{
              'calendar__day--today': cell.isToday,
              'calendar__day--selected': cell.isSelected,
            }"
            :aria-selected="cell.isSelected"
            :aria-label="dateCellAriaLabel(cell)"
            @click="onSelectDate(cell, section)"
          >
            <span class="calendar__day-heading">
              <span class="calendar__day-number">{{ cell.dayOfMonth }}</span>
              <span v-if="showLunarCalendar && cell.lunarLabel" class="calendar__lunar-label">
                {{ cell.lunarLabel }}
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
