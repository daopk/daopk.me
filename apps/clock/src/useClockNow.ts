import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from "vue";

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const clockWithSecondsFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toLocalIsoSecond(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatClockMinute(date: Date): string {
  return clockFormatter.format(date);
}

export function formatClockSecond(date: Date): string {
  return clockWithSecondsFormatter.format(date);
}

function formatClockDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatClockLongDate(date: Date): string {
  return longDateFormatter.format(date);
}

export function useClockNow(now: () => Date = () => new Date()): {
  readonly current: Ref<Date>;
  readonly datetime: ComputedRef<string>;
  readonly minute: ComputedRef<string>;
  readonly second: ComputedRef<string>;
  readonly date: ComputedRef<string>;
  readonly longDate: ComputedRef<string>;
} {
  const current = ref(now());
  const intervalId = setInterval(() => {
    current.value = now();
  }, 1000);

  onBeforeUnmount(() => {
    clearInterval(intervalId);
  });

  return {
    current,
    datetime: computed(() => toLocalIsoSecond(current.value)),
    minute: computed(() => formatClockMinute(current.value)),
    second: computed(() => formatClockSecond(current.value)),
    date: computed(() => formatClockDate(current.value)),
    longDate: computed(() => formatClockLongDate(current.value)),
  };
}
