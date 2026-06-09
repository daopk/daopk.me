import { describe, expect, it } from "vitest";

import {
  normalizedVideoId,
  videoIdFromLaunchArgs,
  videoIdFromUserInput,
  videoIdFromUrl,
  youtubeThumbnailUrls,
} from "./youtubeVideo";

describe("youtubeVideo utils", () => {
  it("normalizes only valid YouTube video ids", () => {
    expect(normalizedVideoId(" IQsLEaj89bg ")).toBe("IQsLEaj89bg");
    expect(normalizedVideoId("not-a-video-id")).toBeNull();
    expect(normalizedVideoId(null)).toBeNull();
  });

  it.each([
    ["watch URL", "https://www.youtube.com/watch?v=IQsLEaj89bg"],
    ["short URL", "https://youtu.be/IQsLEaj89bg"],
    ["embed URL", "https://www.youtube.com/embed/IQsLEaj89bg"],
    ["shorts URL", "https://www.youtube.com/shorts/IQsLEaj89bg"],
    ["live URL", "https://www.youtube.com/live/IQsLEaj89bg"],
    ["mobile URL", "https://m.youtube.com/watch?v=IQsLEaj89bg"],
  ])("extracts video ids from %s", (_label, url) => {
    expect(videoIdFromUrl(url)).toBe("IQsLEaj89bg");
  });

  it("rejects malformed and non-YouTube URLs", () => {
    expect(videoIdFromUrl("youtube.com/watch?v=IQsLEaj89bg")).toBeNull();
    expect(videoIdFromUrl("https://example.com/watch?v=IQsLEaj89bg")).toBeNull();
  });

  it("extracts video ids from manual user input", () => {
    expect(videoIdFromUserInput(" IQsLEaj89bg ")).toBe("IQsLEaj89bg");
    expect(videoIdFromUserInput("youtube.com/watch?v=IQsLEaj89bg")).toBe("IQsLEaj89bg");
    expect(videoIdFromUserInput("https://youtu.be/IQsLEaj89bg")).toBe("IQsLEaj89bg");
    expect(videoIdFromUserInput("https://example.com/watch?v=IQsLEaj89bg")).toBeNull();
  });

  it("prioritizes direct videoId launch args over URL args", () => {
    expect(
      videoIdFromLaunchArgs({
        videoId: "abcdefghijk",
        url: "https://www.youtube.com/watch?v=IQsLEaj89bg",
      }),
    ).toBe("abcdefghijk");
  });

  it("builds thumbnail fallback URLs from a video id", () => {
    expect(youtubeThumbnailUrls(" IQsLEaj89bg ")).toEqual([
      "https://img.youtube.com/vi/IQsLEaj89bg/maxresdefault.jpg",
      "https://img.youtube.com/vi/IQsLEaj89bg/sddefault.jpg",
      "https://img.youtube.com/vi/IQsLEaj89bg/hqdefault.jpg",
      "https://img.youtube.com/vi/IQsLEaj89bg/mqdefault.jpg",
      "https://img.youtube.com/vi/IQsLEaj89bg/default.jpg",
    ]);
    expect(youtubeThumbnailUrls("not-a-video-id")).toEqual([]);
  });
});
