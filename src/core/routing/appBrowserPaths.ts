export const HOME_BROWSER_PATH = "/";
export const DEFAULT_BROWSER_TITLE = "WebOS";

export function appFallbackBrowserPath(manifestId: string): string {
  return `/apps/${encodeURIComponent(manifestId)}`;
}

export function appBrowserTitle(appName: string): string {
  return `${appName} - ${DEFAULT_BROWSER_TITLE}`;
}

export function replaceBrowserTitle(title: string): void {
  if (typeof document === "undefined" || document.title === title) {
    return;
  }

  document.title = title;
}

export function normalizeAppBrowserPath(path: string, origin = currentOrigin()): string | null {
  const trimmed = path.trim();
  if (trimmed.length === 0 || origin === null) {
    return null;
  }

  let url: URL;
  try {
    url = trimmed.startsWith("/") ? new URL(trimmed, origin) : new URL(trimmed);
  } catch {
    return null;
  }

  if (url.origin !== origin) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function replaceBrowserPath(path: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeAppBrowserPath(path);
  if (normalized === null) {
    return;
  }

  if (
    window.location.pathname === new URL(normalized, window.location.origin).pathname &&
    window.location.search === new URL(normalized, window.location.origin).search &&
    window.location.hash === new URL(normalized, window.location.origin).hash
  ) {
    return;
  }

  window.history.replaceState(window.history.state, "", normalized);
}

function currentOrigin(): string | null {
  return typeof window === "undefined" ? null : window.location.origin;
}
