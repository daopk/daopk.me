<script setup vapor lang="ts">
import { computed } from "vue";

import {
  ActionRow,
  AppFrame,
  AppToolbar,
  GroupLabel,
  Panel,
  ScrollArea,
  ToolbarTitle,
} from "@daopk/kit";
import { Button, SegmentedControl, Switch, type SegmentedControlOption } from "@daopk/ui";
import ArrowLeft from "~icons/lucide/arrow-left";
import RotateCcw from "~icons/lucide/rotate-ccw";

import type { CalendarSettingsBindings, CalendarWeekStart } from "../useCalendarSettings";

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

const weekStartOptions: SegmentedControlOption[] = [
  { value: 1 satisfies CalendarWeekStart, label: "Monday" },
  { value: 0 satisfies CalendarWeekStart, label: "Sunday" },
];

const weekStartsOn = computed(() => props.settings.weekStartsOn.value);
const showLunarCalendar = computed(() => props.settings.showLunarCalendar.value);

function selectWeekStart(value: string | number | null): void {
  if (value === 0 || value === 1) props.settings.setWeekStartsOn(value);
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
          aria-label="Back to Calendar"
          @click="emit('back')"
        >
          <template #left><ArrowLeft aria-hidden="true" /></template>
          Back
        </Button>
        <ToolbarTitle class="calendar-settings__title" title="Calendar settings" />
      </div>
      <template #end>
        <Button class="calendar-settings__action-button" size="md" @click="settings.reset">
          <template #left><RotateCcw aria-hidden="true" /></template>
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
        aria-labelledby="calendar-settings-week-start"
      >
        <GroupLabel
          as="h3"
          id="calendar-settings-week-start"
          class="calendar-settings__group-title"
        >
          Week start
        </GroupLabel>
        <SegmentedControl
          class="calendar-settings__week-start"
          :model-value="weekStartsOn"
          :options="weekStartOptions"
          labelledby="calendar-settings-week-start"
          size="sm"
          @update:model-value="selectWeekStart"
        />
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
          :ariaLabel="showLunarCalendar ? 'Hide lunar labels' : 'Show lunar labels'"
          @update:model-value="settings.setShowLunarCalendar"
        />
      </ActionRow>

      <footer v-if="!showHeader" class="calendar-settings__footer">
        <Button class="calendar-settings__action-button" size="md" @click="settings.reset">
          <template #left><RotateCcw aria-hidden="true" /></template>
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

.calendar-settings__week-start {
  align-self: flex-start;
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

.calendar-settings__footer {
  display: flex;
  justify-content: flex-start;
  margin-block-start: auto;
}

@media (max-width: 520px) {
  .calendar-settings__content {
    padding: var(--space-lg);
  }

  .calendar-settings__week-start {
    align-self: stretch;
  }
}
</style>
