import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from "vue";

import { activeProfileKvNamespace, KVStore } from "@daopk/sdk";

export const CLOCK_KV_NAMESPACE = "clock";
export const CLOCK_KV_PRIMARY_KEY = "state";
export const DEFAULT_TIMER_DURATION_MS = 5 * 60_000;
export const MAX_TIMER_DURATION_MS = 23 * 60 * 60_000 + 59 * 60_000 + 59_000;
const DEFAULT_TICK_MS = 1000;
const STOPWATCH_TICK_MS = 10;

export type ClockTab = "now" | "timer" | "stopwatch";
export type TimerStatus = "idle" | "running" | "paused" | "finished";
export type StopwatchStatus = "idle" | "running" | "paused";
export type TimerPart = "hours" | "minutes" | "seconds";

export interface TimerState {
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  endsAtMs: number | null;
}

export interface StopwatchState {
  status: StopwatchStatus;
  startedAtMs: number | null;
  accumulatedMs: number;
  laps: number[];
}

export interface ClockAppState {
  timer: TimerState;
  stopwatch: StopwatchState;
}

export interface DurationParts {
  hours: number;
  minutes: number;
  seconds: number;
}

interface CoerceResult {
  state: ClockAppState;
  changed: boolean;
}

export interface UseClockAppOptions {
  now?: () => number;
  storageNamespace?: string;
  tickMs?: number;
}

function defaultTimerState(): TimerState {
  return {
    status: "idle",
    durationMs: DEFAULT_TIMER_DURATION_MS,
    remainingMs: DEFAULT_TIMER_DURATION_MS,
    endsAtMs: null,
  };
}

function defaultStopwatchState(): StopwatchState {
  return {
    status: "idle",
    startedAtMs: null,
    accumulatedMs: 0,
    laps: [],
  };
}

function defaultState(): ClockAppState {
  return {
    timer: defaultTimerState(),
    stopwatch: defaultStopwatchState(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampMs(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = finiteNumber(value);
  if (n === null) return fallback;
  return Math.max(0, Math.min(max, Math.floor(n)));
}

function nullableMs(value: unknown): number | null {
  if (value === null) return null;
  return finiteNumber(value);
}

export function clampTimerDurationMs(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_TIMER_DURATION_MS, Math.floor(value / 1000) * 1000));
}

export function durationPartsFromMs(value: number): DurationParts {
  const totalSeconds = Math.floor(clampTimerDurationMs(value) / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function durationMsFromParts(parts: DurationParts): number {
  return clampTimerDurationMs(
    (Math.max(0, Math.floor(parts.hours)) * 3600 +
      Math.max(0, Math.floor(parts.minutes)) * 60 +
      Math.max(0, Math.floor(parts.seconds))) *
      1000,
  );
}

export function formatDurationMs(value: number): string {
  const parts = durationPartsFromMs(value);
  return `${String(parts.hours).padStart(2, "0")}:${String(parts.minutes).padStart(
    2,
    "0",
  )}:${String(parts.seconds).padStart(2, "0")}`;
}

export function formatStopwatchDurationMs(value: number): string {
  const totalMs = clampMs(value, 0);
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = totalMs % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function coerceTimer(candidate: unknown, nowMs: number): { timer: TimerState; changed: boolean } {
  if (!isRecord(candidate)) {
    return { timer: defaultTimerState(), changed: true };
  }

  const rawStatus = candidate.status;
  const status: TimerStatus =
    rawStatus === "idle" ||
    rawStatus === "running" ||
    rawStatus === "paused" ||
    rawStatus === "finished"
      ? rawStatus
      : "idle";
  const durationMs = clampTimerDurationMs(
    clampMs(candidate.durationMs, DEFAULT_TIMER_DURATION_MS, MAX_TIMER_DURATION_MS),
  );
  const fallbackRemaining = durationMs === 0 ? 0 : durationMs;
  const remainingMs = clampTimerDurationMs(
    clampMs(candidate.remainingMs, fallbackRemaining, MAX_TIMER_DURATION_MS),
  );
  const endsAtMs = nullableMs(candidate.endsAtMs);

  if (status === "running") {
    if (endsAtMs === null) {
      return {
        timer: { status: "paused", durationMs, remainingMs, endsAtMs: null },
        changed: true,
      };
    }

    const nextRemaining = clampTimerDurationMs(endsAtMs - nowMs);
    if (nextRemaining <= 0) {
      return {
        timer: { status: "finished", durationMs, remainingMs: 0, endsAtMs: null },
        changed: true,
      };
    }

    return {
      timer: { status: "running", durationMs, remainingMs: nextRemaining, endsAtMs },
      changed: nextRemaining !== remainingMs,
    };
  }

  if (status === "paused") {
    if (remainingMs <= 0) {
      return {
        timer: { status: "finished", durationMs, remainingMs: 0, endsAtMs: null },
        changed: true,
      };
    }
    return {
      timer: { status: "paused", durationMs, remainingMs, endsAtMs: null },
      changed: endsAtMs !== null,
    };
  }

  if (status === "finished") {
    return {
      timer: { status: "finished", durationMs, remainingMs: 0, endsAtMs: null },
      changed: remainingMs !== 0 || endsAtMs !== null,
    };
  }

  return {
    timer: { status: "idle", durationMs, remainingMs: durationMs, endsAtMs: null },
    changed: status !== rawStatus || remainingMs !== durationMs || endsAtMs !== null,
  };
}

function coerceStopwatch(
  candidate: unknown,
  nowMs: number,
): {
  stopwatch: StopwatchState;
  changed: boolean;
} {
  if (!isRecord(candidate)) {
    return { stopwatch: defaultStopwatchState(), changed: true };
  }

  const rawStatus = candidate.status;
  const status: StopwatchStatus =
    rawStatus === "idle" || rawStatus === "running" || rawStatus === "paused" ? rawStatus : "idle";
  const accumulatedMs = clampMs(candidate.accumulatedMs, 0);
  const startedAtCandidate = nullableMs(candidate.startedAtMs);
  const startedAtMs =
    startedAtCandidate !== null ? Math.min(Math.max(0, startedAtCandidate), nowMs) : null;
  const laps = Array.isArray(candidate.laps)
    ? candidate.laps
        .map((lap) => finiteNumber(lap))
        .filter((lap): lap is number => lap !== null && lap >= 0)
        .map((lap) => Math.floor(lap))
    : [];

  if (status === "running") {
    if (startedAtMs === null) {
      return {
        stopwatch: { status: "paused", startedAtMs: null, accumulatedMs, laps },
        changed: true,
      };
    }
    return {
      stopwatch: { status: "running", startedAtMs, accumulatedMs, laps },
      changed: startedAtMs !== startedAtCandidate,
    };
  }

  if (status === "paused") {
    return {
      stopwatch: { status: "paused", startedAtMs: null, accumulatedMs, laps },
      changed: startedAtCandidate !== null,
    };
  }

  return {
    stopwatch: defaultStopwatchState(),
    changed:
      status !== rawStatus ||
      accumulatedMs !== 0 ||
      startedAtCandidate !== null ||
      laps.length !== 0,
  };
}

export function coerceClockAppState(candidate: unknown, nowMs: number): CoerceResult {
  if (!isRecord(candidate)) {
    return { state: defaultState(), changed: true };
  }

  const timer = coerceTimer(candidate.timer, nowMs);
  const stopwatch = coerceStopwatch(candidate.stopwatch, nowMs);
  return {
    state: {
      timer: timer.timer,
      stopwatch: stopwatch.stopwatch,
    },
    changed: timer.changed || stopwatch.changed,
  };
}

export function useClockApp(options: UseClockAppOptions = {}): {
  readonly currentMs: Ref<number>;
  readonly timerStatus: Ref<TimerStatus>;
  readonly timerDurationMs: Ref<number>;
  readonly timerRemainingMs: ComputedRef<number>;
  readonly timerParts: ComputedRef<DurationParts>;
  readonly timerDisplay: ComputedRef<string>;
  readonly timerCanStart: ComputedRef<boolean>;
  readonly timerCanResume: ComputedRef<boolean>;
  readonly timerCanEdit: ComputedRef<boolean>;
  readonly stopwatchStatus: Ref<StopwatchStatus>;
  readonly stopwatchElapsedMs: ComputedRef<number>;
  readonly stopwatchDisplay: ComputedRef<string>;
  readonly stopwatchCanLap: ComputedRef<boolean>;
  readonly laps: Ref<readonly number[]>;
  setTimerDuration: (durationMs: number) => void;
  setTimerPart: (part: TimerPart, value: number | string) => void;
  startTimer: (durationMs?: number) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  startStopwatch: () => void;
  pauseStopwatch: () => void;
  lapStopwatch: () => void;
  resetStopwatch: () => void;
  snapshot: () => ClockAppState;
  dispose: () => void;
} {
  const now = options.now ?? (() => Date.now());
  const currentMs = ref(now());
  const kv = new KVStore<ClockAppState>(
    options.storageNamespace ?? activeProfileKvNamespace(CLOCK_KV_NAMESPACE),
  );

  const timerStatus = ref<TimerStatus>("idle");
  const timerDurationMs = ref(DEFAULT_TIMER_DURATION_MS);
  const timerStoredRemainingMs = ref(DEFAULT_TIMER_DURATION_MS);
  const timerEndsAtMs = ref<number | null>(null);
  const stopwatchStatus = ref<StopwatchStatus>("idle");
  const stopwatchStartedAtMs = ref<number | null>(null);
  const stopwatchAccumulatedMs = ref(0);
  const laps: Ref<readonly number[]> = ref([]);

  function snapshot(): ClockAppState {
    return {
      timer: {
        status: timerStatus.value,
        durationMs: timerDurationMs.value,
        remainingMs:
          timerStatus.value === "running" ? timerRemainingMs.value : timerStoredRemainingMs.value,
        endsAtMs: timerEndsAtMs.value,
      },
      stopwatch: {
        status: stopwatchStatus.value,
        startedAtMs: stopwatchStartedAtMs.value,
        accumulatedMs: stopwatchAccumulatedMs.value,
        laps: [...laps.value],
      },
    };
  }

  function persist(): void {
    kv.set(CLOCK_KV_PRIMARY_KEY, snapshot());
  }

  function applyState(state: ClockAppState): void {
    timerStatus.value = state.timer.status;
    timerDurationMs.value = state.timer.durationMs;
    timerStoredRemainingMs.value = state.timer.remainingMs;
    timerEndsAtMs.value = state.timer.endsAtMs;
    stopwatchStatus.value = state.stopwatch.status;
    stopwatchStartedAtMs.value = state.stopwatch.startedAtMs;
    stopwatchAccumulatedMs.value = state.stopwatch.accumulatedMs;
    laps.value = [...state.stopwatch.laps];
  }

  const timerRemainingMs = computed(() => {
    if (timerStatus.value === "running" && timerEndsAtMs.value !== null) {
      return Math.max(0, clampTimerDurationMs(timerEndsAtMs.value - currentMs.value));
    }
    return timerStoredRemainingMs.value;
  });

  const timerParts = computed(() => durationPartsFromMs(timerDurationMs.value));
  const timerDisplay = computed(() => formatDurationMs(timerRemainingMs.value));
  const timerCanStart = computed(
    () => timerDurationMs.value > 0 && timerStatus.value !== "running",
  );
  const timerCanResume = computed(
    () => timerStatus.value === "paused" && timerStoredRemainingMs.value > 0,
  );
  const timerCanEdit = computed(() => timerStatus.value !== "running");

  const stopwatchElapsedMs = computed(() => {
    if (stopwatchStatus.value === "running" && stopwatchStartedAtMs.value !== null) {
      return (
        stopwatchAccumulatedMs.value + Math.max(0, currentMs.value - stopwatchStartedAtMs.value)
      );
    }
    return stopwatchAccumulatedMs.value;
  });
  const stopwatchDisplay = computed(() => formatStopwatchDurationMs(stopwatchElapsedMs.value));
  const stopwatchCanLap = computed(() => stopwatchElapsedMs.value > 0);

  const persisted = kv.get(CLOCK_KV_PRIMARY_KEY);
  if (persisted !== null) {
    const loaded = coerceClockAppState(persisted, currentMs.value);
    applyState(loaded.state);
    if (loaded.changed) {
      persist();
    }
  } else {
    applyState(defaultState());
  }

  function finishTimer(): void {
    if (timerStatus.value !== "running") return;
    timerStatus.value = "finished";
    timerStoredRemainingMs.value = 0;
    timerEndsAtMs.value = null;
    persist();
  }

  function setTimerDuration(durationMs: number): void {
    if (!timerCanEdit.value) return;
    const next = clampTimerDurationMs(durationMs);
    timerStatus.value = "idle";
    timerDurationMs.value = next;
    timerStoredRemainingMs.value = next;
    timerEndsAtMs.value = null;
    persist();
  }

  function setTimerPart(part: TimerPart, value: number | string): void {
    const numeric = typeof value === "string" ? Number.parseInt(value, 10) : value;
    const current = timerParts.value;
    const next = {
      ...current,
      [part]: Math.max(0, Number.isFinite(numeric) ? Math.floor(numeric) : 0),
    };
    if (part === "hours") next.hours = Math.min(23, next.hours);
    if (part === "minutes") next.minutes = Math.min(59, next.minutes);
    if (part === "seconds") next.seconds = Math.min(59, next.seconds);
    setTimerDuration(durationMsFromParts(next));
  }

  function startTimer(durationMs = timerDurationMs.value): void {
    const next = clampTimerDurationMs(durationMs);
    if (next <= 0) return;
    const startedAtMs = now();
    currentMs.value = startedAtMs;
    timerStatus.value = "running";
    timerDurationMs.value = next;
    timerStoredRemainingMs.value = next;
    timerEndsAtMs.value = startedAtMs + next;
    persist();
  }

  function pauseTimer(): void {
    if (timerStatus.value !== "running") return;
    const remaining = timerRemainingMs.value;
    if (remaining <= 0) {
      finishTimer();
      return;
    }
    timerStatus.value = "paused";
    timerStoredRemainingMs.value = remaining;
    timerEndsAtMs.value = null;
    persist();
  }

  function resumeTimer(): void {
    if (!timerCanResume.value) return;
    currentMs.value = now();
    timerStatus.value = "running";
    timerEndsAtMs.value = currentMs.value + timerStoredRemainingMs.value;
    persist();
  }

  function resetTimer(): void {
    timerStatus.value = "idle";
    timerStoredRemainingMs.value = timerDurationMs.value;
    timerEndsAtMs.value = null;
    persist();
  }

  function startStopwatch(): void {
    if (stopwatchStatus.value === "running") return;
    currentMs.value = now();
    stopwatchStatus.value = "running";
    stopwatchStartedAtMs.value = currentMs.value;
    persist();
    scheduleTick();
  }

  function pauseStopwatch(): void {
    if (stopwatchStatus.value !== "running") return;
    currentMs.value = now();
    stopwatchAccumulatedMs.value = stopwatchElapsedMs.value;
    stopwatchStartedAtMs.value = null;
    stopwatchStatus.value = "paused";
    persist();
    scheduleTick();
  }

  function lapStopwatch(): void {
    if (stopwatchStatus.value === "running") {
      currentMs.value = now();
    }
    const elapsed = stopwatchElapsedMs.value;
    if (elapsed <= 0) return;
    laps.value = [elapsed, ...laps.value];
    persist();
  }

  function resetStopwatch(): void {
    stopwatchStatus.value = "idle";
    stopwatchStartedAtMs.value = null;
    stopwatchAccumulatedMs.value = 0;
    laps.value = [];
    persist();
    scheduleTick();
  }

  function tick(): void {
    const nextNow = now();
    currentMs.value = nextNow;
    if (
      timerStatus.value === "running" &&
      timerEndsAtMs.value !== null &&
      timerEndsAtMs.value <= nextNow
    ) {
      finishTimer();
    }
    scheduleTick();
  }

  function desiredTickMs(): number {
    return (
      options.tickMs ?? (stopwatchStatus.value === "running" ? STOPWATCH_TICK_MS : DEFAULT_TICK_MS)
    );
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let activeTickMs: number | null = null;

  function scheduleTick(): void {
    const nextTickMs = desiredTickMs();
    if (intervalId !== null && activeTickMs === nextTickMs) return;
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
    activeTickMs = nextTickMs;
    intervalId = setInterval(tick, nextTickMs);
  }

  scheduleTick();

  function dispose(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    kv.dispose();
  }

  onBeforeUnmount(dispose);

  return {
    currentMs,
    timerStatus,
    timerDurationMs,
    timerRemainingMs,
    timerParts,
    timerDisplay,
    timerCanStart,
    timerCanResume,
    timerCanEdit,
    stopwatchStatus,
    stopwatchElapsedMs,
    stopwatchDisplay,
    stopwatchCanLap,
    laps,
    setTimerDuration,
    setTimerPart,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    startStopwatch,
    pauseStopwatch,
    lapStopwatch,
    resetStopwatch,
    snapshot,
    dispose,
  };
}
