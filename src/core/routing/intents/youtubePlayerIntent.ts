import {
  absoluteUrlFrom,
  booleanSearchParam,
  decodePathSegment,
  nonEmptySearchParam,
  type AppUrlIntent,
} from "./intentShared";

export interface YouTubePlayerUrlIntentOptions {
  readonly autoplay?: boolean;
}

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_URL_PROTOCOLS = new Set(["http:", "https:"]);

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

/** Builds launch args for the `/apps/youtube-player?...` public path. */
export function youtubePlayerAppArgs(
  searchParams: URLSearchParams,
): Readonly<Record<string, unknown>> | undefined {
  const args: Record<string, unknown> = {};

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

  return Object.keys(args).length === 0 ? undefined : args;
}

/** Builds launch args for the `youtube-player://video/...` and `://url?...` protocol forms. */
export function youtubePlayerProtocolArgs(url: URL): Readonly<Record<string, unknown>> | undefined {
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
