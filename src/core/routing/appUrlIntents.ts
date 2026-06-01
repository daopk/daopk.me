/**
 * Public URL → app launch intent bridge.
 *
 * This is intentionally smaller than a router: v1 only owns `/apps/:id`
 * deep links plus the canonical `/blog/:slug` content route.
 */

import { debugWarn } from "~/core/debug";
import { appSettingsLaunchArgs, APP_SETTINGS_PANE } from "~/core/apps/appSettings";
import { blogPostPathFromSlug } from "~/core/routing/blogPaths";
import { normalizeVfsPath } from "~/core/vfs/path";

import type { Kernel } from "~/types/kernel";
import { isSettingsSectionId, type SettingsSectionId } from "~/types/settings";

export interface AppUrlLaunchIntent {
  kind: "app";
  manifestId: string;
  args?: Readonly<Record<string, unknown>>;
}

export type AppUrlIntent = AppUrlLaunchIntent | { kind: "none" };

let initialAppUrlIntentConsumed = false;

function urlFrom(input: string | URL): URL {
  if (input instanceof URL) {
    return input;
  }

  return new URL(input, "https://daopk.me");
}

function currentUrl(): URL | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URL(window.location.href);
}

function decodePathSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
}

function settingsSectionFromSearch(searchParams: URLSearchParams): SettingsSectionId | null {
  const value = searchParams.get("section") ?? searchParams.get("tab");

  if (value === null || !isSettingsSectionId(value)) {
    return null;
  }

  return value;
}

function finderPathFromSearch(searchParams: URLSearchParams): string | null {
  const value = searchParams.get("path");
  if (value === null) {
    return null;
  }

  try {
    return normalizeVfsPath(value);
  } catch {
    return null;
  }
}

function argsForApp(
  manifestId: string,
  searchParams: URLSearchParams,
): Readonly<Record<string, unknown>> | undefined {
  const args: Record<string, unknown> = {};

  if (searchParams.get("pane") === APP_SETTINGS_PANE) {
    Object.assign(args, appSettingsLaunchArgs());
  }

  if (manifestId === "settings") {
    const section = settingsSectionFromSearch(searchParams);
    if (section !== null) {
      args.section = section;
    }
  }

  if (manifestId === "finder") {
    const path = finderPathFromSearch(searchParams);
    if (path !== null) {
      args.path = path;
    }
  }

  return Object.keys(args).length === 0 ? undefined : args;
}

function parseBlogUrlIntent(segments: readonly string[]): AppUrlIntent {
  if (segments.length === 1 && segments[0] === "blog") {
    return {
      kind: "app",
      manifestId: "blog",
    };
  }

  if (segments.length !== 2 || segments[0] !== "blog") {
    return { kind: "none" };
  }

  const slug = decodePathSegment(segments[1]);
  if (slug === null) {
    return { kind: "none" };
  }

  const path = blogPostPathFromSlug(slug);
  return {
    kind: "app",
    manifestId: "blog",
    args: {
      slug,
      ...(path === null ? {} : { path }),
    },
  };
}

export function parseAppUrlIntent(input: string | URL): AppUrlIntent {
  const url = urlFrom(input);
  const segments = url.pathname.split("/").filter(Boolean);

  const blogIntent = parseBlogUrlIntent(segments);
  if (blogIntent.kind !== "none") {
    return blogIntent;
  }

  if (segments.length !== 2 || segments[0] !== "apps") {
    return { kind: "none" };
  }

  const manifestId = decodePathSegment(segments[1]);
  if (manifestId === null) {
    return { kind: "none" };
  }

  const args = argsForApp(manifestId, url.searchParams);
  return {
    kind: "app",
    manifestId,
    ...(args === undefined ? {} : { args }),
  };
}

export function hasRegisteredAppUrlIntent(kernel: Kernel, input?: string | URL): boolean {
  const url = input === undefined ? currentUrl() : urlFrom(input);
  if (url === null) {
    return false;
  }

  const intent = parseAppUrlIntent(url);
  if (intent.kind !== "app") {
    return false;
  }

  return kernel.apps.list().some((entry) => entry.id === intent.manifestId);
}

export function consumeInitialAppUrlIntent(kernel: Kernel, input?: string | URL): boolean {
  if (initialAppUrlIntentConsumed) {
    return false;
  }

  initialAppUrlIntentConsumed = true;

  const url = input === undefined ? currentUrl() : urlFrom(input);
  if (url === null) {
    return false;
  }

  const intent = parseAppUrlIntent(url);
  if (intent.kind !== "app") {
    return false;
  }

  const manifest = kernel.apps.list().find((entry) => entry.id === intent.manifestId);
  if (!manifest) {
    debugWarn("[url-intent]", "unknown app deep link", intent.manifestId);
    return false;
  }

  kernel.events.emit("app.launch.requested", {
    manifestId: intent.manifestId,
    source: "deeplink",
    ...(intent.args === undefined ? {} : { args: intent.args }),
  });

  return true;
}

export function resetInitialAppUrlIntentLatch(): void {
  initialAppUrlIntentConsumed = false;
}
