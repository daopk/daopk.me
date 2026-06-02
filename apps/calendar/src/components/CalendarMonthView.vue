<script setup lang="ts">
import { GroupLabel } from "@daopk/kit";

import type { CalendarDayCell } from "../dateGrid";

defineProps<{
  readonly cells: readonly CalendarDayCell[];
  readonly dateCellAriaLabel: (cell: CalendarDayCell) => string;
  readonly showLunarCalendar: boolean;
  readonly visibleMonthLabel: string;
  readonly weekdayLabels: readonly string[];
}>();

const emit = defineEmits<{
  selectDate: [dateKey: string];
}>();
</script>

<template>
  <section class="calendar__view calendar__view--month" aria-label="Calendar month">
    <div class="calendar__month-layout">
      <div class="calendar__month-panel" aria-label="Month view">
        <div class="calendar__weekdays" aria-hidden="true">
          <GroupLabel v-for="label in weekdayLabels" :key="label" as="span">
            {{ label }}
          </GroupLabel>
        </div>

        <div class="calendar__grid" role="grid" :aria-label="visibleMonthLabel">
          <button
            v-for="cell in cells"
            :key="cell.dateKey"
            type="button"
            class="calendar__day"
            :class="{
              'calendar__day--muted': !cell.inCurrentMonth,
              'calendar__day--today': cell.isToday,
              'calendar__day--selected': cell.isSelected,
            }"
            :aria-selected="cell.isSelected"
            :aria-label="dateCellAriaLabel(cell)"
            @click="emit('selectDate', cell.dateKey)"
          >
            <span class="calendar__day-heading">
              <span class="calendar__day-number">{{ cell.dayOfMonth }}</span>
              <span v-if="showLunarCalendar && cell.lunarLabel" class="calendar__lunar-label">
                {{ cell.lunarLabel }}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
