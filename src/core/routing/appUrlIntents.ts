/**
 * Public URL → app launch intent bridge.
 *
 * This is intentionally smaller than a router: v1 owns public URLs that launch
 * apps, while the destination app remains responsible for its internal route.
 */

import { debugWarn } from "~/core/debug";
import { BUILTIN_APP_IDS } from "~/core/apps/builtinAppIds";
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

export interface YouTubePlayerUrlIntentOptions {
  readonly autoplay?: boolean;
}

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const TMDB_ID_SLUG_PATTERN = /^([1-9]\d*)-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const FIRST_PARTY_APP_PROTOCOLS = new Map([["youtube-player", "youtube-player"]]);
const YOUTUBE_URL_PROTOCOLS = new Set(["http:", "https:"]);

let initialAppUrlIntentConsumed = false;

function urlFrom(input: string | URL): URL {
  if (input instanceof URL) {
    return input;
  }

  return new URL(input, "https://daopk.me");
}

function absoluteUrlFrom(input: string | URL): URL | null {
  if (input instanceof URL) {
    return input;
  }

  try {
    return new URL(input);
  } catch {
    return null;
  }
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

function nonEmptySearchParam(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key);
  if (value === null || value.length === 0) {
    return null;
  }

  return value;
}

function booleanSearchParam(searchParams: URLSearchParams, key: string): boolean {
  const value = searchParams.get(key);
  return value === "1" || value === "true";
}

function normalizedYouTubeVideoId(input: string | null | undefined): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  const trimmed = input.trim();
  return YOUTUBE_VIDEO_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function youTubeVideoIdFromUrl(input: string | URL): string | null {
  let url: URL;
  if (input instanceof URL) {
    url = input;
  } else {
    try {
      url = new URL(input);
    } catch {
      return null;
    }
  }

  if (!YOUTUBE_URL_PROTOCOLS.has(url.protocol)) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (hostname === "youtu.be") {
    return normalizedYouTubeVideoId(pathParts[0]);
  }

  if (
    hostname !== "youtube.com" &&
    hostname !== "m.youtube.com" &&
    hostname !== "music.youtube.com"
  ) {
    return null;
  }

  if (url.pathname === "/watch") {
    return normalizedYouTubeVideoId(url.searchParams.get("v"));
  }

  const [section, id] = pathParts;
  if (section === "embed" || section === "shorts" || section === "live") {
    return normalizedYouTubeVideoId(id);
  }

  return null;
}

export function youtubePlayerVideoIdFromArgs(
  args: Readonly<Record<string, unknown>> | undefined,
): string | null {
  const videoId = typeof args?.videoId === "string" ? normalizedYouTubeVideoId(args.videoId) : null;
  if (videoId !== null) {
    return videoId;
  }

  return typeof args?.url === "string" ? youTubeVideoIdFromUrl(args.url) : null;
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
    const videoId = nonEmptySearchParam(searchParams, "videoId");
    const url = nonEmptySearchParam(searchParams, "url");
    if (videoId !== null) {
      args.videoId = videoId;
    }
    if (url !== null) {
      args.url = url;
    }
    if (booleanSearchParam(searchParams, "autoplay")) {
      args.autoplay = true;
    }
  }

  return Object.keys(args).length === 0 ? undefined : args;
}

function youtubePlayerProtocolArgs(url: URL): Readonly<Record<string, unknown>> | undefined {
  const action = url.hostname.toLowerCase();
  const pathSegments = url.pathname.split("/").filter(Boolean);

  if (action === "video" && pathSegments.length === 1) {
    const videoId = normalizedYouTubeVideoId(decodePathSegment(pathSegments[0]!) ?? null);
    return videoId === null
      ? undefined
      : {
          videoId,
          ...(booleanSearchParam(url.searchParams, "autoplay") ? { autoplay: true } : {}),
        };
  }

  if (action === "url" && pathSegments.length === 0) {
    const youtubeUrl = nonEmptySearchParam(url.searchParams, "url");
    if (youtubeUrl === null || youTubeVideoIdFromUrl(youtubeUrl) === null) {
      return undefined;
    }

    return {
      url: youtubeUrl,
      ...(booleanSearchParam(url.searchParams, "autoplay") ? { autoplay: true } : {}),
    };
  }

  return undefined;
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

function parseMoviesUrlIntent(url: URL, segments: readonly string[]): AppUrlIntent {
  const section = segments[0];
  if (section === "movie" || section === "tv") {
    const path = validMoviesMediaPath(url, segments);
    return {
      kind: "app",
      manifestId: "movies",
      ...(path === null ? {} : { args: { path } }),
    };
  }

  if (segments.length !== 2 || section !== "person") {
    return { kind: "none" };
  }

  const idSlug = decodePathSegment(segments[1]);
  if (idSlug === null || TMDB_ID_SLUG_PATTERN.exec(idSlug) === null) {
    return { kind: "none" };
  }

  return {
    kind: "app",
    manifestId: "movies",
    args: { path: url.pathname },
  };
}

function validMoviesMediaPath(url: URL, segments: readonly string[]): string | null {
  const section = segments[0];
  if (segments.length === 2) {
    const idSlug = decodePathSegment(segments[1]);
    return idSlug !== null && TMDB_ID_SLUG_PATTERN.exec(idSlug) !== null ? url.pathname : null;
  }

  if (segments.length === 4 && section === "tv") {
    const idSlug = decodePathSegment(segments[1]);
    const seasonNumber = decodePathSegment(segments[3] ?? "");
    return idSlug !== null &&
      TMDB_ID_SLUG_PATTERN.exec(idSlug) !== null &&
      segments[2] === "season" &&
      seasonNumber !== null &&
      /^(?:0|[1-9]\d*)$/.exec(seasonNumber) !== null
      ? url.pathname
      : null;
  }

  if (segments.length !== 6 || section !== "tv") {
    return null;
  }

  const idSlug = decodePathSegment(segments[1]);
  const seasonNumber = decodePathSegment(segments[3] ?? "");
  const episodeNumber = decodePathSegment(segments[5] ?? "");
  return idSlug !== null &&
    TMDB_ID_SLUG_PATTERN.exec(idSlug) !== null &&
    segments[2] === "season" &&
    segments[4] === "episode" &&
    seasonNumber !== null &&
    episodeNumber !== null &&
    /^(?:0|[1-9]\d*)$/.exec(seasonNumber) !== null &&
    /^[1-9]\d*$/.exec(episodeNumber) !== null
    ? url.pathname
    : null;
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

export function parseYouTubePlayerUrlIntent(
  input: string | URL,
  options: YouTubePlayerUrlIntentOptions = {},
): AppUrlIntent {
  const url = absoluteUrlFrom(input);
  if (url === null || youTubeVideoIdFromUrl(url) === null) {
    return { kind: "none" };
  }

  return {
    kind: "app",
    manifestId: "youtube-player",
    args: {
      url: url.href,
      ...(options.autoplay === true ? { autoplay: true } : {}),
    },
  };
}

export function parseAppUrlIntent(input: string | URL): AppUrlIntent {
  const protocolIntent = parseAppProtocolIntent(input);
  if (protocolIntent.kind !== "none") {
    return protocolIntent;
  }

  const url = urlFrom(input);
  const segments = url.pathname.split("/").filter(Boolean);

  const blogIntent = parseBlogUrlIntent(segments);
  if (blogIntent.kind !== "none") {
    return blogIntent;
  }

  const moviesIntent = parseMoviesUrlIntent(url, segments);
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
