import { normalizedAspectRatio } from "./aspectRatio";
import { normalizedVideoId } from "./youtubeVideo";

const YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed";

export function youtubeOEmbedUrl(videoId: unknown): string | null {
  const normalized = normalizedVideoId(videoId);
  if (normalized === null) {
    return null;
  }

  const url = new URL(YOUTUBE_OEMBED_ENDPOINT);
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${normalized}`);
  url.searchParams.set("format", "json");

  return url.toString();
}

function numericField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function aspectRatioFromYouTubeOEmbed(input: unknown): number | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const width = numericField(record, "width") ?? numericField(record, "thumbnail_width");
  const height = numericField(record, "height") ?? numericField(record, "thumbnail_height");

  if (width === null || height === null) {
    return null;
  }

  return normalizedAspectRatio(width / height);
}

export async function fetchYouTubeVideoAspectRatio(
  videoId: unknown,
  options: { readonly signal?: AbortSignal } = {},
): Promise<number | null> {
  const url = youtubeOEmbedUrl(videoId);
  if (url === null) {
    return null;
  }

  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) {
    return null;
  }

  return aspectRatioFromYouTubeOEmbed(await response.json());
}
