import { mountVaporComposable } from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLOCK_KV_PRIMARY_KEY,
  formatDurationMs,
  formatStopwatchDurationMs,
  useClockApp,
  type ClockAppState,
} from "./useClockApp";

const STORAGE_NAMESPACE = "clock-test";
const STORAGE_KEY = `${STORAGE_NAMESPACE}:${CLOCK_KV_PRIMARY_KEY}`;
const BASE = new Date(2026, 4, 15, 14, 30, 0).getTime();

function persistState(state: ClockAppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: 1, data: state }));
}

function readState(): ClockAppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) throw new Error("missing clock state");
  return (JSON.parse(raw) as { data: ClockAppState }).data;
}

function defaultState(): ClockAppState {
  return {
    timer: {
      status: "idle",
      durationMs: 5 * 60_000,
      remainingMs: 5 * 60_000,
      endsAtMs: null,
    },
    stopwatch: {
      status: "idle",
      startedAtMs: null,
      accumulatedMs: 0,
      laps: [],
    },
  };
}

function mountClock() {
  const mounted = mountVaporComposable(() => useClockApp({ storageNamespace: STORAGE_NAMESPACE }));
  return { wrapper: mounted.wrapper, clock: mounted.result };
}

describe("useClockApp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("recovers a running timer from an absolute end time", async () => {
    persistState({
      ...defaultState(),
      timer: {
        status: "running",
        durationMs: 60_000,
        remainingMs: 60_000,
        endsAtMs: BASE + 30_000,
      },
    });

    const { wrapper, clock } = mountClock();

    expect(clock.timerStatus.value).toBe("running");
    expect(clock.timerRemainingMs.value).toBe(30_000);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(clock.timerRemainingMs.value).toBe(20_000);

    wrapper.unmount();
  });

  it("hydrates an expired timer as finished", () => {
    persistState({
      ...defaultState(),
      timer: {
        status: "running",
        durationMs: 60_000,
        remainingMs: 10_000,
        endsAtMs: BASE - 1_000,
      },
    });

    const { wrapper, clock } = mountClock();

    expect(clock.timerStatus.value).toBe("finished");
    expect(clock.timerRemainingMs.value).toBe(0);
    expect(readState().timer.status).toBe("finished");

    wrapper.unmount();
  });

  it("recovers a running stopwatch from accumulated and start timestamps", async () => {
    persistState({
      ...defaultState(),
      stopwatch: {
        status: "running",
        startedAtMs: BASE - 5_000,
        accumulatedMs: 10_000,
        laps: [],
      },
    });

    const { wrapper, clock } = mountClock();

    expect(clock.stopwatchElapsedMs.value).toBe(15_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(clock.stopwatchElapsedMs.value).toBe(17_000);

    wrapper.unmount();
  });

  it("formats stopwatch displays with milliseconds", async () => {
    const { wrapper, clock } = mountClock();

    expect(formatStopwatchDurationMs(3_724_005)).toBe("01:02:04.005");

    clock.startStopwatch();
    await vi.advanceTimersByTimeAsync(1_234);
    clock.pauseStopwatch();

    expect(clock.stopwatchDisplay.value).toBe("00:00:01.234");

    wrapper.unmount();
  });

  it("stores newest stopwatch laps first", async () => {
    const { wrapper, clock } = mountClock();

    clock.startStopwatch();
    await vi.advanceTimersByTimeAsync(5_000);
    clock.lapStopwatch();
    await vi.advanceTimersByTimeAsync(3_000);
    clock.lapStopwatch();

    expect(clock.laps.value).toEqual([8_000, 5_000]);
    expect(readState().stopwatch.laps).toEqual([8_000, 5_000]);

    wrapper.unmount();
  });

  it("coerces invalid persisted state back to defaults", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          timer: { status: "running", durationMs: "bad" },
          stopwatch: { status: "idle", accumulatedMs: 1000, laps: ["bad"] },
        },
      }),
    );

    const { wrapper, clock } = mountClock();

    expect(clock.timerStatus.value).toBe("paused");
    expect(clock.timerDurationMs.value).toBe(5 * 60_000);
    expect(clock.stopwatchElapsedMs.value).toBe(0);
    expect(clock.laps.value).toEqual([]);

    wrapper.unmount();
  });

  it("does not write on every timer tick", async () => {
    const { wrapper, clock } = mountClock();

    clock.startTimer(10_000);
    const before = localStorage.getItem(STORAGE_KEY);

    await vi.advanceTimersByTimeAsync(3_000);

    expect(clock.timerDisplay.value).toBe(formatDurationMs(7_000));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);

    wrapper.unmount();
  });
});
