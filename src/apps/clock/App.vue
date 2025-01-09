<script setup lang="ts">
import { computed, ref } from "vue";

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

const tabs: Array<{ id: ClockTab; label: string; icon: typeof Clock }> = [
  { id: "now", label: "Now", icon: Clock },
  { id: "timer", label: "Timer", icon: Timer },
  { id: "stopwatch", label: "Stopwatch", icon: Flag },
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

function tabId(tab: ClockTab): string {
  return `clock-tab-${tab}`;
}

function panelId(tab: ClockTab): string {
  return `clock-panel-${tab}`;
}

function timerPartValue(part: TimerPart): number {
  return clock.timerParts.value[part];
}

function onTimerPartInput(part: TimerPart, event: Event): void {
  const target = event.target as HTMLInputElement;
  clock.setTimerPart(part, target.value);
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
  <section class="clock-app" aria-label="Clock">
    <div class="clock-app__topbar">
      <header class="clock-app__header">
        <div class="clock-app__title">
          <Clock aria-hidden="true" />
          <h2>Clock</h2>
        </div>
      </header>
      <div class="clock-app__tabs" role="tablist" aria-label="Clock sections">
        <button
          v-for="tab in tabs"
          :id="tabId(tab.id)"
          :key="tab.id"
          type="button"
          class="clock-app__tab"
          :class="{ 'clock-app__tab--active': activeTab === tab.id }"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-controls="panelId(tab.id)"
          @click="selectTab(tab.id)"
        >
          <component :is="tab.icon" aria-hidden="true" />
          <span>{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <main class="clock-app__body">
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
          <span v-if="timerFinished" class="clock-app__status" role="status">Time's up</span>
        </div>

        <div class="clock-app__inputs" aria-label="Timer duration">
          <label class="clock-app__number-field">
            <span>Hours</span>
            <input
              type="number"
              min="0"
              max="23"
              step="1"
              inputmode="numeric"
              aria-label="Timer hours"
              :disabled="!clock.timerCanEdit.value"
              :value="timerPartValue('hours')"
              @input="onTimerPartInput('hours', $event)"
            />
          </label>
          <label class="clock-app__number-field">
            <span>Minutes</span>
            <input
              type="number"
              min="0"
              max="59"
              step="1"
              inputmode="numeric"
              aria-label="Timer minutes"
              :disabled="!clock.timerCanEdit.value"
              :value="timerPartValue('minutes')"
              @input="onTimerPartInput('minutes', $event)"
            />
          </label>
          <label class="clock-app__number-field">
            <span>Seconds</span>
            <input
              type="number"
              min="0"
              max="59"
              step="1"
              inputmode="numeric"
              aria-label="Timer seconds"
              :disabled="!clock.timerCanEdit.value"
              :value="timerPartValue('seconds')"
              @input="onTimerPartInput('seconds', $event)"
            />
          </label>
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

        <ol v-if="clock.laps.value.length > 0" class="clock-app__laps" aria-label="Stopwatch laps">
          <li v-for="(lap, index) in clock.laps.value" :key="`${lap}-${index}`">
            <span>Lap {{ clock.laps.value.length - index }}</span>
            <time :datetime="durationDatetime(lap)">{{ formatStopwatchDurationMs(lap) }}</time>
          </li>
        </ol>
      </section>
    </main>
  </section>
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

.clock-app__header {
  align-items: center;
  display: flex;
  min-inline-size: 0;
}

.clock-app__title {
  align-items: center;
  display: inline-flex;
  gap: var(--space-sm);
  min-inline-size: 0;

  svg {
    block-size: 20px;
    color: var(--color-accent);
    inline-size: 20px;
  }

  h2 {
    font-size: 15px;
    font-weight: 650;
    line-height: 1.2;
    margin: 0;
  }
}

.clock-app__tabs {
  align-items: center;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: inline-flex;
  gap: 2px;
  padding: 2px;
}

.clock-app__tab {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius-md) - 2px);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  gap: var(--space-xs);
  min-block-size: 30px;
  padding: 0 var(--space-sm);

  svg {
    block-size: 14px;
    inline-size: 14px;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.clock-app__tab--active {
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-sm);
  color: var(--color-fg);
}

.clock-app__body {
  grid-area: body;
  min-block-size: 0;
  overflow: auto;
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
  font-weight: 700;
  line-height: 1;
}

.clock-app__now-time {
  font-size: var(--clock-now-size);
}

.clock-app__now-date {
  color: var(--color-fg);
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.clock-app__timezone {
  color: var(--color-fg-muted);
  font-size: 13px;
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

.clock-app__readout--finished time,
.clock-app__status {
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

.clock-app__status {
  font-size: 13px;
  font-weight: 650;
}

.clock-app__inputs {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(3, minmax(0, 96px));
  justify-content: center;
}

.clock-app__number-field {
  display: grid;
  gap: var(--space-xs);

  span {
    color: var(--color-fg-muted);
    font-size: 12px;
    font-weight: 600;
  }

  input {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-fg);
    font: inherit;
    font-variant-numeric: tabular-nums;
    inline-size: 100%;
    min-block-size: 38px;
    padding: 0 var(--space-sm);
    text-align: center;

    &:focus {
      border-color: var(--color-accent);
      outline: 2px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
      outline-offset: 1px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
  }
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
  overflow: auto;
  padding: 0;

  li {
    align-items: center;
    display: flex;
    font-size: 13px;
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
    font-weight: 650;
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

  .clock-app__header {
    display: none;
  }

  .clock-app__tabs {
    display: grid;
    gap: 3px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    inline-size: 100%;
    padding: 3px;
  }

  .clock-app__tab {
    flex-direction: column;
    font-size: 12px;
    gap: 3px;
    justify-content: center;
    min-block-size: 48px;
    min-inline-size: 0;
    padding: 0 var(--space-xs);

    svg {
      block-size: 16px;
      inline-size: 16px;
    }

    span {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .clock-app__body {
    overscroll-behavior: contain;
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

  .clock-app__tab {
    min-block-size: 44px;
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
