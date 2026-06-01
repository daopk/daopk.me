<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { localDateKey } from "../dateGrid";
import {
  formatVietnameseLunarMonth,
  formatVietnameseLunarYear,
  gregorianToVietnameseLunar,
} from "../vietnameseLunar";

const currentDate = ref(new Date());
let midnightTimer: ReturnType<typeof setTimeout> | undefined;

const gregorianFormatter = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

const lunar = computed(() => gregorianToVietnameseLunar(currentDate.value));
const dateKey = computed(() => localDateKey(currentDate.value));
const gregorianLabel = computed(() => gregorianFormatter.format(currentDate.value));
const lunarDayLabel = computed(() => (lunar.value === null ? "N/A" : String(lunar.value.day)));
const lunarMonthLabel = computed(() =>
  lunar.value === null ? "Unsupported date" : formatVietnameseLunarMonth(lunar.value),
);
const lunarYearLabel = computed(() =>
  lunar.value === null ? "Supported 1900-2100" : formatVietnameseLunarYear(lunar.value),
);
const ariaLabel = computed(() => {
  if (lunar.value === null) {
    return `Vietnamese lunar date unavailable for ${dateKey.value}`;
  }

  return `Vietnamese lunar date ${lunar.value.day}, ${formatVietnameseLunarMonth(
    lunar.value,
  )}, ${formatVietnameseLunarYear(lunar.value)}`;
});

function millisecondsUntilNextLocalDay(now: Date): number {
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, nextDay.getTime() - now.getTime());
}

function scheduleMidnightTick(): void {
  const now = new Date();
  midnightTimer = setTimeout(() => {
    currentDate.value = new Date();
    scheduleMidnightTick();
  }, millisecondsUntilNextLocalDay(now));
}

onMounted(() => {
  scheduleMidnightTick();
});

onUnmounted(() => {
  if (midnightTimer !== undefined) {
    clearTimeout(midnightTimer);
  }
});
</script>

<template>
  <div class="calendar-lunar-widget" role="group" :aria-label="ariaLabel">
    <div class="calendar-lunar-widget__eyebrow">Âm lịch</div>
    <div class="calendar-lunar-widget__body">
      <span class="calendar-lunar-widget__day">{{ lunarDayLabel }}</span>
      <span class="calendar-lunar-widget__stack">
        <span class="calendar-lunar-widget__month">{{ lunarMonthLabel }}</span>
        <span class="calendar-lunar-widget__year">{{ lunarYearLabel }}</span>
      </span>
    </div>
    <time class="calendar-lunar-widget__gregorian" :datetime="dateKey">
      {{ gregorianLabel }}
    </time>
  </div>
</template>

<style scoped lang="scss">
.calendar-lunar-widget {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-bg-elevated) 82%, transparent),
    color-mix(in srgb, var(--color-accent) 18%, var(--color-bg) 82%)
  );
  block-size: 100%;
  border: 1px solid color-mix(in srgb, var(--color-fg) 10%, transparent);
  border-radius: var(--radius-lg, 12px);
  box-sizing: border-box;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: 4px;
  inline-size: 100%;
  justify-content: space-between;
  overflow: hidden;
  padding: 10px 12px;
}

.calendar-lunar-widget__eyebrow {
  color: color-mix(in srgb, var(--color-fg) 68%, transparent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  text-transform: uppercase;
}

.calendar-lunar-widget__body {
  align-items: center;
  display: flex;
  gap: 10px;
  min-block-size: 0;
}

.calendar-lunar-widget__day {
  flex: 0 0 auto;
  font-size: 34px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  min-inline-size: 52px;
}

.calendar-lunar-widget__stack {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.calendar-lunar-widget__month {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-lunar-widget__year {
  color: color-mix(in srgb, var(--color-fg) 72%, transparent);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-lunar-widget__gregorian {
  color: color-mix(in srgb, var(--color-fg) 64%, transparent);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
