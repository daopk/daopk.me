const enabled = import.meta.env.DEV;

export function debugLog(...args: unknown[]): void {
  if (enabled) {
    console.info("[daopk]", ...args);
  }
}

export function debugWarn(...args: unknown[]): void {
  if (enabled) {
    console.warn("[daopk]", ...args);
  }
}
