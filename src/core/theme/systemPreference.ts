import type { ResolvedTheme } from "~/types/theme";

export function getSystemPreference(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let mediaQuery: MediaQueryList | undefined;

let onMediaChange: (() => void) | undefined;

const listeners = new Set<(resolved: ResolvedTheme) => void>();

function notifyListeners(): void {
  const resolved = getSystemPreference();

  for (const cb of listeners) {
    cb(resolved);
  }
}

function ensureListenerAttached(): void {
  if (typeof window === "undefined" || mediaQuery !== undefined) {
    return;
  }

  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  onMediaChange = (): void => {
    notifyListeners();
  };

  mediaQuery.addEventListener("change", onMediaChange);
}

function teardownListenerIfIdle(): void {
  if (listeners.size > 0 || !mediaQuery || !onMediaChange) {
    return;
  }

  mediaQuery.removeEventListener("change", onMediaChange);

  mediaQuery = undefined;

  onMediaChange = undefined;
}

export function subscribeSystemPreference(cb: (resolved: ResolvedTheme) => void): () => void {
  listeners.add(cb);

  ensureListenerAttached();

  cb(getSystemPreference());

  return (): void => {
    listeners.delete(cb);

    teardownListenerIfIdle();
  };
}
