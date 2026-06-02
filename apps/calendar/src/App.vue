<script setup lang="ts">
import { inject } from "vue";

import { AppFrame } from "@daopk/kit";
import { AppContextInjectionKey, KernelInjectionKey, useBreakpoint } from "@daopk/sdk";

import CalendarMonthView from "./components/CalendarMonthView.vue";
import CalendarSettingsPanel from "./components/CalendarSettingsPanel.vue";
import CalendarToolbar from "./components/CalendarToolbar.vue";
import { useCalendarAppController } from "./composables/useCalendarAppController";
import { useCalendar } from "./useCalendar";
import { useCalendarSettings } from "./useCalendarSettings";
import "./styles/calendar.scss";

const { isMobile } = useBreakpoint();
const appContext = inject(AppContextInjectionKey, null);
const kernel = inject(KernelInjectionKey, null);
const calendarSettings = useCalendarSettings();
const calendar = useCalendar({
  weekStartsOn: calendarSettings.weekStartsOn,
});
const calendarController = useCalendarAppController({
  appArgs: appContext?.args,
  calendar,
  handleId: appContext?.handleId,
  isMobile,
  kernel,
  manifestId: appContext?.manifestId,
  settings: calendarSettings,
});

const {
  closeSettings,
  dateCellAriaLabel,
  goToNext,
  goToPrevious,
  navigationUnitLabel,
  settingsPaneOpen,
  showLunarCalendar,
  visibleMonthLabel,
  visibleRangeLabel,
  weekdayLabels,
} = calendarController;
</script>

<template>
  <AppFrame class="calendar" layout="flex-column" aria-label="Calendar">
    <CalendarSettingsPanel
      v-if="settingsPaneOpen"
      :settings="calendarSettings"
      :show-back="!isMobile"
      :show-header="!isMobile"
      @back="closeSettings"
    />

    <template v-else>
      <CalendarToolbar
        :navigation-unit-label="navigationUnitLabel"
        :visible-range-label="visibleRangeLabel"
        @next="goToNext"
        @previous="goToPrevious"
        @today="calendar.goToToday()"
      />

      <main class="calendar__surface">
        <CalendarMonthView
          :cells="calendar.monthGrid.value"
          :date-cell-aria-label="dateCellAriaLabel"
          :show-lunar-calendar="showLunarCalendar"
          :visible-month-label="visibleMonthLabel"
          :weekday-labels="weekdayLabels"
          @select-date="calendar.selectDate"
        />
      </main>
    </template>
  </AppFrame>
</template>
