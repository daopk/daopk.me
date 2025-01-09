const QUERY = "(prefers-reduced-motion: reduce)";

let mediaQuery: MediaQueryList | undefined;
let onMediaChange: (() => void) | undefined;

const listeners = new Set<(reduced: boolean) => void>();

export function getPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(QUERY).matches;
}

function notifyListeners(): void {
  const reduced = getPrefersReducedMotion();
  for (const cb of listeners) {
    cb(reduced);
  }
}

function ensureListenerAttached(): void {
  if (typeof window === "undefined" || mediaQuery !== undefined) {
    return;
  }

  if (typeof window.matchMedia !== "function") {
    return;
  }

  mediaQuery = window.matchMedia(QUERY);

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

export function subscribePrefersReducedMotion(cb: (reduced: boolean) => void): () => void {
  listeners.add(cb);

  ensureListenerAttached();

  cb(getPrefersReducedMotion());

  return (): void => {
    listeners.delete(cb);
    teardownListenerIfIdle();
  };
}
