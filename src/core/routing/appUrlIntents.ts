/**
 * Public URL → app launch intent bridge.
 *
 * This is intentionally smaller than a router: v1 owns public URLs that launch
 * apps, while the destination app remains responsible for its internal route.
 *
 * Per-app parsing lives in `./intents/*` plugins; this module composes them,
 * owns the generic `/apps/<id>` + first-party-protocol plumbing, and re-exports
 * the per-app public API so existing import sites stay stable.
 */

import { debugWarn } from "~/core/debug";
import { BUILTIN_APP_IDS } from "~/core/apps/builtinAppIds";
import { appSettingsLaunchArgs, APP_SETTINGS_PANE } from "~/core/apps/appSettings";
import { normalizeVfsPath } from "~/core/vfs/path";

import type { Kernel } from "~/types/kernel";
import { isSettingsSectionId, type SettingsSectionId } from "~/types/settings";

import {
  absoluteUrlFrom,
  appIntent,
  decodePathSegment,
  type AppUrlIntent,
  type AppUrlIntentMetadata,
} from "./intents/intentShared";
import { parseBlogUrlIntent } from "./intents/blogIntent";
import { parseMoviesUrlIntent } from "./intents/moviesIntent";
import { youtubePlayerAppArgs, youtubePlayerProtocolArgs } from "./intents/youtubePlayerIntent";

export type { AppUrlIntent, AppUrlLaunchIntent } from "./intents/intentShared";
export {
  parseYouTubePlayerUrlIntent,
  youtubePlayerVideoIdFromArgs,
  type YouTubePlayerUrlIntentOptions,
} from "./intents/youtubePlayerIntent";

const FIRST_PARTY_APP_PROTOCOLS = new Map([["youtube-player", "youtube-player"]]);

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

function normalizedUrlPathIntent(url: URL): {
  readonly canonicalPath: string;
  readonly segments: readonly string[];
  readonly urlIntent?: AppUrlIntentMetadata;
} {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "vi") {
    return { canonicalPath: url.pathname, segments };
  }

  const canonicalSegments = segments.slice(1);
  const canonicalPath = `/${canonicalSegments.join("/")}`;
  return {
    canonicalPath,
    segments: canonicalSegments,
    urlIntent: {
      canonicalPath,
      localeHint: "vi",
      originalPath: url.pathname,
    },
  };
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

  if (manifestId === "youtube-player") {
    Object.assign(args, youtubePlayerAppArgs(searchParams) ?? {});
  }

  return Object.keys(args).length === 0 ? undefined : args;
}

function protocolArgsForApp(
  manifestId: string,
  url: URL,
): Readonly<Record<string, unknown>> | undefined {
  if (manifestId === "youtube-player") {
    return youtubePlayerProtocolArgs(url);
  }

  return undefined;
}

export function isFirstPartyAppProtocolUrl(input: string | URL): boolean {
  const url = absoluteUrlFrom(input);
  if (url === null) {
    return false;
  }

  const protocol = url.protocol.slice(0, -1).toLowerCase();
  return FIRST_PARTY_APP_PROTOCOLS.has(protocol);
}

export function parseAppProtocolIntent(input: string | URL): AppUrlIntent {
  const url = absoluteUrlFrom(input);
  if (url === null) {
    return { kind: "none" };
  }

  const protocol = url.protocol.slice(0, -1).toLowerCase();
  const manifestId = FIRST_PARTY_APP_PROTOCOLS.get(protocol);
  if (manifestId === undefined) {
    return { kind: "none" };
  }

  const args = protocolArgsForApp(manifestId, url);
  if (args === undefined) {
    return { kind: "none" };
  }

  return {
    kind: "app",
    manifestId,
    args,
  };
}

export function parseAppUrlIntent(input: string | URL): AppUrlIntent {
  const protocolIntent = parseAppProtocolIntent(input);
  if (protocolIntent.kind !== "none") {
    return protocolIntent;
  }

  const url = urlFrom(input);
  const { canonicalPath, segments, urlIntent } = normalizedUrlPathIntent(url);

  const blogIntent = parseBlogUrlIntent(segments, urlIntent);
  if (blogIntent.kind !== "none") {
    return blogIntent;
  }

  const moviesIntent = parseMoviesUrlIntent(canonicalPath, segments, urlIntent);
  if (moviesIntent.kind !== "none") {
    return moviesIntent;
  }

  if (segments.length !== 2 || segments[0] !== "apps") {
    return { kind: "none" };
  }

  const manifestId = decodePathSegment(segments[1]);
  if (manifestId === null) {
    return { kind: "none" };
  }

  const args = argsForApp(manifestId, url.searchParams);
  return appIntent(manifestId, args, urlIntent);
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

export function hasAutoGuestLoginUrlIntent(kernel: Kernel, input?: string | URL): boolean {
  const url = input === undefined ? currentUrl() : urlFrom(input);
  if (url === null) {
    return false;
  }

  const intent = parseAppUrlIntent(url);
  if (intent.kind !== "app") {
    return false;
  }

  return (
    BUILTIN_APP_IDS.has(intent.manifestId) ||
    kernel.apps.list().some((entry) => entry.id === intent.manifestId)
  );
}

export interface ConsumeInitialAppUrlIntentOptions {
  /** Invoked when the URL targets an app that is not registered. */
  onUnknownApp?: (manifestId: string) => void;
}

export function consumeInitialAppUrlIntent(
  kernel: Kernel,
  input?: string | URL,
  options?: ConsumeInitialAppUrlIntentOptions,
): boolean {
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
    options?.onUnknownApp?.(intent.manifestId);
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
