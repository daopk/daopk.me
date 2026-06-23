import { computed, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { movieQualityLabel } from "./useMovieHlsSource";
import { isAppleTouchPlatform } from "./useMoviePictureInPicture";
import {
  moviePlaybackSpeedLabel,
  normalizedMoviePlaybackSpeed,
  safeMediaNumber,
  useMoviePlaybackState,
} from "./useMoviePlaybackState";
import { useMoviePlayerControls } from "./useMoviePlayerControls";
import { useMoviePlayerSeek } from "./useMoviePlayerSeek";

describe("movie player composables", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats quality and playback labels with safe fallbacks", () => {
    const fallback = (index: number) => `Quality ${index + 1}`;

    expect(movieQualityLabel({ bitrate: 0, height: 1080 }, 0, fallback)).toBe("1080p");
    expect(movieQualityLabel({ bitrate: 2_500_000, height: 0 }, 1, fallback)).toBe("2500 kbps");
    expect(movieQualityLabel({ bitrate: 0, height: 0 }, 2, fallback)).toBe("Quality 3");
    expect(movieQualityLabel(undefined, 3, fallback)).toBe("Quality 4");
    expect(moviePlaybackSpeedLabel(1.25)).toBe("1.25x");
  });

  it("normalizes media numbers and playback speeds", () => {
    expect(safeMediaNumber(42)).toBe(42);
    expect(safeMediaNumber(Number.NaN)).toBe(0);
    expect(safeMediaNumber(-1)).toBe(0);
    expect(normalizedMoviePlaybackSpeed(1.5)).toBe(1.5);
    expect(normalizedMoviePlaybackSpeed(1.1)).toBe(1);
  });

  it("detects Apple touch platforms including touch-capable Macs", () => {
    expect(
      isAppleTouchPlatform({
        maxTouchPoints: 0,
        platform: "iPhone",
        userAgent: "Mozilla/5.0 (iPhone)",
      } as Navigator),
    ).toBe(true);
    expect(
      isAppleTouchPlatform({
        maxTouchPoints: 5,
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh)",
      } as Navigator),
    ).toBe(true);
    expect(
      isAppleTouchPlatform({
        maxTouchPoints: 0,
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows)",
      } as Navigator),
    ).toBe(false);
  });

  it("auto-hides controls only when playback can hide them", () => {
    vi.useFakeTimers();

    const controls = useMoviePlayerControls({
      controlsFocused: ref(false),
      playbackError: computed(() => ""),
      playing: ref(true),
      seeking: ref(false),
      shouldRevealControls: () => true,
      waiting: ref(false),
    });

    controls.showControls({ force: true });
    expect(controls.controlsVisible.value).toBe(true);

    vi.advanceTimersByTime(3200);
    expect(controls.controlsVisible.value).toBe(false);
  });

  it("keeps controls visible when reveal suppression is active", () => {
    const controls = useMoviePlayerControls({
      controlsFocused: ref(false),
      playbackError: computed(() => ""),
      playing: ref(true),
      seeking: ref(false),
      shouldRevealControls: () => false,
      waiting: ref(false),
    });

    controls.controlsVisible.value = false;
    controls.showControls();
    expect(controls.controlsVisible.value).toBe(false);
    controls.showControls({ force: true });
    expect(controls.controlsVisible.value).toBe(true);
  });

  it("applies volume, mute, and playback speed to the media element", () => {
    const video = document.createElement("video");
    const emittedSpeeds: number[] = [];
    const state = useMoviePlaybackState({
      emitPlaybackSpeed: (speed) => emittedSpeeds.push(speed),
      initialPlaybackSpeed: 1,
      showControls: () => {},
      videoElement: ref(video),
    });

    state.setVolumeFromSlider(35);
    expect(state.volume.value).toBe(0.35);
    expect(video.volume).toBe(0.35);

    state.toggleMute();
    expect(state.muted.value).toBe(true);
    expect(video.muted).toBe(true);

    state.toggleMute();
    expect(state.muted.value).toBe(false);
    expect(video.muted).toBe(false);

    state.setPlaybackSpeed(1.5);
    expect(state.playbackSpeed.value).toBe(1.5);
    expect(video.playbackRate).toBe(1.5);
    expect(emittedSpeeds).toEqual([1.5]);
  });

  it("commits seek changes and reports keyboard deltas", () => {
    const video = document.createElement("video");
    const currentTime = ref(10);
    const seekPosition = ref(10);
    const seeking = ref(false);
    const seekPointerPreview = ref<{ leftPx: number; seconds: number } | null>(null);
    const persisted: boolean[] = [];
    const seek = useMoviePlayerSeek({
      clearHideControlsTimer: () => {},
      controlsHidden: computed(() => false),
      controlsVisible: ref(true),
      currentTime,
      duration: ref(120),
      hasDuration: computed(() => true),
      persistPlaybackProgress: () => persisted.push(true),
      playing: ref(true),
      progressRoot: ref(null),
      scheduleAutoHideControls: () => {},
      seekPointerPreview,
      seekPosition,
      seekPreviewThumbSizePx: 16,
      seeking,
      showControls: () => {},
      videoElement: ref(video),
    });

    expect(seek.keyboardSeekDeltaSeconds("ArrowLeft")).toBe(-10);
    expect(seek.keyboardSeekDeltaSeconds("ArrowRight")).toBe(10);
    expect(seek.keyboardSeekDeltaSeconds("Enter")).toBeNull();

    seek.commitSeek(42);
    expect(video.currentTime).toBe(42);
    expect(currentTime.value).toBe(42);
    expect(seekPosition.value).toBe(42);
    expect(seeking.value).toBe(false);
    expect(seekPointerPreview.value).toBeNull();
    expect(persisted).toEqual([true]);
  });
});
