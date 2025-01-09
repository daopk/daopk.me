import { onBeforeUnmount, ref, type Ref } from "vue";

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatClock(d: Date): string {
  return clockFormatter.format(d);
}

function toLocalIsoMinute(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function msUntilNextMinute(now: Date): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
}

export function useClock(now: () => Date = (): Date => new Date()): {
  time: Ref<string>;
  datetime: Ref<string>;
} {
  const time = ref(formatClock(now()));
  const datetime = ref(toLocalIsoMinute(now()));
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let active = true;

  function schedule(): void {
    const pendingMs = msUntilNextMinute(now());
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      if (!active) {
        return;
      }
      const snapshot = now();
      time.value = formatClock(snapshot);
      datetime.value = toLocalIsoMinute(snapshot);
      schedule();
    }, pendingMs);
  }

  schedule();

  onBeforeUnmount(() => {
    active = false;
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });

  return { time, datetime };
}
