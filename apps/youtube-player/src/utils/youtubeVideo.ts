const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_THUMBNAIL_BASE_URL = "https://img.youtube.com/vi";
const YOUTUBE_THUMBNAIL_NAMES = [
  "maxresdefault",
  "sddefault",
  "hqdefault",
  "mqdefault",
  "default",
] as const;

export function normalizedVideoId(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  return YOUTUBE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function videoIdFromUrl(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (hostname === "youtu.be") {
    return normalizedVideoId(pathParts[0]);
  }

  if (
    hostname !== "youtube.com" &&
    hostname !== "m.youtube.com" &&
    hostname !== "music.youtube.com"
  ) {
    return null;
  }

  if (url.pathname === "/watch") {
    return normalizedVideoId(url.searchParams.get("v"));
  }

  const [section, id] = pathParts;
  if (section === "embed" || section === "shorts" || section === "live") {
    return normalizedVideoId(id);
  }

  return null;
}

export function videoIdFromLaunchArgs(
  args: Readonly<Record<string, unknown>> | null | undefined,
): string | null {
  return normalizedVideoId(args?.videoId) ?? videoIdFromUrl(args?.url);
}

export function autoplayFromLaunchArgs(
  args: Readonly<Record<string, unknown>> | null | undefined,
): boolean {
  const value = args?.autoplay;
  return value === true || value === "1" || value === "true";
}

export function youtubeThumbnailUrls(videoId: unknown): string[] {
  const normalized = normalizedVideoId(videoId);
  if (normalized === null) {
    return [];
  }

  return YOUTUBE_THUMBNAIL_NAMES.map(
    (thumbnailName) => `${YOUTUBE_THUMBNAIL_BASE_URL}/${normalized}/${thumbnailName}.jpg`,
  );
}
