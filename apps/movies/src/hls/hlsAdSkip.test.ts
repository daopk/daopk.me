import { describe, expect, it, vi } from "vitest";

import {
  createAdSkippingPlaylistLoader,
  rewriteHlsPlaylistForAdSkip,
  type HlsAdReplacementRule,
} from "./hlsAdSkip";
import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderStats,
  PlaylistLoaderContext,
} from "hls.js";

const SAMPLE_PLAYLIST_URL = "https://stream.example.test/20260527/uKkgEeIW/3500kb/hls/index.m3u8";

const SAMPLE_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-PLAYLIST-TYPE:vod
#EXT-X-TARGETDURATION:8
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:5.04,
W1GTKmjW.ts
#EXT-X-DISCONTINUITY
#EXTINF:3.68,
convertv8/EKArvCFM.ts
#EXT-X-DISCONTINUITY
#EXT-X-DISCONTINUITY
#EXTINF:4.28,
convertv8/gYVhANwY.ts
#EXT-X-DISCONTINUITY
#EXTINF:4.00,
ZWTAIiua.ts
#EXTINF:3.44,
llWpVERr.ts
#EXT-X-DISCONTINUITY
#EXTINF:3.60,
/v8/18d007379882ef14b73445b93bf6168d/segment_0001.ts
#EXTINF:2.56,
/v8/18d007379882ef14b73445b93bf6168d/segment_0002.ts
#EXTINF:3.00,
/v8/18d007379882ef14b73445b93bf6168d/segment_0003.ts
#EXTINF:3.64,
/v8/18d007379882ef14b73445b93bf6168d/segment_0004.ts
#EXTINF:4.56,
/v8/18d007379882ef14b73445b93bf6168d/segment_0005.ts
#EXTINF:2.52,
/v8/18d007379882ef14b73445b93bf6168d/segment_0006.ts
#EXT-X-DISCONTINUITY
#EXTINF:6.16,
Uhv6Dk26.ts
#EXT-X-ENDLIST
`;

function makeStats(): LoaderStats {
  return {
    aborted: false,
    buffering: { end: 0, first: 0, start: 0 },
    bwEstimate: 0,
    chunkCount: 0,
    loaded: 0,
    loading: { end: 0, first: 0, start: 0 },
    parsing: { end: 0, start: 0 },
    retry: 0,
    total: 0,
  };
}

function makePlaylistContext(): PlaylistLoaderContext {
  return {
    deliveryDirectives: null,
    id: null,
    level: 0,
    levelOrTrack: null,
    responseType: "text",
    type: "level",
    url: SAMPLE_PLAYLIST_URL,
  } as PlaylistLoaderContext;
}

describe("hlsAdSkip", () => {
  it("removes replacement-video ad segments without removing convertv8 overlays", () => {
    const result = rewriteHlsPlaylistForAdSkip(SAMPLE_PLAYLIST, {
      playlistUrl: SAMPLE_PLAYLIST_URL,
    });

    expect(result.removedGroups).toHaveLength(1);
    expect(result.removedGroups[0]).toMatchObject({
      durationSeconds: 19.88,
      ruleId: "hashed-segment-sequence-replacement",
      segmentCount: 6,
    });
    expect(result.markers).toHaveLength(2);
    expect(result.markers[0]).toMatchObject({
      kind: "overlay",
      ruleId: "converted-path-overlay",
      segmentCount: 2,
    });
    expect(result.markers[0]?.durationSeconds).toBeCloseTo(7.96);
    expect(result.markers[0]?.startSeconds).toBeCloseTo(5.04);
    expect(result.markers[1]).toMatchObject({
      durationSeconds: 0,
      kind: "skipped-replacement",
      ruleId: "hashed-segment-sequence-replacement",
      segmentCount: 6,
    });
    expect(result.markers[1]?.skippedDurationSeconds).toBeCloseTo(19.88);
    expect(result.markers[1]?.startSeconds).toBeCloseTo(20.44);
    expect(result.playlist).toContain("convertv8/EKArvCFM.ts");
    expect(result.playlist).toContain("convertv8/gYVhANwY.ts");
    expect(result.playlist).not.toContain("/v8/18d007379882ef14b73445b93bf6168d/");
    expect(result.playlist).toContain(`#EXTINF:3.44,
llWpVERr.ts
#EXT-X-DISCONTINUITY
#EXTINF:6.16,
Uhv6Dk26.ts`);
  });

  it("leaves master playlists unchanged", () => {
    const playlist = `#EXTM3U
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=3500000,RESOLUTION=1920x1040
3500kb/hls/index.m3u8
`;

    expect(rewriteHlsPlaylistForAdSkip(playlist).playlist).toBe(playlist);
    expect(rewriteHlsPlaylistForAdSkip(playlist).markers).toEqual([]);
  });

  it("allows replacement segment rules to be customized", () => {
    const rule: HlsAdReplacementRule = {
      id: "custom-cdn",
      matchesSegment: (segment) => segment.uri.startsWith("ads/"),
      minDurationSeconds: 6,
      minSegmentCount: 2,
    };
    const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXTINF:4,
content-a.ts
#EXT-X-DISCONTINUITY
#EXTINF:3,
ads/a.ts
#EXTINF:3,
ads/b.ts
#EXT-X-DISCONTINUITY
#EXTINF:4,
content-b.ts
`;

    const result = rewriteHlsPlaylistForAdSkip(playlist, {}, { replacementRules: [rule] });

    expect(result.removedGroups).toHaveLength(1);
    expect(result.removedGroups[0]?.ruleId).toBe("custom-cdn");
    expect(result.playlist).not.toContain("ads/a.ts");
    expect(result.playlist).toContain("content-b.ts");
    expect(result.markers).toEqual([
      {
        durationSeconds: 0,
        kind: "skipped-replacement",
        ruleId: "custom-cdn",
        segmentCount: 2,
        skippedDurationSeconds: 6,
        startSeconds: 4,
      },
    ]);
  });

  it("rewrites playlist loader string responses", () => {
    class FakeLoader implements Loader<PlaylistLoaderContext> {
      context: PlaylistLoaderContext | null = null;
      stats = makeStats();

      abort = vi.fn();
      destroy = vi.fn();
      load = vi.fn(
        (
          context: PlaylistLoaderContext,
          _config: LoaderConfiguration,
          callbacks: LoaderCallbacks<PlaylistLoaderContext>,
        ) => {
          this.context = context;
          callbacks.onSuccess(
            {
              data: SAMPLE_PLAYLIST,
              url: SAMPLE_PLAYLIST_URL,
            },
            this.stats,
            context,
            null,
          );
        },
      );
    }

    const onAdMarkers = vi.fn();
    const onSuccess = vi.fn();

    const LoaderClassWithMarkers = createAdSkippingPlaylistLoader({ onAdMarkers });
    const loaderWithMarkers = new LoaderClassWithMarkers({
      loader: FakeLoader,
    } as unknown as HlsConfig);

    loaderWithMarkers.load(makePlaylistContext(), {} as LoaderConfiguration, {
      onAbort: vi.fn(),
      onError: vi.fn(),
      onSuccess,
      onTimeout: vi.fn(),
    });

    const response = onSuccess.mock.calls[0]?.[0] as { data: string };
    expect(response.data).not.toContain("/v8/18d007379882ef14b73445b93bf6168d/");
    expect(response.data).toContain("convertv8/EKArvCFM.ts");
    expect(onAdMarkers).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "overlay", startSeconds: 5.04 }),
      expect.objectContaining({ kind: "skipped-replacement", startSeconds: 20.44 }),
    ]);
  });
});
