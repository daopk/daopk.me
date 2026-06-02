const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatMonthLabel(date: Date): string {
  return monthFormatter.format(date);
}

export function weekdayLabelsForWeekStart(weekStartsOn: number): readonly string[] {
  const startIndex = weekStartsOn === 0 ? 0 : 1;
  return Array.from({ length: 7 }, (_, index) => WEEKDAY_LABELS[(startIndex + index) % 7]!);
}
