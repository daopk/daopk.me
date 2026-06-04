export function safeNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampFraction(value: number): number {
  return clampNumber(safeNumber(value), 0, 1);
}

export function clampVolume(value: number): number {
  return Math.round(clampNumber(safeNumber(value), 0, 100));
}

export function cleanVideoTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const title = value.trim();
  return title.length > 0 ? title : null;
}

export function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(safeNumber(seconds)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(
      2,
      "0",
    )}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
