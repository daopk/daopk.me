<script setup lang="ts">
import {
  computed,
  inject,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type Component,
} from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  GroupLabel,
  IconButton,
  Panel,
  ScrollArea,
  StatusBanner,
  TabList,
  ToolbarGroup,
  ToolbarTitle,
  useAppChrome,
  type TabListOption,
} from "~/components/kit";
import { Button } from "~/components/ui";
import { useBreakpoint } from "~/composables/useBreakpoint";
import { useVfs } from "~/composables/useVfs";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  List,
  Plus,
} from "~/icons/lucide";
import { AppContextInjectionKey, type AppChromeBackAction } from "~/types/app";
import { KernelInjectionKey } from "~/types/kernel";

import CalendarEventDialog from "./components/CalendarEventDialog.vue";
import CalendarSettingsPanel from "./components/CalendarSettingsPanel.vue";
import { addDays, localDateKey, type CalendarDayCell } from "./dateGrid";
import {
  createEventFormState,
  EVENT_COLORS,
  eventInputFromForm,
  setEventForm,
  updateAllDayTimes,
} from "./eventForm";
import { formatVietnameseLunarLong, gregorianToVietnameseLunar } from "./vietnameseLunar";
import {
  buildAgendaGroups,
  buildDayCell,
  buildWeekCells,
  initialCalendarViewMode,
  isCalendarViewMode,
  type CalendarViewMode,
} from "./calendarViews";
import {
  useCalendar,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarStatus,
} from "./useCalendar";
import { useCalendarSettings } from "./useCalendarSettings";

type CalendarPane = "calendar" | "settings";

const { isMobile } = useBreakpoint();
const appContext = inject(AppContextInjectionKey, null);
const kernel = inject(KernelInjectionKey, null);
const calendarSettings = useCalendarSettings();
const calendar = useCalendar({
  vfs: useVfs(),
  weekStartsOn: calendarSettings.weekStartsOn,
  defaultEventDurationMinutes: calendarSettings.defaultEventDurationMinutes,
  defaultEventColor: calendarSettings.defaultEventColor,
});
const activePane = ref<CalendarPane>(
  appContext?.args.pane === "settings" ? "settings" : "calendar",
);
const activeView = ref<CalendarViewMode>(
  initialCalendarViewMode(calendarSettings.preferredViewMode.value, isMobile.value),
);
const dialogOpen = ref(false);
const formError = ref<string | null>(null);
const form = reactive(createEventFormState());

const viewTabs: ReadonlyArray<{
  readonly id: CalendarViewMode;
  readonly label: string;
  readonly icon: Component;
}> = [
  { id: "month", label: "Month", icon: LayoutGrid },
  { id: "week", label: "Week", icon: CalendarRange },
  { id: "day", label: "Day", icon: CalendarDays },
  { id: "agenda", label: "Agenda", icon: List },
];
const viewTabOptions = computed<readonly TabListOption[]>(() =>
  viewTabs.map((tab) => ({
    value: tab.id,
    label: tab.label,
    icon: tab.icon,
    id: viewTabId(tab.id),
    panelId: viewPanelId(tab.id),
    ariaLabel: `${tab.label} view`,
  })),
);

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const compactDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const compactDateWithYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });

const visibleMonthLabel = computed(() => monthFormatter.format(calendar.visibleMonth.value));

const selectedDateLabel = computed(() => fullDateFormatter.format(calendar.selectedDate.value));

const selectedDateLunarLabel = computed(() => {
  if (!calendarSettings.showLunarCalendar.value) {
    return null;
  }

  const lunar = gregorianToVietnameseLunar(calendar.selectedDate.value);
  return lunar === null ? null : formatVietnameseLunarLong(lunar);
});

const selectedDayCell = computed(() => buildDayCell(calendar.selectedDate.value));

const weekCells = computed(() =>
  buildWeekCells({
    selectedDate: calendar.selectedDate.value,
    today: new Date(),
    weekStartsOn: calendarSettings.weekStartsOn.value,
  }),
);

const agendaGroups = computed(() =>
  buildAgendaGroups({
    events: calendar.events.value,
    startDate: calendar.selectedDate.value,
    dayCount: calendarSettings.agendaDayCount.value,
    today: new Date(),
  }),
);

const visibleRangeLabel = computed(() => {
  switch (activeView.value) {
    case "month":
      return visibleMonthLabel.value;
    case "week": {
      const first = weekCells.value[0];
      const last = weekCells.value.at(-1);
      return first === undefined || last === undefined
        ? visibleMonthLabel.value
        : `${formatCompactDate(first.date)} - ${formatCompactDateWithYear(last.date)}`;
    }
    case "day":
      return selectedDateLabel.value;
    case "agenda":
      return `${formatCompactDate(calendar.selectedDate.value)} - ${formatCompactDateWithYear(
        addDays(calendar.selectedDate.value, calendarSettings.agendaDayCount.value - 1),
      )}`;
  }

  return visibleMonthLabel.value;
});

const navigationUnitLabel = computed(() => {
  switch (activeView.value) {
    case "agenda":
      return "agenda range";
    default:
      return activeView.value;
  }
});

const dialogTitle = computed(() => (form.id === null ? "New event" : "Edit event"));

const statusText = computed(() => {
  if (calendar.error.value !== null) {
    return calendar.error.value;
  }

  return labelForStatus(calendar.status.value);
});

const showStatus = computed(
  () =>
    calendar.error.value !== null ||
    calendar.status.value === "loading" ||
    calendar.status.value === "saving",
);

const dialogVariant = computed(() => (isMobile.value ? "sheet" : "modal"));
const settingsPaneOpen = computed(() => activePane.value === "settings");
const showLunarCalendar = computed(() => calendarSettings.showLunarCalendar.value);
const ownManifestId = appContext?.manifestId ?? "calendar";
const ownHandleId = appContext?.handleId;

const stopAppSettingsListener = kernel?.events.on(
  "app.settings.requested",
  ({ manifestId, handleId }) => {
    if (manifestId !== ownManifestId) {
      return;
    }

    if (handleId !== undefined && handleId !== ownHandleId) {
      return;
    }

    openSettings();
  },
);

const mobileSettingsChrome = computed(() => settingsPaneOpen.value && isMobile.value);
const chromeTitle = computed(() => (mobileSettingsChrome.value ? "Calendar settings" : null));
const chromeBackAction = computed<AppChromeBackAction | null>(() =>
  mobileSettingsChrome.value ? { ariaLabel: "Back to Calendar", handler: closeSettings } : null,
);

useAppChrome({ title: chromeTitle, backAction: chromeBackAction });

onMounted(() => {
  void calendar.loadCalendar();
});

onUnmounted(() => {
  stopAppSettingsListener?.();
});

watch(
  () => [calendarSettings.preferredViewMode.value, isMobile.value] as const,
  ([preferredViewMode, mobile]) => {
    activeView.value = initialCalendarViewMode(preferredViewMode, mobile);
  },
);

function selectView(view: CalendarViewMode): void {
  activeView.value = view;
  calendarSettings.setPreferredViewMode(view);
}

function onViewTabChange(view: string): void {
  if (isCalendarViewMode(view)) {
    selectView(view);
  }
}

function openSettings(): void {
  activePane.value = "settings";
}

function closeSettings(): void {
  activePane.value = "calendar";
}

function openCreate(dateKey = calendar.selectedDateKey.value): void {
  setForm(null, calendar.defaultEventInputForDate(dateKey));
  dialogOpen.value = true;
}

function openEdit(event: CalendarEvent): void {
  setForm(event.id, event);
  dialogOpen.value = true;
}

function closeDialog(): void {
  dialogOpen.value = false;
  formError.value = null;
  form.confirmingDelete = false;
}

async function submitForm(): Promise<void> {
  formError.value = null;
  form.confirmingDelete = false;
  const input = eventInputFromForm(form);
  const result =
    form.id === null
      ? await calendar.createEvent(input)
      : await calendar.updateEvent(form.id, input);

  if (result.event !== null) {
    setForm(result.event.id, result.event);
  }

  if (result.ok) {
    closeDialog();
    return;
  }

  formError.value = calendar.error.value;
}

async function confirmDelete(): Promise<void> {
  if (form.id === null) {
    return;
  }

  formError.value = null;
  const ok = await calendar.deleteEvent(form.id);
  if (ok) {
    closeDialog();
    return;
  }

  formError.value = calendar.error.value;
}

function setForm(id: string | null, input: CalendarEventInput): void {
  setEventForm(form, id, input);
  formError.value = null;
}

function onAllDayChange(checked: boolean): void {
  form.allDay = checked;
  const defaults = calendar.defaultEventInputForDate(form.date);
  updateAllDayTimes(form, defaults);
}

function eventChipsForDate(dateKey: string): readonly CalendarEvent[] {
  return calendar.eventsForDate(dateKey).slice(0, 3);
}

function eventCountForDate(dateKey: string): number {
  return calendar.eventsForDate(dateKey).length;
}

function eventOverflowForDate(dateKey: string): number {
  return Math.max(0, calendar.eventsForDate(dateKey).length - 3);
}

function requestDelete(): void {
  form.confirmingDelete = true;
}

function cancelDelete(): void {
  form.confirmingDelete = false;
}

function goToPrevious(): void {
  switch (activeView.value) {
    case "month":
      calendar.goToPreviousMonth();
      return;
    case "week":
    case "agenda":
      moveSelectedDate(-7);
      return;
    case "day":
      moveSelectedDate(-1);
      return;
  }
}

function goToNext(): void {
  switch (activeView.value) {
    case "month":
      calendar.goToNextMonth();
      return;
    case "week":
    case "agenda":
      moveSelectedDate(7);
      return;
    case "day":
      moveSelectedDate(1);
      return;
  }
}

function moveSelectedDate(dayOffset: number): void {
  calendar.selectDate(localDateKey(addDays(calendar.selectedDate.value, dayOffset)));
}

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) {
    return "All day";
  }

  return `${event.startAt.slice(11, 16)}-${event.endAt.slice(11, 16)}`;
}

function formatCompactDate(date: Date): string {
  return compactDateFormatter.format(date);
}

function formatCompactDateWithYear(date: Date): string {
  return compactDateWithYearFormatter.format(date);
}

function formatWeekday(date: Date): string {
  return weekdayFormatter.format(date);
}

function dateCellAriaLabel(cell: CalendarDayCell): string {
  const count = eventCountForDate(cell.dateKey);
  const eventLabel = count === 1 ? "1 event" : `${count} events`;
  const base =
    !showLunarCalendar.value || cell.lunarLongLabel === null
      ? cell.dateKey
      : `${cell.dateKey}, ${cell.lunarLongLabel}`;
  return count === 0 ? base : `${base}, ${eventLabel}`;
}

function viewTabId(view: CalendarViewMode): string {
  return `calendar-view-tab-${view}`;
}

function viewPanelId(view: CalendarViewMode): string {
  return `calendar-view-panel-${view}`;
}

function labelForStatus(status: CalendarStatus): string {
  switch (status) {
    case "idle":
      return "Ready";
    case "loading":
      return "Loading...";
    case "empty":
      return "No events yet.";
    case "ready":
      return "Ready";
    case "saving":
      return "Saving...";
    case "error":
      return "Error";
  }
}
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
      <AppToolbar class="calendar__toolbar">
        <template #start>
          <div class="calendar__title-group">
            <ToolbarTitle
              class="calendar__title-stack"
              :title="visibleRangeLabel"
              :subtitle="selectedDateLabel"
            />
          </div>
        </template>

        <div class="calendar__controls">
          <ToolbarGroup class="calendar__nav" label="Calendar navigation">
            <IconButton
              class="calendar__icon-button"
              :label="`Previous ${navigationUnitLabel}`"
              :icon="ChevronLeft"
              @click="goToPrevious"
            />
            <Button class="calendar__nav-button" size="sm" @click="calendar.goToToday"
              >Today</Button
            >
            <IconButton
              class="calendar__icon-button"
              :label="`Next ${navigationUnitLabel}`"
              :icon="ChevronRight"
              @click="goToNext"
            />
          </ToolbarGroup>

          <TabList
            class="calendar__view-switcher"
            :model-value="activeView"
            :tabs="viewTabOptions"
            label="Calendar view"
            size="sm"
            @change="onViewTabChange"
          />
        </div>

        <template #end>
          <Button
            class="calendar__new-button"
            size="sm"
            variant="primary"
            :icon-start="Plus"
            @click="openCreate()"
          >
            New
          </Button>
        </template>
      </AppToolbar>

      <StatusBanner
        v-if="showStatus"
        as="div"
        class="calendar__status"
        :tone="calendar.error.value !== null ? 'error' : 'info'"
        :class="{ 'calendar__status--error': calendar.error.value !== null }"
      >
        {{ statusText }}
      </StatusBanner>

      <main class="calendar__surface">
        <section
          v-if="activeView === 'month'"
          :id="viewPanelId('month')"
          class="calendar__view calendar__view--month"
          role="tabpanel"
          :aria-labelledby="viewTabId('month')"
        >
          <div class="calendar__month-layout">
            <div class="calendar__month-panel" aria-label="Month view">
              <div class="calendar__weekdays" aria-hidden="true">
                <GroupLabel as="span">Mon</GroupLabel>
                <GroupLabel as="span">Tue</GroupLabel>
                <GroupLabel as="span">Wed</GroupLabel>
                <GroupLabel as="span">Thu</GroupLabel>
                <GroupLabel as="span">Fri</GroupLabel>
                <GroupLabel as="span">Sat</GroupLabel>
                <GroupLabel as="span">Sun</GroupLabel>
              </div>

              <div class="calendar__grid" role="grid" :aria-label="visibleMonthLabel">
                <button
                  v-for="cell in calendar.monthGrid.value"
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
                  @click="calendar.selectDate(cell.dateKey)"
                >
                  <span class="calendar__day-heading">
                    <span class="calendar__day-number">{{ cell.dayOfMonth }}</span>
                    <span v-if="showLunarCalendar && cell.lunarLabel" class="calendar__lunar-label">
                      {{ cell.lunarLabel }}
                    </span>
                  </span>
                  <span class="calendar__day-events">
                    <span
                      v-for="event in eventChipsForDate(cell.dateKey)"
                      :key="event.id"
                      class="calendar__event-chip"
                      :class="`calendar__event-chip--${event.color}`"
                    >
                      <span class="calendar__event-chip-time">{{ formatEventTime(event) }}</span>
                      <span class="calendar__event-chip-title">{{ event.title }}</span>
                    </span>
                    <span v-if="eventOverflowForDate(cell.dateKey) > 0" class="calendar__overflow">
                      +{{ eventOverflowForDate(cell.dateKey) }}
                    </span>
                  </span>
                  <span
                    v-if="eventCountForDate(cell.dateKey) > 0"
                    class="calendar__day-summary"
                    aria-hidden="true"
                  >
                    <span class="calendar__day-dots">
                      <span
                        v-for="event in eventChipsForDate(cell.dateKey)"
                        :key="event.id"
                        class="calendar__day-dot"
                        :class="`calendar__day-dot--${event.color}`"
                      />
                    </span>
                    <span class="calendar__day-count">{{ eventCountForDate(cell.dateKey) }}</span>
                  </span>
                </button>
              </div>
            </div>

            <Panel
              as="aside"
              class="calendar__selected-panel"
              variant="subtle"
              padding="none"
              aria-label="Selected day events"
            >
              <header class="calendar__panel-header">
                <div class="calendar__panel-title-group">
                  <Clock class="calendar__panel-icon" aria-hidden="true" />
                  <div class="calendar__panel-title-stack">
                    <h3 class="calendar__panel-title">{{ selectedDateLabel }}</h3>
                    <p
                      v-if="selectedDateLunarLabel"
                      class="calendar__panel-lunar calendar__agenda-lunar"
                    >
                      {{ selectedDateLunarLabel }}
                    </p>
                  </div>
                </div>
                <Button size="sm" :icon-start="Plus" @click="openCreate()">New</Button>
              </header>

              <EmptyState
                v-if="calendar.selectedDateEvents.value.length === 0"
                class="calendar__empty"
              >
                No events.
              </EmptyState>
              <ScrollArea v-else as="ul" class="calendar__event-list">
                <li
                  v-for="event in calendar.selectedDateEvents.value"
                  :key="event.id"
                  class="calendar__event-list-item"
                >
                  <button
                    type="button"
                    class="calendar__event-button"
                    :class="`calendar__event-button--${event.color}`"
                    @click="openEdit(event)"
                  >
                    <span class="calendar__event-time">{{ formatEventTime(event) }}</span>
                    <span class="calendar__event-title">{{ event.title }}</span>
                    <span v-if="event.notes" class="calendar__event-notes">{{ event.notes }}</span>
                  </button>
                </li>
              </ScrollArea>
            </Panel>
          </div>
        </section>

        <section
          v-else-if="activeView === 'week'"
          :id="viewPanelId('week')"
          class="calendar__view calendar__view--week"
          role="tabpanel"
          :aria-labelledby="viewTabId('week')"
        >
          <div class="calendar__week-grid" role="grid" aria-label="Week view">
            <article
              v-for="cell in weekCells"
              :key="cell.dateKey"
              class="calendar__week-day"
              :class="{
                'calendar__week-day--today': cell.isToday,
                'calendar__week-day--selected': cell.isSelected,
              }"
              role="gridcell"
            >
              <button
                type="button"
                class="calendar__week-day-header"
                :aria-label="dateCellAriaLabel(cell)"
                @click="calendar.selectDate(cell.dateKey)"
              >
                <span class="calendar__week-weekday">{{ formatWeekday(cell.date) }}</span>
                <span class="calendar__week-date">{{ cell.dayOfMonth }}</span>
                <span v-if="showLunarCalendar && cell.lunarLabel" class="calendar__week-lunar">
                  {{ cell.lunarLabel }}
                </span>
                <span v-if="eventCountForDate(cell.dateKey) > 0" class="calendar__week-count">
                  {{ eventCountForDate(cell.dateKey) }}
                </span>
              </button>

              <div v-if="eventCountForDate(cell.dateKey) === 0" class="calendar__week-empty">
                No events
              </div>
              <ScrollArea v-else as="ul" class="calendar__week-day-events">
                <li v-for="event in calendar.eventsForDate(cell.dateKey)" :key="event.id">
                  <button
                    type="button"
                    class="calendar__event-button calendar__event-button--compact"
                    :class="`calendar__event-button--${event.color}`"
                    @click="openEdit(event)"
                  >
                    <span class="calendar__event-time">{{ formatEventTime(event) }}</span>
                    <span class="calendar__event-title">{{ event.title }}</span>
                  </button>
                </li>
              </ScrollArea>
            </article>
          </div>

          <Panel
            as="aside"
            class="calendar__week-selected calendar__selected-panel"
            variant="subtle"
            padding="none"
            aria-label="Selected day events"
          >
            <header class="calendar__panel-header">
              <div class="calendar__panel-title-group">
                <Clock class="calendar__panel-icon" aria-hidden="true" />
                <div class="calendar__panel-title-stack">
                  <h3 class="calendar__panel-title">{{ selectedDateLabel }}</h3>
                  <p
                    v-if="selectedDateLunarLabel"
                    class="calendar__panel-lunar calendar__agenda-lunar"
                  >
                    {{ selectedDateLunarLabel }}
                  </p>
                </div>
              </div>
              <Button size="sm" :icon-start="Plus" @click="openCreate()">New</Button>
            </header>

            <EmptyState
              v-if="calendar.selectedDateEvents.value.length === 0"
              class="calendar__empty"
            >
              No events.
            </EmptyState>
            <ScrollArea v-else as="ul" class="calendar__event-list">
              <li v-for="event in calendar.selectedDateEvents.value" :key="event.id">
                <button
                  type="button"
                  class="calendar__event-button"
                  :class="`calendar__event-button--${event.color}`"
                  @click="openEdit(event)"
                >
                  <span class="calendar__event-time">{{ formatEventTime(event) }}</span>
                  <span class="calendar__event-title">{{ event.title }}</span>
                  <span v-if="event.notes" class="calendar__event-notes">{{ event.notes }}</span>
                </button>
              </li>
            </ScrollArea>
          </Panel>
        </section>

        <section
          v-else-if="activeView === 'day'"
          :id="viewPanelId('day')"
          class="calendar__view calendar__view--day"
          role="tabpanel"
          :aria-labelledby="viewTabId('day')"
        >
          <Panel as="div" class="calendar__focus-panel" variant="subtle" padding="none">
            <header class="calendar__focus-header">
              <div>
                <GroupLabel as="p" class="calendar__focus-kicker">
                  {{ formatWeekday(selectedDayCell.date) }}
                </GroupLabel>
                <h3 class="calendar__focus-title">{{ selectedDateLabel }}</h3>
                <p
                  v-if="selectedDateLunarLabel"
                  class="calendar__panel-lunar calendar__agenda-lunar"
                >
                  {{ selectedDateLunarLabel }}
                </p>
              </div>
              <Button size="sm" variant="primary" :icon-start="Plus" @click="openCreate()"
                >New</Button
              >
            </header>

            <EmptyState
              v-if="calendar.selectedDateEvents.value.length === 0"
              class="calendar__empty calendar__empty--large"
            >
              No events.
            </EmptyState>
            <ScrollArea v-else as="ul" class="calendar__event-list calendar__event-list--roomy">
              <li v-for="event in calendar.selectedDateEvents.value" :key="event.id">
                <button
                  type="button"
                  class="calendar__event-button calendar__event-button--roomy"
                  :class="`calendar__event-button--${event.color}`"
                  @click="openEdit(event)"
                >
                  <span class="calendar__event-time">{{ formatEventTime(event) }}</span>
                  <span class="calendar__event-title">{{ event.title }}</span>
                  <span v-if="event.notes" class="calendar__event-notes">{{ event.notes }}</span>
                </button>
              </li>
            </ScrollArea>
          </Panel>
        </section>

        <section
          v-else
          :id="viewPanelId('agenda')"
          class="calendar__view calendar__view--agenda"
          role="tabpanel"
          :aria-labelledby="viewTabId('agenda')"
        >
          <EmptyState
            v-if="agendaGroups.length === 0"
            class="calendar__empty calendar__empty--large"
          >
            No events in this range.
          </EmptyState>

          <div v-else class="calendar__agenda-groups">
            <section
              v-for="group in agendaGroups"
              :key="group.cell.dateKey"
              class="calendar__agenda-group"
            >
              <header class="calendar__agenda-group-header">
                <div>
                  <h3 class="calendar__agenda-group-title">
                    {{ fullDateFormatter.format(group.cell.date) }}
                  </h3>
                  <p
                    v-if="showLunarCalendar && group.cell.lunarLongLabel"
                    class="calendar__panel-lunar"
                  >
                    {{ group.cell.lunarLongLabel }}
                  </p>
                </div>
                <Button size="sm" :icon-start="Plus" @click="openCreate(group.cell.dateKey)"
                  >New</Button
                >
              </header>

              <ScrollArea as="ul" class="calendar__event-list">
                <li v-for="event in group.events" :key="`${group.cell.dateKey}-${event.id}`">
                  <button
                    type="button"
                    class="calendar__event-button"
                    :class="`calendar__event-button--${event.color}`"
                    @click="openEdit(event)"
                  >
                    <span class="calendar__event-time">{{ formatEventTime(event) }}</span>
                    <span class="calendar__event-title">{{ event.title }}</span>
                    <span v-if="event.notes" class="calendar__event-notes">{{ event.notes }}</span>
                  </button>
                </li>
              </ScrollArea>
            </section>
          </div>
        </section>
      </main>

      <CalendarEventDialog
        v-model:open="dialogOpen"
        :title="dialogTitle"
        :variant="dialogVariant"
        :event-colors="EVENT_COLORS"
        :form="form"
        :form-error="formError"
        @all-day-change="onAllDayChange"
        @cancel-delete="cancelDelete"
        @close="closeDialog"
        @confirm-delete="confirmDelete"
        @request-delete="requestDelete"
        @submit="submitForm"
      />
    </template>
  </AppFrame>
</template>

<style scoped lang="scss">
.calendar {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-size: var(--font-size-sm);
  inline-size: 100%;
  min-block-size: 0;
}

.calendar__toolbar {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
  display: grid;
  flex: 0 0 auto;
  gap: var(--space-sm);
  grid-template-columns: minmax(0, 1fr) auto auto;
  min-block-size: 56px;
  padding: var(--space-xs) var(--space-sm);
}

.calendar__toolbar :deep(.ds-kit-toolbar__section) {
  display: contents;
}

.calendar__title-group {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.calendar__panel-icon {
  block-size: 20px;
  color: var(--color-accent);
  flex: 0 0 auto;
  inline-size: 20px;
}

.calendar__panel-title-stack {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.calendar__panel-title,
.calendar__focus-title,
.calendar__agenda-group-title {
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
  margin: 0;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.calendar__panel-lunar,
.calendar__event-time,
.calendar__event-notes,
.calendar__week-empty {
  color: var(--color-fg-muted);
}

.calendar__panel-lunar {
  font-size: var(--font-size-xs);
  line-height: 1.25;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar__controls {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  justify-content: end;
  min-inline-size: 0;
}

.calendar__nav {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
}

.calendar__icon-button {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);

  &:hover,
  &:focus-visible {
    border-color: var(--color-accent);
  }
}

.calendar__nav-button {
  min-block-size: 32px;
}

.calendar__view-switcher {
  background: var(--color-bg);
  flex: 0 1 auto;
  min-inline-size: 0;
}

.calendar__new-button {
  justify-self: end;
}

.calendar__status {
  background: var(--color-bg-elevated);
  border-block-start: 0;
  border-block-end: 1px solid var(--color-border);
  border-inline: 0;
  border-radius: 0;
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  padding: var(--space-xs) var(--space-sm);
}

.calendar__status--error {
  color: var(--color-error);
}

.calendar__surface,
.calendar__view {
  flex: 1 1 auto;
  min-block-size: 0;
  min-inline-size: 0;
}

.calendar__surface {
  display: flex;
  overflow: hidden;
}

.calendar__view {
  display: flex;
  flex-direction: column;
}

.calendar__month-layout {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 30%);
  min-block-size: 0;
}

.calendar__month-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-block-size: 0;
  min-inline-size: 0;
}

.calendar__weekdays {
  background: var(--color-bg);
  border-block-end: 1px solid var(--color-border);
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));

  span {
    padding: var(--space-sm);
  }
}

.calendar__grid {
  display: grid;
  grid-auto-rows: minmax(86px, 1fr);
  grid-template-columns: repeat(7, minmax(0, 1fr));
  min-block-size: 0;
  overflow: auto;
}

.calendar__day {
  background: transparent;
  border: 0;
  border-block-end: 1px solid var(--color-border);
  border-inline-end: 1px solid var(--color-border);
  color: var(--color-fg);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-block-size: 86px;
  min-inline-size: 0;
  padding: var(--space-xs);
  text-align: start;

  &:hover {
    background: var(--color-bg-subtle);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
}

.calendar__day--muted {
  color: var(--color-fg-muted);
}

.calendar__day--today .calendar__day-number,
.calendar__week-day--today .calendar__week-date {
  background: var(--color-accent);
  color: var(--color-accent-fg);
}

.calendar__day--selected,
.calendar__week-day--selected {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}

.calendar__day-heading {
  align-items: center;
  display: flex;
  gap: var(--space-xs);
  inline-size: 100%;
  justify-content: space-between;
  min-inline-size: 0;
}

.calendar__day-number,
.calendar__week-date {
  align-items: center;
  border-radius: var(--radius-full);
  display: inline-flex;
  font-weight: var(--font-weight-bold);
  justify-content: center;
  line-height: 1;
}

.calendar__day-number {
  font-size: 15px;
  min-block-size: 24px;
  min-inline-size: 24px;
}

.calendar__lunar-label,
.calendar__week-lunar {
  color: var(--color-fg-muted);
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar__lunar-label {
  flex: 1 1 auto;
  font-size: 11px;
  line-height: 1.15;
  text-align: end;
}

.calendar__day-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.calendar__event-chip,
.calendar__overflow {
  background: color-mix(in srgb, var(--event-color, var(--color-accent)) 14%, transparent);
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  display: flex;
  gap: var(--space-xs);
  min-inline-size: 0;
  overflow: hidden;
  padding: 1px var(--space-xs);
  white-space: nowrap;
}

.calendar__event-chip-title,
.calendar__event-chip-time {
  overflow: hidden;
  text-overflow: ellipsis;
}

.calendar__event-chip-time {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  font-size: 11px;
}

.calendar__overflow {
  color: var(--color-fg-muted);
}

.calendar__day-summary {
  align-items: center;
  display: none;
  gap: var(--space-xs);
  margin-block-start: auto;
}

.calendar__day-dots {
  display: inline-flex;
  gap: 2px;
  min-inline-size: 0;
}

.calendar__day-dot {
  background: var(--event-color, var(--color-accent));
  block-size: 5px;
  border-radius: var(--radius-full);
  inline-size: 5px;
}

.calendar__day-count {
  color: var(--color-fg-muted);
  font-size: 11px;
}

.calendar__event-chip--blue,
.calendar__event-button--blue,
.calendar__day-dot--blue {
  --event-color: var(--color-accent);
}

.calendar__event-chip--green,
.calendar__event-button--green,
.calendar__day-dot--green {
  --event-color: var(--color-success);
}

.calendar__event-chip--yellow,
.calendar__event-button--yellow,
.calendar__day-dot--yellow {
  --event-color: color-mix(in srgb, var(--color-success) 42%, var(--color-error));
}

.calendar__event-chip--red,
.calendar__event-button--red,
.calendar__day-dot--red {
  --event-color: var(--color-error);
}

.calendar__event-chip--purple,
.calendar__event-button--purple,
.calendar__day-dot--purple {
  --event-color: var(--color-accent-sheen);
}

.calendar__event-chip--gray,
.calendar__event-button--gray,
.calendar__day-dot--gray {
  --event-color: var(--color-fg-muted);
}

.calendar__selected-panel,
.calendar__focus-panel {
  background: var(--color-bg-subtle);
  display: flex;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.calendar__selected-panel {
  border-inline-start: 1px solid var(--color-border);
}

.calendar__panel-header,
.calendar__focus-header,
.calendar__agenda-group-header {
  align-items: center;
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
  justify-content: space-between;
  padding: var(--space-sm);
}

.calendar__panel-title-group {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.calendar__panel-title {
  font-size: 14px;
  white-space: nowrap;
}

.calendar__empty {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  flex: 1 1 auto;
  justify-content: center;
  padding: var(--space-lg);
  text-align: center;
}

.calendar__empty--large {
  background: var(--color-bg);
  min-block-size: 220px;
}

.calendar__event-list,
.calendar__week-day-events {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  min-block-size: 0;
  padding: var(--space-sm);
}

.calendar__event-button {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-inline-start: 3px solid var(--event-color, var(--color-accent));
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: 2px;
  inline-size: 100%;
  min-block-size: 58px;
  padding: var(--space-sm);
  text-align: start;

  &:hover,
  &:focus-visible {
    border-color: var(--event-color, var(--color-accent));
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.calendar__event-button--compact {
  min-block-size: 46px;
  padding: var(--space-xs) var(--space-sm);
}

.calendar__event-button--roomy {
  min-block-size: 68px;
}

.calendar__event-time,
.calendar__event-notes {
  font-size: 12px;
}

.calendar__event-title {
  font-weight: var(--font-weight-bold);
  overflow-wrap: anywhere;
}

.calendar__event-notes {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar__view--week {
  background: var(--color-bg);
  min-block-size: 0;
}

.calendar__week-grid {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  min-block-size: 0;
  overflow: auto;
}

.calendar__week-day {
  border-inline-end: 1px solid var(--color-border);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-block-size: 0;
  min-inline-size: 0;
}

.calendar__week-day-header {
  align-items: start;
  background: transparent;
  border: 0;
  border-block-end: 1px solid var(--color-border);
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: 4px;
  min-block-size: 90px;
  padding: var(--space-sm);
  text-align: start;

  &:hover {
    background: var(--color-bg-subtle);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
}

.calendar__week-weekday {
  color: var(--color-fg-muted);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0;
  text-transform: uppercase;
}

.calendar__week-date {
  font-size: 18px;
  min-block-size: 28px;
  min-inline-size: 28px;
}

.calendar__week-lunar {
  font-size: 11px;
}

.calendar__week-count {
  align-self: end;
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  border-radius: var(--radius-full);
  color: var(--color-accent);
  font-size: 11px;
  justify-self: start;
  padding: 1px var(--space-xs);
}

.calendar__week-empty {
  font-size: 12px;
  padding: var(--space-sm);
}

.calendar__week-selected {
  display: none;
}

.calendar__view--day,
.calendar__view--agenda {
  background: var(--color-bg);
  overflow: auto;
}

.calendar__focus-panel {
  background: var(--color-bg);
  inline-size: min(760px, 100%);
  margin-inline: auto;
}

.calendar__focus-header {
  align-items: flex-start;
  border-block-end: 1px solid var(--color-border);
  padding: var(--space-lg);
}

.calendar__focus-kicker {
  margin-block-end: var(--space-xs);
}

.calendar__focus-title {
  font-size: 22px;
}

.calendar__event-list--roomy {
  padding: var(--space-lg);
}

.calendar__agenda-groups {
  display: grid;
  gap: var(--space-md);
  inline-size: min(820px, 100%);
  margin-inline: auto;
  padding: var(--space-md);
}

.calendar__agenda-group {
  border-block-end: 1px solid var(--color-border);
  display: grid;
  gap: var(--space-xs);
  padding-block-end: var(--space-md);
}

.calendar__agenda-group-header {
  border-block-end: 0;
  padding: var(--space-xs) 0;
}

.calendar__agenda-group-title {
  font-size: 15px;
}

@media (max-width: 900px) {
  .calendar__toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .calendar__controls {
    grid-column: 1 / -1;
    justify-content: stretch;
  }

  .calendar__view-switcher {
    flex: 1 1 auto;
    overflow-x: auto;
  }
}

@media (max-width: 720px) {
  .calendar__toolbar {
    align-items: stretch;
    grid-template-areas:
      "nav new"
      "views views";
    grid-template-columns: minmax(0, 1fr) auto;
    min-block-size: 0;
    padding-block: var(--space-sm);
  }

  .calendar__title-group {
    display: none;
  }

  .calendar__controls {
    display: contents;
  }

  .calendar__nav {
    grid-area: nav;
    justify-content: space-between;
    min-inline-size: 0;
  }

  .calendar__view-switcher {
    grid-area: views;
    inline-size: 100%;
  }

  .calendar__icon-button,
  .calendar__nav-button,
  .calendar__new-button,
  :deep(.ds-button) {
    min-block-size: 40px;
  }

  .calendar__nav-button {
    flex: 1 1 auto;
  }

  .calendar__new-button {
    align-self: stretch;
    grid-area: new;
    justify-self: end;
  }

  .calendar__surface {
    overflow: auto;
  }

  .calendar__month-layout {
    grid-template-columns: 1fr;
  }

  .calendar__month-panel {
    min-block-size: auto;
  }

  .calendar__grid {
    grid-auto-rows: minmax(52px, auto);
    overflow: visible;
  }

  .calendar__weekdays span {
    padding: var(--space-xs);
    text-align: center;
  }

  .calendar__day {
    gap: 2px;
    min-block-size: 52px;
    padding: 4px;
  }

  .calendar__day-number {
    font-size: 13px;
    min-block-size: 22px;
    min-inline-size: 22px;
  }

  .calendar__lunar-label,
  .calendar__day-events {
    display: none;
  }

  .calendar__day-summary {
    display: inline-flex;
  }

  .calendar__selected-panel {
    border-block-start: 1px solid var(--color-border);
    border-inline-start: 0;
  }

  .calendar__panel-header,
  .calendar__focus-header,
  .calendar__agenda-group-header {
    align-items: flex-start;
  }

  .calendar__panel-title {
    white-space: normal;
  }

  .calendar__week-grid {
    display: flex;
    flex: 0 0 auto;
    gap: var(--space-xs);
    min-block-size: 118px;
    overflow-x: auto;
    padding: var(--space-sm);
  }

  .calendar__week-day {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    flex: 0 0 min(44vw, 160px);
    min-block-size: 102px;
    overflow: hidden;
  }

  .calendar__week-day-header {
    border-block-end: 0;
    min-block-size: 100%;
  }

  .calendar__week-empty,
  .calendar__week-day-events {
    display: none;
  }

  .calendar__week-selected {
    display: flex;
  }

  .calendar__focus-header {
    padding: var(--space-md);
  }

  .calendar__focus-title {
    font-size: 18px;
  }

  .calendar__event-list,
  .calendar__event-list--roomy {
    padding: var(--space-sm);
  }

  .calendar__agenda-groups {
    gap: var(--space-sm);
    padding: var(--space-sm);
  }
}

@media (max-width: 430px) {
  .calendar__view-button span {
    font-size: 12px;
  }

  .calendar__new-button {
    padding-inline: var(--space-sm);
  }

  .calendar__week-day {
    flex-basis: min(58vw, 180px);
  }
}
</style>
