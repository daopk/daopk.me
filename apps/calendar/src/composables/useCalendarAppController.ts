import { computed, onUnmounted, ref, type ComputedRef, type Ref } from "vue";

import { useAppChrome } from "@daopk/kit";
import type { AppChromeBackAction, Kernel } from "@daopk/sdk";

import type { CalendarDayCell } from "../dateGrid";
import { formatMonthLabel, weekdayLabelsForWeekStart } from "../utils/calendarLabels";
import type { UseCalendarBindings } from "../useCalendar";
import type { CalendarSettingsBindings } from "../useCalendarSettings";

type CalendarPane = "calendar" | "settings";

interface AppSettingsRequest {
  readonly manifestId: string;
  readonly handleId?: string;
}

export interface UseCalendarAppControllerOptions {
  readonly appArgs?: Readonly<Record<string, unknown>>;
  readonly calendar: UseCalendarBindings;
  readonly handleId?: string;
  readonly isMobile: Ref<boolean>;
  readonly kernel?: Pick<Kernel, "events"> | null;
  readonly manifestId?: string;
  readonly settings: CalendarSettingsBindings;
}

export interface UseCalendarAppControllerBindings {
  readonly navigationUnitLabel: ComputedRef<string>;
  readonly settingsPaneOpen: ComputedRef<boolean>;
  readonly showLunarCalendar: ComputedRef<boolean>;
  readonly visibleMonthLabel: ComputedRef<string>;
  readonly visibleRangeLabel: ComputedRef<string>;
  readonly weekdayLabels: ComputedRef<readonly string[]>;
  closeSettings(): void;
  dateCellAriaLabel(cell: CalendarDayCell): string;
  goToNext(): void;
  goToPrevious(): void;
  openSettings(): void;
}

export function useCalendarAppController({
  appArgs,
  calendar,
  handleId,
  isMobile,
  kernel,
  manifestId = "calendar",
  settings,
}: UseCalendarAppControllerOptions): UseCalendarAppControllerBindings {
  const activePane = ref<CalendarPane>(appArgs?.pane === "settings" ? "settings" : "calendar");

  const visibleMonthLabel = computed(() => formatMonthLabel(calendar.visibleMonth.value));
  const weekdayLabels = computed(() => weekdayLabelsForWeekStart(settings.weekStartsOn.value));
  const visibleRangeLabel = computed(() => visibleMonthLabel.value);
  const navigationUnitLabel = computed(() => "month");
  const settingsPaneOpen = computed(() => activePane.value === "settings");
  const showLunarCalendar = computed(() => settings.showLunarCalendar.value);
  const mobileSettingsChrome = computed(() => settingsPaneOpen.value && isMobile.value);
  const chromeTitle = computed(() => (mobileSettingsChrome.value ? "Calendar settings" : null));
  const chromeBackAction = computed<AppChromeBackAction | null>(() =>
    mobileSettingsChrome.value ? { ariaLabel: "Back to Calendar", handler: closeSettings } : null,
  );
  const stopAppSettingsListener = kernel?.events.on(
    "app.settings.requested",
    (request: AppSettingsRequest) => {
      if (request.manifestId !== manifestId) {
        return;
      }

      if (request.handleId !== undefined && request.handleId !== handleId) {
        return;
      }

      openSettings();
    },
  );

  useAppChrome({ title: chromeTitle, backAction: chromeBackAction });

  onUnmounted(() => {
    stopAppSettingsListener?.();
  });

  function openSettings(): void {
    activePane.value = "settings";
  }

  function closeSettings(): void {
    activePane.value = "calendar";
  }

  function goToPrevious(): void {
    calendar.goToPreviousMonth();
  }

  function goToNext(): void {
    calendar.goToNextMonth();
  }

  function dateCellAriaLabel(cell: CalendarDayCell): string {
    return !showLunarCalendar.value || cell.lunarLongLabel === null
      ? cell.dateKey
      : `${cell.dateKey}, ${cell.lunarLongLabel}`;
  }

  return {
    navigationUnitLabel,
    settingsPaneOpen,
    showLunarCalendar,
    visibleMonthLabel,
    visibleRangeLabel,
    weekdayLabels,
    closeSettings,
    dateCellAriaLabel,
    goToNext,
    goToPrevious,
    openSettings,
  };
}
