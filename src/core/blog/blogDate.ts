const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate an ISO `YYYY-MM-DD` date, rejecting impossible calendar dates such
 * as `2026-99-99`. Returns the original string when valid, else `null`.
 */
export function validBlogDate(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

/** Format a validated `YYYY-MM-DD` date as e.g. `May 30, 2026` (UTC). */
export function formatBlogDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}
