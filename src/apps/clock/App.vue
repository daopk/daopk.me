<script setup lang="ts">
import { computed, ref } from "vue";

import { AppFrame, Badge, FormField, ScrollArea, TabList, TextInput } from "~/components/kit";
import type { TabListOption } from "~/components/kit";
import { Button } from "~/components/ui";
import { Clock, Flag, Pause, Play, RotateCcw, Timer } from "~/icons/lucide";

import { formatClockLongDate, formatClockSecond, toLocalIsoSecond } from "./useClockNow";
import {
  formatStopwatchDurationMs,
  type ClockTab,
  type TimerPart,
  useClockApp,
} from "./useClockApp";

const clock = useClockApp();
const activeTab = ref<ClockTab>("now");

const tabs: readonly TabListOption[] = [
  { value: "now", label: "Now", icon: Clock, id: tabId("now"), panelId: panelId("now") },
  { value: "timer", label: "Timer", icon: Timer, id: tabId("timer"), panelId: panelId("timer") },
  {
    value: "stopwatch",
    label: "Stopwatch",
    icon: Flag,
    id: tabId("stopwatch"),
    panelId: panelId("stopwatch"),
  },
];

const nowDate = computed(() => new Date(clock.currentMs.value));
const nowTimeLabel = computed(() => formatClockSecond(nowDate.value));
const nowDateLabel = computed(() => formatClockLongDate(nowDate.value));
const nowDatetime = computed(() => toLocalIsoSecond(nowDate.value));
const timezoneLabel = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Local");
const timerFinished = computed(() => clock.timerStatus.value === "finished");
const timerRunning = computed(() => clock.timerStatus.value === "running");
const timerPrimaryLabel = computed(() => {
  if (clock.timerStatus.value === "paused") return "Resume";
  return "Start";
});
const stopwatchPrimaryLabel = computed(() => {
  if (clock.stopwatchStatus.value === "paused") return "Resume";
  return "Start";
});
const stopwatchDisplayParts = computed(() => {
  const [time, milliseconds = "000"] = clock.stopwatchDisplay.value.split(".");
  return { time, milliseconds };
});

function selectTab(tab: ClockTab): void {
  activeTab.value = tab;
}

function selectTabValue(tab: string): void {
  if (tab === "now" || tab === "timer" || tab === "stopwatch") {
    selectTab(tab);
  }
}

function tabId(tab: ClockTab): string {
  return `clock-tab-${tab}`;
}

function panelId(tab: ClockTab): string {
  return `clock-panel-${tab}`;
}

function timerPartValue(part: TimerPart): number {
  return clock.timerParts.value[part];
}

function setTimerPreset(minutes: number): void {
  clock.setTimerDuration(minutes * 60_000);
}

function runTimerPrimary(): void {
  if (clock.timerStatus.value === "paused") {
    clock.resumeTimer();
    return;
  }
  clock.startTimer();
}

function runStopwatchPrimary(): void {
  clock.startStopwatch();
}

function durationDatetime(ms: number): string {
  return `PT${(Math.max(0, Math.floor(ms)) / 1000).toFixed(3)}S`;
}
</script>

<template>
  <AppFrame class="clock-app" layout="grid" :safe-area="false" aria-label="Clock">
    <div class="clock-app__topbar">
      <TabList
        class="clock-app__tabs"
        :model-value="activeTab"
        :tabs="tabs"
        label="Clock sections"
        @update:model-value="selectTabValue"
      />
    </div>

    <ScrollArea as="main" class="clock-app__body">
      <section
        v-show="activeTab === 'now'"
        :id="panelId('now')"
        class="clock-app__panel clock-app__panel--now"
        role="tabpanel"
        :aria-labelledby="tabId('now')"
      >
        <time class="clock-app__now-time" :datetime="nowDatetime">{{ nowTimeLabel }}</time>
        <p class="clock-app__now-date">{{ nowDateLabel }}</p>
        <p class="clock-app__timezone">{{ timezoneLabel }}</p>
      </section>

      <section
        v-show="activeTab === 'timer'"
        :id="panelId('timer')"
        class="clock-app__panel clock-app__panel--timer"
        role="tabpanel"
        :aria-labelledby="tabId('timer')"
      >
        <div class="clock-app__readout" :class="{ 'clock-app__readout--finished': timerFinished }">
          <time :datetime="`PT${Math.floor(clock.timerRemainingMs.value / 1000)}S`">
            {{ clock.timerDisplay.value }}
          </time>
          <Badge v-if="timerFinished" tone="accent" size="md" role="status">Time's up</Badge>
        </div>

        <div class="clock-app__inputs" aria-label="Timer duration">
          <FormField class="clock-app__number-field" label="Hours">
            <TextInput
              type="number"
              min="0"
              max="23"
              step="1"
              inputmode="numeric"
              aria-label="Timer hours"
              :disabled="!clock.timerCanEdit.value"
              :model-value="String(timerPartValue('hours'))"
              @update:model-value="clock.setTimerPart('hours', $event)"
            />
          </FormField>
          <FormField class="clock-app__number-field" label="Minutes">
            <TextInput
              type="number"
              min="0"
              max="59"
              step="1"
              inputmode="numeric"
              aria-label="Timer minutes"
              :disabled="!clock.timerCanEdit.value"
              :model-value="String(timerPartValue('minutes'))"
              @update:model-value="clock.setTimerPart('minutes', $event)"
            />
          </FormField>
          <FormField class="clock-app__number-field" label="Seconds">
            <TextInput
              type="number"
              min="0"
              max="59"
              step="1"
              inputmode="numeric"
              aria-label="Timer seconds"
              :disabled="!clock.timerCanEdit.value"
              :model-value="String(timerPartValue('seconds'))"
              @update:model-value="clock.setTimerPart('seconds', $event)"
            />
          </FormField>
        </div>

        <div class="clock-app__presets" aria-label="Timer presets">
          <Button size="sm" :disabled="timerRunning" @click="setTimerPreset(1)">1m</Button>
          <Button size="sm" :disabled="timerRunning" @click="setTimerPreset(5)">5m</Button>
          <Button size="sm" :disabled="timerRunning" @click="setTimerPreset(10)">10m</Button>
          <Button size="sm" :disabled="timerRunning" @click="setTimerPreset(25)">25m</Button>
        </div>

        <div class="clock-app__controls">
          <Button
            v-if="clock.timerStatus.value !== 'running'"
            variant="primary"
            :icon-start="Play"
            :disabled="
              clock.timerStatus.value === 'paused'
                ? !clock.timerCanResume.value
                : !clock.timerCanStart.value
            "
            @click="runTimerPrimary"
          >
            {{ timerPrimaryLabel }}
          </Button>
          <Button v-else variant="primary" :icon-start="Pause" @click="clock.pauseTimer">
            Pause
          </Button>
          <Button :icon-start="RotateCcw" @click="clock.resetTimer">Reset</Button>
        </div>
      </section>

      <section
        v-show="activeTab === 'stopwatch'"
        :id="panelId('stopwatch')"
        class="clock-app__panel clock-app__panel--stopwatch"
        role="tabpanel"
        :aria-labelledby="tabId('stopwatch')"
      >
        <div class="clock-app__readout clock-app__readout--stopwatch">
          <time
            class="clock-app__stopwatch-time"
            :datetime="durationDatetime(clock.stopwatchElapsedMs.value)"
          >
            <span>{{ stopwatchDisplayParts.time }}</span>
            <span class="clock-app__milliseconds">.{{ stopwatchDisplayParts.milliseconds }}</span>
          </time>
        </div>

        <div class="clock-app__controls">
          <Button
            v-if="clock.stopwatchStatus.value !== 'running'"
            variant="primary"
            :icon-start="Play"
            @click="runStopwatchPrimary"
          >
            {{ stopwatchPrimaryLabel }}
          </Button>
          <Button v-else variant="primary" :icon-start="Pause" @click="clock.pauseStopwatch">
            Pause
          </Button>
          <Button
            :icon-start="Flag"
            :disabled="!clock.stopwatchCanLap.value"
            @click="clock.lapStopwatch"
          >
            Lap
          </Button>
          <Button :icon-start="RotateCcw" @click="clock.resetStopwatch">Reset</Button>
        </div>

        <ScrollArea
          v-if="clock.laps.value.length > 0"
          as="ol"
          class="clock-app__laps"
          aria-label="Stopwatch laps"
        >
          <li v-for="(lap, index) in clock.laps.value" :key="`${lap}-${index}`">
            <span>Lap {{ clock.laps.value.length - index }}</span>
            <time :datetime="durationDatetime(lap)">{{ formatStopwatchDurationMs(lap) }}</time>
          </li>
        </ScrollArea>
      </section>
    </ScrollArea>
  </AppFrame>
</template>

<style scoped lang="scss">
.clock-app {
  --clock-now-size: 88px;
  --clock-readout-size: 72px;

  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: grid;
  grid-template-areas:
    "topbar"
    "body";
  grid-template-rows: auto minmax(0, 1fr);
  inline-size: 100%;
  min-block-size: 0;
  overflow: hidden;
}

.clock-app__topbar {
  align-items: center;
  border-block-end: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-md);
  grid-area: topbar;
  justify-content: space-between;
  padding: var(--space-md);
}

.clock-app__body {
  grid-area: body;
  min-block-size: 0;
}

.clock-app__panel {
  align-content: center;
  display: grid;
  gap: var(--space-lg);
  min-block-size: 100%;
  padding: clamp(20px, 5vw, 48px);
}

.clock-app__panel--now {
  justify-items: center;
  text-align: center;
}

.clock-app__now-time,
.clock-app__readout time {
  font-variant-numeric: tabular-nums;
  font-weight: var(--font-weight-bold);
  line-height: 1;
}

.clock-app__now-time {
  font-size: var(--clock-now-size);
}

.clock-app__now-date {
  color: var(--color-fg);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  margin: 0;
}

.clock-app__timezone {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  margin: 0;
}

.clock-app__readout {
  align-items: center;
  display: grid;
  gap: var(--space-sm);
  justify-items: center;
  text-align: center;

  time {
    font-size: var(--clock-readout-size);
  }
}

.clock-app__readout--finished time {
  color: var(--color-accent);
}

.clock-app__stopwatch-time {
  white-space: nowrap;
}

.clock-app__milliseconds {
  color: var(--color-fg-muted);
  font-size: 0.48em;
  line-height: 1;
}

.clock-app__inputs {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(3, minmax(0, 96px));
  justify-content: center;
}

.clock-app__number-field input {
  font-variant-numeric: tabular-nums;
  min-block-size: 38px;
  text-align: center;
}

.clock-app__presets,
.clock-app__controls {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  justify-content: center;
}

.clock-app__laps {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  inline-size: min(420px, 100%);
  justify-self: center;
  list-style: none;
  margin: 0;
  max-block-size: 180px;
  padding: 0;

  li {
    align-items: center;
    display: flex;
    font-size: var(--font-size-sm);
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
  }

  li + li {
    border-block-start: 1px solid var(--color-border);
  }

  span {
    color: var(--color-fg-muted);
  }

  time {
    font-variant-numeric: tabular-nums;
    font-weight: var(--font-weight-bold);
  }
}

@media (min-width: 768px) and (min-height: 760px) {
  .clock-app {
    --clock-now-size: 112px;
    --clock-readout-size: 92px;
  }
}

@media (max-width: 767px) {
  .clock-app {
    --clock-now-size: 60px;
    --clock-readout-size: 56px;

    grid-template-areas:
      "body"
      "topbar";
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .clock-app__topbar {
    background: var(--color-bg-elevated);
    border-block-end: 0;
    border-block-start: 1px solid var(--color-border);
    box-shadow: 0 -8px 24px color-mix(in srgb, var(--color-fg) 8%, transparent);
    padding-block-end: calc(var(--space-sm) + var(--mobile-shell-app-bottom-padding, 0px));
    padding-block-start: var(--space-sm);
    padding-inline-end: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-right, 0px));
    padding-inline-start: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-left, 0px));
  }

  .clock-app__tabs {
    display: grid;
    gap: 3px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    inline-size: 100%;
    padding: 3px;
  }

  .clock-app__panel {
    gap: var(--space-md);
    padding-block: var(--space-lg);
    padding-inline-end: calc(var(--space-md) + var(--mobile-shell-app-safe-area-right, 0px));
    padding-inline-start: calc(var(--space-md) + var(--mobile-shell-app-safe-area-left, 0px));
  }

  .clock-app__inputs {
    inline-size: min(420px, 100%);
    grid-template-columns: repeat(3, minmax(0, 1fr));
    justify-self: center;
  }

  .clock-app__number-field {
    min-inline-size: 0;
    text-align: center;

    input {
      font-size: 16px;
      min-block-size: 48px;
    }
  }

  .clock-app__presets,
  .clock-app__controls {
    display: grid;
    gap: var(--space-sm);
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
    inline-size: min(420px, 100%);
    justify-self: center;
  }

  .clock-app__presets :deep(.ds-button),
  .clock-app__controls :deep(.ds-button) {
    inline-size: 100%;
    justify-content: center;
    min-block-size: 44px;
  }

  .clock-app__panel--stopwatch {
    align-content: stretch;
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .clock-app__laps {
    align-self: stretch;
    max-block-size: none;
    min-block-size: 0;
  }
}

@media (max-width: 767px) and (max-height: 430px) {
  .clock-app {
    --clock-now-size: 52px;
    --clock-readout-size: 44px;
  }

  .clock-app__panel {
    align-content: start;
    gap: var(--space-sm);
    padding-block: var(--space-sm);
  }

  .clock-app__number-field {
    gap: 3px;

    input {
      min-block-size: 44px;
    }
  }
}
</style>
