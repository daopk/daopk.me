import { computed, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { moviePlayerAdMarkerTrackBackground } from "../utils/moviePlayerAdMarkers";
import { formatMoviePlayerTime } from "../utils/moviePlayerTime";
import { clampNumber } from "../utils/number";
import { movieQualityLabel } from "./useMovieHlsSource";
import { isAppleTouchPlatform } from "./useMoviePictureInPicture";
import {
  moviePlaybackSpeedLabel,
  normalizedMoviePlaybackSpeed,
  safeMediaNumber,
  useMoviePlaybackState,
} from "./useMoviePlaybackState";
import { useMoviePlayerControls } from "./useMoviePlayerControls";
import { useMoviePlayerKeyboardShortcuts } from "./useMoviePlayerKeyboardShortcuts";
import { useMoviePlayerMediaEvents } from "./useMoviePlayerMediaEvents";
import { useMoviePlayerMediaState } from "./useMoviePlayerMediaState";
import { useMoviePlayerSeek } from "./useMoviePlayerSeek";
import { useMoviePlayerSurface } from "./useMoviePlayerSurface";
import { useMoviePlayerViewState } from "./useMoviePlayerViewState";

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
    expect(clampNumber(12, 0, 10)).toBe(10);
    expect(clampNumber(-1, 0, 10)).toBe(0);
  });

  it("formats player time and ad marker track backgrounds", () => {
    expect(formatMoviePlayerTime(65.8)).toBe("1:05");
    expect(formatMoviePlayerTime(3671)).toBe("1:01:11");
    expect(formatMoviePlayerTime(-10)).toBe("0:00");
    expect(moviePlayerAdMarkerTrackBackground([], 120)).toBe("none");
    expect(
      moviePlayerAdMarkerTrackBackground([{ startSeconds: 30, durationSeconds: 10 }], 100),
    ).toContain("transparent 30.000%");
    expect(
      moviePlayerAdMarkerTrackBackground(
        [{ kind: "skipped-replacement", startSeconds: 90, durationSeconds: 0 }],
        100,
      ),
    ).toContain("rgb(255 96 96 / 90%)");
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

  it("syncs media state and video aspect ratio", () => {
    const video = document.createElement("video");
    const stage = document.createElement("div");
    const currentTime = ref(0);
    const duration = ref(0);
    const bufferedEnd = ref(0);
    const seekPosition = ref(0);
    const syncedVolumes: number[] = [];

    Object.defineProperty(video, "currentTime", { configurable: true, value: 42 });
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1080 });
    Object.defineProperty(video, "buffered", {
      configurable: true,
      value: {
        end: () => 80,
        length: 1,
      },
    });

    const media = useMoviePlayerMediaState({
      bufferedEnd,
      currentTime,
      duration,
      playerShell: ref(stage),
      seeking: ref(false),
      seekPosition,
      syncVolumeState: () => syncedVolumes.push(video.volume),
      videoElement: ref(video),
    });

    media.syncMediaState();
    expect(currentTime.value).toBe(42);
    expect(duration.value).toBe(120);
    expect(bufferedEnd.value).toBe(80);
    expect(seekPosition.value).toBe(42);
    expect(syncedVolumes).toEqual([1]);

    media.syncVideoAspectRatio();
    expect(stage.style.getPropertyValue("--movies-player-stage-aspect-ratio")).toBe("1920 / 1080");
    expect(stage.style.getPropertyValue("--movies-player-stage-aspect-ratio-value")).toBe(
      "1.777778",
    );

    media.resetVideoAspectRatio();
    expect(stage.style.getPropertyValue("--movies-player-stage-aspect-ratio")).toBe("");
  });

  it("runs media event state transitions", () => {
    const video = document.createElement("video");
    const controlsVisible = ref(false);
    const metadataLoaded = ref(false);
    const playing = ref(false);
    const waiting = ref(true);
    const persisted: unknown[] = [];
    const playbackErrors: string[] = [];
    const calls: string[] = [];
    const mediaEvents = useMoviePlayerMediaEvents({
      applyPlaybackSpeed: () => calls.push("speed"),
      applySavedPlaybackProgress: () => calls.push("resume"),
      clearControlsRevealSuppression: () => calls.push("clear-suppression"),
      clearHideControlsTimer: () => calls.push("clear-hide"),
      clearPlaybackProgress: () => calls.push("clear-progress"),
      controlsVisible,
      metadataLoaded,
      persistPlaybackProgress: (options) => persisted.push(options ?? {}),
      playing,
      scheduleAutoHideControls: () => calls.push("auto-hide"),
      setPlaybackError: (key) => playbackErrors.push(key),
      showControls: () => calls.push("show"),
      syncMediaState: () => calls.push("sync"),
      syncVideoAspectRatio: () => calls.push("aspect"),
      updateBufferedEnd: () => calls.push("buffer"),
      videoElement: ref(video),
      waiting,
    });

    mediaEvents.onLoadedMetadata();
    expect(metadataLoaded.value).toBe(true);
    expect(calls).toEqual(["speed", "aspect", "sync", "resume"]);

    calls.length = 0;
    mediaEvents.onVideoPause();
    expect(playing.value).toBe(false);
    expect(waiting.value).toBe(false);
    expect(controlsVisible.value).toBe(true);
    expect(persisted).toEqual([{ force: true }]);
    expect(calls).toEqual(["clear-suppression", "clear-hide", "sync"]);

    calls.length = 0;
    mediaEvents.onVideoError();
    expect(playbackErrors).toEqual(["movies.player.error.streamFailed"]);
    expect(calls).toEqual(["clear-suppression", "show"]);
  });

  it("debounces surface playback toggles and ignores controls", () => {
    vi.useFakeTimers();

    const controlsRoot = document.createElement("div");
    const controlButton = document.createElement("button");
    const stage = document.createElement("div");
    controlsRoot.append(controlButton);
    const toggles: string[] = [];
    const fullscreen = vi.fn(() => Promise.resolve());
    const surface = useMoviePlayerSurface({
      backControlsRoot: ref(null),
      controlsFocused: ref(false),
      controlsRoot: ref(controlsRoot),
      scheduleAutoHideControls: () => {},
      showControls: () => {},
      toggleFullscreen: fullscreen,
      togglePlayback: () => toggles.push("play"),
      topbarControlsRoot: ref(null),
    });

    surface.onPlayerSurfaceClick(primaryClick(stage));
    expect(toggles).toEqual([]);
    vi.advanceTimersByTime(220);
    expect(toggles).toEqual(["play"]);

    surface.onPlayerSurfaceClick(primaryClick(controlButton, [controlButton, controlsRoot, stage]));
    vi.advanceTimersByTime(220);
    expect(toggles).toEqual(["play"]);

    const doubleClick = primaryClick(stage, [stage]);
    surface.onPlayerSurfaceDoubleClick(doubleClick);
    expect(doubleClick.preventDefault).toHaveBeenCalledTimes(1);
    expect(fullscreen).toHaveBeenCalledTimes(1);
  });

  it("handles keyboard playback, seek, volume, and fallback fullscreen shortcuts", () => {
    const seekCalls: unknown[] = [];
    const shortcutCalls: string[] = [];
    const volume = ref(0.5);
    const fallbackFullscreen = ref(false);
    const keyboard = useMoviePlayerKeyboardShortcuts({
      cancelSeekPreview: () => shortcutCalls.push("cancel"),
      controlsHidden: computed(() => true),
      exitFallbackFullscreen: () => shortcutCalls.push("exit-fallback"),
      fallbackFullscreen,
      keyboardSeekDeltaSeconds: (key) => (key === "ArrowRight" ? 10 : null),
      onSeekKeydownBase: (_event, options) => seekCalls.push(options),
      playerControlsContain: () => false,
      playing: ref(true),
      seekBy: (deltaSeconds, options) => seekCalls.push({ deltaSeconds, options }),
      setVolume: (nextVolume) => {
        volume.value = nextVolume;
      },
      suppressControlsRevealForKeyboardSeek: () => shortcutCalls.push("suppress"),
      toggleFullscreen: () => {
        shortcutCalls.push("fullscreen");
        return Promise.resolve();
      },
      toggleMute: () => shortcutCalls.push("mute"),
      togglePlayback: () => shortcutCalls.push("playback"),
      volume,
    });

    const playEvent = keyboardEvent("k");
    keyboard.handleAppKeydown(playEvent);
    expect(playEvent.defaultPrevented).toBe(true);
    expect(shortcutCalls).toEqual(["playback"]);

    const seekEvent = keyboardEvent("ArrowRight");
    keyboard.onStageKeydown(seekEvent);
    expect(seekCalls).toContainEqual({
      deltaSeconds: 10,
      options: { preserveHiddenControls: true },
    });
    expect(shortcutCalls).toContain("suppress");

    keyboard.onStageKeydown(keyboardEvent("ArrowUp"));
    expect(volume.value).toBe(0.6);

    keyboard.onStageKeydown(keyboardEvent("m"));
    keyboard.onStageKeydown(keyboardEvent("f"));
    expect(shortcutCalls).toEqual(["playback", "suppress", "mute", "fullscreen"]);

    fallbackFullscreen.value = true;
    const escapeEvent = keyboardEvent("Escape");
    keyboard.onStageKeydown(escapeEvent);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(shortcutCalls).toContain("exit-fallback");
  });

  it("derives movie player view state labels and control styles", () => {
    const viewState = useMoviePlayerViewState({
      bufferedEnd: ref(50),
      currentLevel: ref(0),
      currentTime: ref(12),
      duration: ref(100),
      fullscreen: ref(false),
      hasDuration: computed(() => true),
      hlsLevels: ref([{ bitrate: 0, height: 1080 }]),
      mutedOrSilent: computed(() => false),
      pictureInPicture: ref(false),
      playbackAdMarkers: ref([{ startSeconds: 25, durationSeconds: 5 }]),
      playbackError: computed(() => ""),
      playbackSpeed: ref(1.5),
      playing: ref(false),
      props: {
        nextEpisodeLabel: "Next episode",
        posterUrl: "poster.jpg",
      },
      qualityFallbackLabel: (index) => `Quality ${index + 1}`,
      qualityOptions: computed(() => [{ label: "1080p", value: 0 }]),
      seeking: ref(true),
      seekPointerPreview: ref({ leftPx: 24, seconds: 44 }),
      seekPosition: ref(44),
      selectedQualityLevel: ref(-1),
      seekPreviewThumbSizePx: 16,
      t: (key, params) =>
        key === "movies.player.autoQuality" ? `Auto (${String(params?.quality)})` : key,
      waiting: ref(false),
    });

    expect(viewState.formatTime(44)).toBe("0:44");
    expect(viewState.sourceStatusText.value).toBe("Auto (1080p) - 1.5x");
    expect(viewState.seekValueText.value).toBe("movies.player.seekValue");
    expect(viewState.seekPointerPreviewText.value).toBe("0:44");
    expect(viewState.showCenterPlay.value).toBe(true);
    expect(viewState.showNextEpisodeButton.value).toBe(true);
    expect(viewState.controlsStyle.value["--movies-player-loaded"]).toBe("0.5");
    expect(viewState.controlsStyle.value["--movies-player-preview-left"]).toBe("24px");
    expect(viewState.controlsStyle.value["--movies-player-ad-markers"]).toContain(
      "transparent 25.000%",
    );
  });
});

function primaryClick(
  target: EventTarget,
  path: readonly EventTarget[] = [target],
): MouseEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  return {
    altKey: false,
    button: 0,
    composedPath: () => [...path],
    ctrlKey: false,
    defaultPrevented: false,
    detail: 1,
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    stopPropagation: vi.fn(),
    target,
  } as unknown as MouseEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

function keyboardEvent(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { cancelable: true, key });
}
