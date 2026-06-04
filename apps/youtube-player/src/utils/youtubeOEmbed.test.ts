import { describe, expect, it, vi } from "vitest";

import {
  aspectRatioFromYouTubeOEmbed,
  fetchYouTubeVideoAspectRatio,
  youtubeOEmbedUrl,
} from "./youtubeOEmbed";

describe("youtubeOEmbed utils", () => {
  it("builds a YouTube oEmbed URL from a video id", () => {
    const url = youtubeOEmbedUrl(" fY6h5FBTZM8 ");

    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin + parsed.pathname).toBe("https://www.youtube.com/oembed");
    expect(parsed.searchParams.get("url")).toBe(
      "https://www.youtube.com/watch?v=fY6h5FBTZM8",
    );
    expect(parsed.searchParams.get("format")).toBe("json");
    expect(youtubeOEmbedUrl("not-a-video-id")).toBeNull();
  });

  it("reads the video aspect ratio from oEmbed dimensions", () => {
    expect(aspectRatioFromYouTubeOEmbed({ width: 200, height: 150 })).toBe(4 / 3);
    expect(
      aspectRatioFromYouTubeOEmbed({
        thumbnail_width: 1280,
        thumbnail_height: 720,
      }),
    ).toBe(16 / 9);
    expect(aspectRatioFromYouTubeOEmbed({ width: 0, height: 150 })).toBeNull();
    expect(aspectRatioFromYouTubeOEmbed(null)).toBeNull();
  });

  it("fetches the oEmbed aspect ratio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: vi.fn(async () => ({ width: 200, height: 100 })),
      })),
    );

    await expect(fetchYouTubeVideoAspectRatio("rZaIfqAqQIw")).resolves.toBe(2);
    expect(fetch).toHaveBeenCalledWith(
      "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DrZaIfqAqQIw&format=json",
      { signal: undefined },
    );

    vi.unstubAllGlobals();
  });
});
