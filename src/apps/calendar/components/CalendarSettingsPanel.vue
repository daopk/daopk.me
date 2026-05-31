<script setup lang="ts">
import { computed } from "vue";

import {
  ActionRow,
  AppFrame,
  AppToolbar,
  GroupLabel,
  Panel,
  ScrollArea,
  ToolbarTitle,
} from "~/components/kit";
import { Button, Switch } from "~/components/ui";
import { ArrowLeft, RotateCcw } from "~/icons/lucide";

import {
  CALENDAR_VIEW_MODES,
  type CalendarPreferredViewMode,
  type CalendarViewMode,
} from "../calendarViews";
import { colorLabel, EVENT_COLORS } from "../eventForm";
import type {
  CalendarAgendaDayCount,
  CalendarDefaultEventDurationMinutes,
  CalendarSettingsBindings,
  CalendarWeekStart,
} from "../useCalendarSettings";

const props = withDefaults(
  defineProps<{
    readonly settings: CalendarSettingsBindings;
    readonly showBack?: boolean;
    readonly showHeader?: boolean;
  }>(),
  {
    showBack: false,
    showHeader: true,
  },
);

const emit = defineEmits<{
  back: [];
}>();

const preferredViewOptions: ReadonlyArray<{
  readonly id: CalendarPreferredViewMode;
  readonly label: string;
}> = [
  { id: "device", label: "Device default" },
  ...CALENDAR_VIEW_MODES.map((view) => ({ id: view, label: viewLabel(view) })),
];

const weekStartOptions: ReadonlyArray<{ readonly id: CalendarWeekStart; readonly label: string }> =
  [
    { id: 1, label: "Monday" },
    { id: 0, label: "Sunday" },
  ];

const agendaRangeOptions: readonly CalendarAgendaDayCount[] = [7, 14, 30];
const durationOptions: readonly CalendarDefaultEventDurationMinutes[] = [30, 60, 90, 120];

const preferredViewMode = computed(() => props.settings.preferredViewMode.value);
const weekStartsOn = computed(() => props.settings.weekStartsOn.value);
const agendaDayCount = computed(() => props.settings.agendaDayCount.value);
const showLunarCalendar = computed(() => props.settings.showLunarCalendar.value);
const defaultEventDurationMinutes = computed(
  () => props.settings.defaultEventDurationMinutes.value,
);
const defaultEventColor = computed(() => props.settings.defaultEventColor.value);

function viewLabel(view: CalendarViewMode): string {
  return `${view[0]!.toUpperCase()}${view.slice(1)}`;
}
</script>

<template>
  <AppFrame
    as="main"
    class="calendar-settings"
    layout="flex-column"
    :safe-area="false"
    aria-label="Calendar settings"
  >
    <AppToolbar v-if="showHeader" class="calendar-settings__header">
      <div class="calendar-settings__header-main">
        <Button
          v-if="showBack"
          class="calendar-settings__action-button"
          size="md"
          :icon-start="ArrowLeft"
          aria-label="Back to Calendar"
          @click="emit('back')"
        >
          Back
        </Button>
        <ToolbarTitle class="calendar-settings__title" title="Calendar settings" />
      </div>
      <template #end>
        <Button
          class="calendar-settings__action-button"
          size="md"
          :icon-start="RotateCcw"
          @click="settings.reset"
        >
          Reset
        </Button>
      </template>
    </AppToolbar>

    <ScrollArea as="div" class="calendar-settings__content">
      <Panel
        as="section"
        class="calendar-settings__group"
        variant="plain"
        padding="none"
        aria-labelledby="calendar-settings-view"
      >
        <GroupLabel as="h3" id="calendar-settings-view" class="calendar-settings__group-title">
          View
        </GroupLabel>
        <div
          class="calendar-settings__option-grid"
          role="radiogroup"
          aria-labelledby="calendar-settings-view"
        >
          <button
            v-for="option in preferredViewOptions"
            :key="option.id"
            type="button"
            class="calendar-settings__choice"
            :class="{ 'calendar-settings__choice--active': option.id === preferredViewMode }"
            role="radio"
            :aria-checked="option.id === preferredViewMode"
            @click="settings.setPreferredViewMode(option.id)"
          >
            {{ option.label }}
          </button>
        </div>
      </Panel>

      <Panel
        as="section"
        class="calendar-settings__group"
        variant="plain"
        padding="none"
        aria-labelledby="calendar-settings-week-start"
      >
        <GroupLabel
          as="h3"
          id="calendar-settings-week-start"
          class="calendar-settings__group-title"
        >
          Week start
        </GroupLabel>
        <div
          class="calendar-settings__option-grid calendar-settings__option-grid--compact"
          role="radiogroup"
          aria-labelledby="calendar-settings-week-start"
        >
          <button
            v-for="option in weekStartOptions"
            :key="option.id"
            type="button"
            class="calendar-settings__choice"
            :class="{ 'calendar-settings__choice--active': option.id === weekStartsOn }"
            role="radio"
            :aria-checked="option.id === weekStartsOn"
            @click="settings.setWeekStartsOn(option.id)"
          >
            {{ option.label }}
          </button>
        </div>
      </Panel>

      <Panel
        as="section"
        class="calendar-settings__group"
        variant="plain"
        padding="none"
        aria-labelledby="calendar-settings-agenda"
      >
        <GroupLabel as="h3" id="calendar-settings-agenda" class="calendar-settings__group-title">
          Agenda range
        </GroupLabel>
        <div
          class="calendar-settings__option-grid calendar-settings__option-grid--compact"
          role="radiogroup"
          aria-labelledby="calendar-settings-agenda"
        >
          <button
            v-for="days in agendaRangeOptions"
            :key="days"
            type="button"
            class="calendar-settings__choice"
            :class="{ 'calendar-settings__choice--active': days === agendaDayCount }"
            role="radio"
            :aria-checked="days === agendaDayCount"
            @click="settings.setAgendaDayCount(days)"
          >
            {{ days }} days
          </button>
        </div>
      </Panel>

      <ActionRow
        as="section"
        class="calendar-settings__toggle-row"
        aria-labelledby="calendar-settings-lunar"
      >
        <template #copy>
          <div>
            <h3 id="calendar-settings-lunar" class="calendar-settings__row-title">Lunar labels</h3>
            <p class="calendar-settings__row-copy">
              Show Vietnamese lunar date labels in Calendar.
            </p>
          </div>
        </template>
        <Switch
          :model-value="showLunarCalendar"
          :aria-label="showLunarCalendar ? 'Hide lunar labels' : 'Show lunar labels'"
          @update:model-value="settings.setShowLunarCalendar"
        />
      </ActionRow>

      <Panel
        as="section"
        class="calendar-settings__group"
        variant="plain"
        padding="none"
        aria-labelledby="calendar-settings-duration"
      >
        <GroupLabel as="h3" id="calendar-settings-duration" class="calendar-settings__group-title">
          New event duration
        </GroupLabel>
        <div
          class="calendar-settings__option-grid calendar-settings__option-grid--compact"
          role="radiogroup"
          aria-labelledby="calendar-settings-duration"
        >
          <button
            v-for="minutes in durationOptions"
            :key="minutes"
            type="button"
            class="calendar-settings__choice"
            :class="{
              'calendar-settings__choice--active': minutes === defaultEventDurationMinutes,
            }"
            role="radio"
            :aria-checked="minutes === defaultEventDurationMinutes"
            @click="settings.setDefaultEventDurationMinutes(minutes)"
          >
            {{ minutes }}m
          </button>
        </div>
      </Panel>

      <Panel
        as="section"
        class="calendar-settings__group"
        variant="plain"
        padding="none"
        aria-labelledby="calendar-settings-color"
      >
        <GroupLabel as="h3" id="calendar-settings-color" class="calendar-settings__group-title">
          New event color
        </GroupLabel>
        <div
          class="calendar-settings__swatches"
          role="radiogroup"
          aria-labelledby="calendar-settings-color"
        >
          <button
            v-for="color in EVENT_COLORS"
            :key="color"
            type="button"
            class="calendar-settings__swatch"
            :class="[
              `calendar-settings__swatch--${color}`,
              color === defaultEventColor && 'calendar-settings__swatch--active',
            ]"
            role="radio"
            :aria-checked="color === defaultEventColor"
            :aria-label="colorLabel(color)"
            :title="colorLabel(color)"
            @click="settings.setDefaultEventColor(color)"
          />
        </div>
      </Panel>

      <footer v-if="!showHeader" class="calendar-settings__footer">
        <Button
          class="calendar-settings__action-button"
          size="md"
          :icon-start="RotateCcw"
          @click="settings.reset"
        >
          Reset
        </Button>
      </footer>
    </ScrollArea>
  </AppFrame>
</template>

<style scoped lang="scss">
.calendar-settings {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  min-block-size: 0;
  overflow: hidden;
}

.calendar-settings__header {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-md);
  justify-content: space-between;
  min-block-size: 52px;
  padding: var(--space-xs) var(--space-sm);
}

.calendar-settings__header-main {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.calendar-settings__row-title {
  margin: 0;
}

.calendar-settings__action-button {
  min-block-size: 36px;
}

.calendar-settings__row-copy {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  line-height: 1.35;
  margin: 0;
}

.calendar-settings__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-lg);
  min-block-size: 0;
  padding: var(--space-xl);
}

.calendar-settings__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.calendar-settings__option-grid {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
}

.calendar-settings__option-grid--compact {
  grid-template-columns: repeat(auto-fit, minmax(96px, max-content));
}

.calendar-settings__choice {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  font: inherit;
  min-block-size: 34px;
  padding: var(--space-xs) var(--space-sm);
  text-align: center;

  &:hover,
  &:focus-visible {
    border-color: var(--color-accent);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.calendar-settings__choice--active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent) inset;
}

.calendar-settings__toggle-row {
  align-items: center;
  border-block: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-lg);
  justify-content: space-between;
  padding-block: var(--space-md);
}

.calendar-settings__row-title {
  font-size: 14px;
  font-weight: var(--font-weight-bold);
}

.calendar-settings__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.calendar-settings__swatch {
  --calendar-settings-swatch: var(--color-accent);

  background: var(--calendar-settings-swatch);
  block-size: 30px;
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  inline-size: 30px;

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.calendar-settings__swatch--active {
  border-color: var(--color-fg);
  box-shadow:
    0 0 0 2px var(--color-bg),
    0 0 0 4px var(--calendar-settings-swatch);
}

.calendar-settings__swatch--blue {
  --calendar-settings-swatch: var(--color-accent);
}

.calendar-settings__swatch--green {
  --calendar-settings-swatch: var(--color-success);
}

.calendar-settings__swatch--yellow {
  --calendar-settings-swatch: color-mix(in srgb, var(--color-success) 42%, var(--color-error));
}

.calendar-settings__swatch--red {
  --calendar-settings-swatch: var(--color-error);
}

.calendar-settings__swatch--purple {
  --calendar-settings-swatch: var(--color-accent-sheen);
}

.calendar-settings__swatch--gray {
  --calendar-settings-swatch: var(--color-fg-muted);
}

.calendar-settings__footer {
  display: flex;
  justify-content: flex-start;
  margin-block-start: auto;
}

@media (max-width: 520px) {
  .calendar-settings__content {
    padding: var(--space-lg);
  }

  .calendar-settings__option-grid,
  .calendar-settings__option-grid--compact {
    grid-template-columns: 1fr;
  }
}
</style>
