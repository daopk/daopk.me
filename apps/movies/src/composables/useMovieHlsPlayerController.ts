import { computed, onBeforeUnmount, onMounted, ref, toRef, useTemplateRef, watch } from "vue";

import type { MoviesTranslate } from "../i18n/useMoviesI18n";
import type { MoviePlayInfo } from "../moviesApi";
import type { MoviesWatchContinuity, MoviesWatchTarget } from "../moviesWatchContinuity";
import { moviePlayerAdMarkerTrackBackground } from "../utils/moviePlayerAdMarkers";
import { formatMoviePlayerTime } from "../utils/moviePlayerTime";
import { clampNumber } from "../utils/number";
import {
  movieQualityLabel,
  useMovieHlsSource,
  type MoviePlaybackErrorKey,
} from "./useMovieHlsSource";
import { useMoviePictureInPicture } from "./useMoviePictureInPicture";
import { useMoviePlaybackProgress } from "./useMoviePlaybackProgress";
import {
  MOVIE_PLAYBACK_SPEED_OPTIONS as PLAYBACK_SPEED_OPTIONS,
  moviePlaybackSpeedLabel as speedLabel,
  normalizedMoviePlaybackSpeed as normalizedPlaybackSpeed,
  useMoviePlaybackState,
} from "./useMoviePlaybackState";
import { useMoviePlayerControls } from "./useMoviePlayerControls";
import { useMoviePlayerFullscreen } from "./useMoviePlayerFullscreen";
import { useMoviePlayerMediaEvents } from "./useMoviePlayerMediaEvents";
import { useMoviePlayerMediaState } from "./useMoviePlayerMediaState";
import { useMoviePlayerSeek } from "./useMoviePlayerSeek";

export interface MovieHlsPlayerProps {
  autoplay?: boolean;
  nextEpisodeLabel?: string;
  play: MoviePlayInfo;
  playbackSpeed?: number;
  posterUrl?: string;
  showBackButton?: boolean;
  sourceIndex?: number;
  target: MoviesWatchTarget;
  title: string;
  watchContinuity: MoviesWatchContinuity;
}

export interface MovieHlsPlayerControllerProps extends MovieHlsPlayerProps {
  autoplay: boolean;
  nextEpisodeLabel: string;
  playbackSpeed: number;
  posterUrl: string;
  showBackButton: boolean;
  sourceIndex: number;
}

interface UseMovieHlsPlayerControllerOptions {
  readonly emitPlaybackSpeed: (speed: number) => void;
  readonly props: Readonly<MovieHlsPlayerControllerProps>;
  readonly t: MoviesTranslate;
}

const SEEK_PREVIEW_THUMB_SIZE_PX = 16;
const KEYBOARD_SEEK_REVEAL_SUPPRESSION_MS = 1200;
const SURFACE_CLICK_DELAY_MS = 220;
const VOLUME_STEP = 0.1;

function hasSystemShortcutModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

export function useMovieHlsPlayerController({
  emitPlaybackSpeed,
  props,
  t,
}: UseMovieHlsPlayerControllerOptions) {
  const playerShell = useTemplateRef<HTMLElement>("playerShell");
  const topbarControlsRoot = useTemplateRef<HTMLElement>("topbarControlsRoot");
  const backControlsRoot = useTemplateRef<HTMLElement>("backControlsRoot");
  const controlsRoot = useTemplateRef<HTMLElement>("controlsRoot");
  const progressRoot = useTemplateRef<HTMLElement>("progressRoot");
  const videoElement = useTemplateRef<HTMLVideoElement>("videoElement");
  const playbackErrorKey = ref<MoviePlaybackErrorKey | "">("");
  const currentTime = ref(0);
  const duration = ref(0);
  const bufferedEnd = ref(0);
  const playing = ref(false);
  const waiting = ref(false);
  const metadataLoaded = ref(false);
  const controlsFocused = ref(false);
  const seeking = ref(false);
  const seekPosition = ref(0);
  const seekPointerPreview = ref<{ leftPx: number; seconds: number } | null>(null);

  let suppressControlsRevealUntilMs = 0;

  const playbackSpeedOptions = PLAYBACK_SPEED_OPTIONS;
  const playbackError = computed(() =>
    playbackErrorKey.value === "" ? "" : t(playbackErrorKey.value),
  );
  const hasDuration = computed(() => Number.isFinite(duration.value) && duration.value > 0);
  const {
    controlsHidden,
    controlsVisible,
    clearHideControlsTimer,
    resetControlsVisibility,
    scheduleAutoHideControls,
    showControls,
  } = useMoviePlayerControls({
    controlsFocused,
    playbackError,
    playing,
    seeking,
    shouldRevealControls: () => !shouldSuppressControlsReveal(),
    waiting,
  });
  const {
    muted,
    mutedOrSilent,
    playbackSpeed,
    volume,
    volumeSliderValue,
    applyPlaybackSpeed,
    setPlaybackSpeed,
    setVolume,
    setVolumeFromSlider,
    syncVolumeState,
    toggleMute,
  } = useMoviePlaybackState({
    emitPlaybackSpeed,
    initialPlaybackSpeed: props.playbackSpeed,
    showControls,
    videoElement,
  });
  const { resetVideoAspectRatio, syncMediaState, syncVideoAspectRatio, updateBufferedEnd } =
    useMoviePlayerMediaState({
      bufferedEnd,
      currentTime,
      duration,
      playerShell,
      seeking,
      seekPosition,
      syncVolumeState,
      videoElement,
    });
  const {
    applySavedPlaybackProgress,
    clearPlaybackProgress,
    persistPlaybackProgress,
    resetPlaybackProgressState,
  } = useMoviePlaybackProgress({
    currentTime,
    duration,
    hasDuration,
    metadataLoaded,
    play: toRef(props, "play"),
    seekPosition,
    sourceIndex: toRef(props, "sourceIndex"),
    syncMediaState,
    target: toRef(props, "target"),
    videoElement,
    watchContinuity: props.watchContinuity,
  });
  const {
    fallbackFullscreen,
    fullscreen,
    exitFallbackFullscreen,
    syncFullscreenState,
    toggleFullscreen,
  } = useMoviePlayerFullscreen({
    playerShell,
    videoElement,
    showControls,
  });
  const {
    pictureInPicture,
    pictureInPictureSupported,
    syncPictureInPictureState,
    togglePictureInPicture,
  } = useMoviePictureInPicture({
    videoElement,
    showControls,
  });
  const {
    activeSource,
    currentLevel,
    hlsLevels,
    playbackAdMarkers,
    qualityOptions,
    selectedQualityLevel,
    attachSource,
    destroyHls,
    resetHlsSourceState,
    setQualityLevel,
  } = useMovieHlsSource({
    play: toRef(props, "play"),
    sourceIndex: toRef(props, "sourceIndex"),
    videoElement,
    applyPlaybackSpeed,
    onFatalError: () => {
      waiting.value = false;
      showControls({ force: true });
    },
    onQualityChanged: () => {
      showControls({ force: true });
    },
    persistPlaybackProgress,
    qualityFallbackLabel,
    requestAutoplayOnce,
    resetPlaybackState,
    setPlaybackError,
  });
  const qualitySelectValue = computed({
    get: () => String(selectedQualityLevel.value),
    set: (nextValue: string) => {
      setQualityLevel(Number(nextValue));
    },
  });
  const playbackSpeedSelectValue = computed({
    get: () => String(playbackSpeed.value),
    set: (nextValue: string) => {
      setPlaybackSpeed(Number(nextValue));
    },
  });
  const {
    cancelSeekPreview,
    commitSeek,
    keyboardSeekDeltaSeconds,
    onSeekKeydown: onSeekKeydownBase,
    onSeekPointerCancel,
    onSeekPointerDown,
    onSeekPointerLeave,
    onSeekPointerMove,
    onSeekPointerUp,
    previewSeek,
    seekBy,
  } = useMoviePlayerSeek({
    clearHideControlsTimer,
    controlsHidden,
    controlsVisible,
    currentTime,
    duration,
    hasDuration,
    persistPlaybackProgress,
    playing,
    progressRoot,
    scheduleAutoHideControls,
    seekPointerPreview,
    seekPosition,
    seekPreviewThumbSizePx: SEEK_PREVIEW_THUMB_SIZE_PX,
    seeking,
    showControls,
    videoElement,
  });
  const hasQualityMenu = computed(() => qualityOptions.value.length > 0);
  const hasSettingsMenu = computed(() => true);
  const selectedQualityLabel = computed(() => {
    if (!hasQualityMenu.value) {
      return "";
    }

    if (selectedQualityLevel.value === -1) {
      return currentLevel.value >= 0
        ? t("movies.player.autoQuality", {
            quality: movieQualityLabel(
              hlsLevels.value[currentLevel.value],
              currentLevel.value,
              qualityFallbackLabel,
            ),
          })
        : t("movies.player.auto");
    }

    return (
      qualityOptions.value.find((option) => option.value === selectedQualityLevel.value)?.label ??
      t("movies.player.auto")
    );
  });
  const selectedPlaybackSpeedStatus = computed(() =>
    playbackSpeed.value === 1 ? "" : speedLabel(playbackSpeed.value),
  );
  const sourceStatusText = computed(() => {
    const parts = [selectedQualityLabel.value, selectedPlaybackSpeedStatus.value].filter(
      (part) => part.length > 0,
    );
    return parts.join(" - ");
  });
  const loadedFraction = computed(() =>
    hasDuration.value ? clampNumber(bufferedEnd.value / duration.value, 0, 1) : 0,
  );
  const seekMax = computed(() => Math.max(1, Math.round(duration.value)));
  const displayTime = computed(() => (seeking.value ? seekPosition.value : currentTime.value));
  const seekValueText = computed(() =>
    hasDuration.value
      ? t("movies.player.seekValue", {
          duration: formatMoviePlayerTime(duration.value),
          time: formatMoviePlayerTime(seekPosition.value),
        })
      : formatMoviePlayerTime(seekPosition.value),
  );
  const muteLabel = computed(() =>
    mutedOrSilent.value ? t("movies.player.unmute") : t("movies.player.mute"),
  );
  const fullscreenLabel = computed(() =>
    fullscreen.value ? t("movies.player.fullscreen.exit") : t("movies.player.fullscreen.enter"),
  );
  const pictureInPictureLabel = computed(() =>
    pictureInPicture.value
      ? t("movies.player.pictureInPicture.exit")
      : t("movies.player.pictureInPicture.enter"),
  );
  const nextEpisodeButtonLabel = computed(() => props.nextEpisodeLabel.trim());
  const showNextEpisodeButton = computed(() => nextEpisodeButtonLabel.value.length > 0);
  const posterVisible = computed(
    () => !playing.value && currentTime.value === 0 && props.posterUrl.length > 0,
  );
  const showCenterPlay = computed(() => !playing.value && playbackError.value.length === 0);
  const showSpinner = computed(() => waiting.value && playbackError.value.length === 0);
  const hasPlaybackAdMarkers = computed(
    () => hasDuration.value && playbackAdMarkers.value.length > 0,
  );
  const adMarkersBackground = computed(() =>
    hasDuration.value
      ? moviePlayerAdMarkerTrackBackground(playbackAdMarkers.value, duration.value)
      : "none",
  );
  const controlsStyle = computed<Record<string, string>>(() => ({
    "--movies-player-ad-markers": adMarkersBackground.value,
    "--movies-player-loaded": String(loadedFraction.value),
    "--movies-player-preview-left": `${
      seekPointerPreview.value?.leftPx ?? SEEK_PREVIEW_THUMB_SIZE_PX / 2
    }px`,
    "--movies-player-slider-thumb-size": `${SEEK_PREVIEW_THUMB_SIZE_PX}px`,
  }));
  const seekPointerPreviewText = computed(() =>
    seekPointerPreview.value === null
      ? ""
      : formatMoviePlayerTime(seekPointerPreview.value.seconds),
  );

  let surfaceClickTimer: number | undefined;

  function clearSurfaceClickTimer(): void {
    if (surfaceClickTimer === undefined || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(surfaceClickTimer);
    surfaceClickTimer = undefined;
  }

  function queueSurfacePlaybackToggle(): void {
    clearSurfaceClickTimer();

    if (typeof window === "undefined") {
      togglePlayback();
      return;
    }

    surfaceClickTimer = window.setTimeout(() => {
      surfaceClickTimer = undefined;
      togglePlayback();
    }, SURFACE_CLICK_DELAY_MS);
  }

  function isPrimaryClick(event: MouseEvent): boolean {
    return (
      event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    );
  }

  function isSettingsMenuTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) {
      return false;
    }

    const element = target instanceof Element ? target : target.parentElement;
    return (element?.closest(".movies-hls-player__settings-menu") ?? null) !== null;
  }

  function playerControlsContain(target: EventTarget | null): boolean {
    return (
      target instanceof Node &&
      (controlsRoot.value?.contains(target) === true ||
        topbarControlsRoot.value?.contains(target) === true ||
        backControlsRoot.value?.contains(target) === true ||
        isSettingsMenuTarget(target))
    );
  }

  function playerEventPathContainsControls(event: MouseEvent): boolean {
    return event.composedPath().some((target) => playerControlsContain(target));
  }

  function isSurfaceClickTarget(event: MouseEvent): boolean {
    const target = event.target;
    if (!(target instanceof Node)) {
      return false;
    }

    return !playerControlsContain(target) && !playerEventPathContainsControls(event);
  }

  function onPlayerSurfaceClick(event: MouseEvent): void {
    if (event.defaultPrevented || !isPrimaryClick(event) || !isSurfaceClickTarget(event)) {
      return;
    }

    if (event.detail > 1) {
      clearSurfaceClickTimer();
      return;
    }

    queueSurfacePlaybackToggle();
  }

  function onPlayerSurfaceDoubleClick(event: MouseEvent): void {
    if (event.defaultPrevented || !isPrimaryClick(event) || !isSurfaceClickTarget(event)) {
      return;
    }

    event.preventDefault();
    clearSurfaceClickTimer();
    showControls({ force: true });
    void toggleFullscreen();
  }

  function onCenterPlayClick(event: MouseEvent): void {
    event.stopPropagation();
    if (event.defaultPrevented || !isPrimaryClick(event)) {
      return;
    }

    if (event.detail > 1) {
      clearSurfaceClickTimer();
      return;
    }

    queueSurfacePlaybackToggle();
  }

  function onCenterPlayDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    clearSurfaceClickTimer();
    showControls({ force: true });
    void toggleFullscreen();
  }

  function onControlsFocusOut(event: FocusEvent): void {
    if (!playerControlsContain(event.relatedTarget)) {
      controlsFocused.value = false;
      scheduleAutoHideControls();
    }
  }

  function shouldPreserveHiddenControls(): boolean {
    return controlsHidden.value && playing.value;
  }

  function preserveHiddenControlsForKeyboardSeek(): boolean {
    const preserveHiddenControls = shouldPreserveHiddenControls();
    if (preserveHiddenControls) {
      suppressControlsRevealForKeyboardSeek();
    }
    return preserveHiddenControls;
  }

  function shouldBeginSeekPreviewForKey(key: string): boolean {
    return (
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "Home" ||
      key === "End" ||
      key === "PageUp" ||
      key === "PageDown"
    );
  }

  function onSeekKeydown(event: KeyboardEvent): void {
    onSeekKeydownBase(event, {
      preserveHiddenControls: shouldBeginSeekPreviewForKey(event.key)
        ? preserveHiddenControlsForKeyboardSeek()
        : false,
    });
  }

  function onStageKeydownCapture(event: KeyboardEvent): void {
    const seekDeltaSeconds = keyboardSeekDeltaSeconds(event.key);
    if (
      event.defaultPrevented ||
      hasSystemShortcutModifier(event) ||
      seekDeltaSeconds === null ||
      isTypingTarget(event.target) ||
      !preserveHiddenControlsForKeyboardSeek()
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    seekBy(seekDeltaSeconds, { preserveHiddenControls: true });
  }

  function handleKeyboardShortcut(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || hasSystemShortcutModifier(event)) {
      return false;
    }

    if (event.key === " " || event.key.toLowerCase() === "k") {
      togglePlayback();
      return true;
    }

    const seekDeltaSeconds = keyboardSeekDeltaSeconds(event.key);
    if (seekDeltaSeconds !== null) {
      seekBy(seekDeltaSeconds, {
        preserveHiddenControls: preserveHiddenControlsForKeyboardSeek(),
      });
      return true;
    }

    if (event.key === "ArrowUp") {
      setVolume(volume.value + VOLUME_STEP);
      return true;
    }

    if (event.key === "ArrowDown") {
      setVolume(volume.value - VOLUME_STEP);
      return true;
    }

    if (event.key.toLowerCase() === "m") {
      toggleMute();
      return true;
    }

    if (event.key.toLowerCase() === "f") {
      void toggleFullscreen();
      return true;
    }

    if (event.key === "Escape") {
      if (fallbackFullscreen.value) {
        exitFallbackFullscreen();
        return true;
      }

      cancelSeekPreview();
    }

    return false;
  }

  function handleAppKeydown(event: KeyboardEvent): boolean {
    if (keyboardSeekDeltaSeconds(event.key) !== null) {
      return handleKeyboardShortcut(event);
    }

    return !isTypingTarget(event.target) && !playerControlsContain(event.target)
      ? handleKeyboardShortcut(event)
      : false;
  }

  function onStageKeydown(event: KeyboardEvent): void {
    if (!isTypingTarget(event.target) && handleKeyboardShortcut(event)) {
      event.preventDefault();
    }
  }
  const {
    onLoadedMetadata,
    onProgress,
    onTimeUpdate,
    onVideoCanPlay,
    onVideoEnded,
    onVideoError,
    onVideoPause,
    onVideoPlay,
    onVideoWaiting,
  } = useMoviePlayerMediaEvents({
    applyPlaybackSpeed,
    applySavedPlaybackProgress,
    clearControlsRevealSuppression,
    clearHideControlsTimer,
    clearPlaybackProgress,
    controlsVisible,
    metadataLoaded,
    persistPlaybackProgress,
    playing,
    scheduleAutoHideControls,
    setPlaybackError,
    showControls,
    syncMediaState,
    syncVideoAspectRatio,
    updateBufferedEnd,
    videoElement,
    waiting,
  });

  let previousSourcesRef: MoviePlayInfo["sources"] | null = null;

  onMounted(() => {
    syncFullscreenState();
    syncPictureInPictureState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    videoElement.value?.addEventListener("webkitbeginfullscreen", syncFullscreenState);
    videoElement.value?.addEventListener("webkitendfullscreen", syncFullscreenState);
    videoElement.value?.addEventListener("enterpictureinpicture", syncPictureInPictureState);
    videoElement.value?.addEventListener("leavepictureinpicture", syncPictureInPictureState);
    videoElement.value?.addEventListener(
      "webkitpresentationmodechanged",
      syncPictureInPictureState,
    );
    previousSourcesRef = props.play.sources;
    void attachSource({ autoplay: props.autoplay });
  });

  watch(
    () => activeSource.value?.m3u8Url ?? "",
    () => {
      const sources = props.play.sources;
      const isSourceSwitch = previousSourcesRef !== null && previousSourcesRef === sources;
      previousSourcesRef = sources;
      void attachSource({ autoplay: isSourceSwitch || props.autoplay });
    },
  );

  watch(
    () => props.autoplay,
    (autoplay) => {
      if (autoplay && metadataLoaded.value && !playing.value && currentTime.value === 0) {
        void playVideo();
      }
    },
  );

  watch(
    () => props.playbackSpeed,
    (nextSpeed) => {
      const speed = normalizedPlaybackSpeed(nextSpeed);
      if (playbackSpeed.value === speed) {
        applyPlaybackSpeed(videoElement.value);
        return;
      }

      playbackSpeed.value = speed;
      applyPlaybackSpeed(videoElement.value);
    },
  );

  onBeforeUnmount(() => {
    persistPlaybackProgress({ force: true });
    clearHideControlsTimer();
    clearSurfaceClickTimer();
    destroyHls();
    document.removeEventListener("fullscreenchange", syncFullscreenState);
    document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    videoElement.value?.removeEventListener("webkitbeginfullscreen", syncFullscreenState);
    videoElement.value?.removeEventListener("webkitendfullscreen", syncFullscreenState);
    videoElement.value?.removeEventListener("enterpictureinpicture", syncPictureInPictureState);
    videoElement.value?.removeEventListener("leavepictureinpicture", syncPictureInPictureState);
    videoElement.value?.removeEventListener(
      "webkitpresentationmodechanged",
      syncPictureInPictureState,
    );
  });

  function resetPlaybackState(): void {
    clearPlaybackError();
    resetHlsSourceState();
    resetVideoAspectRatio();
    currentTime.value = 0;
    duration.value = 0;
    bufferedEnd.value = 0;
    playing.value = false;
    waiting.value = false;
    metadataLoaded.value = false;
    seeking.value = false;
    seekPosition.value = 0;
    seekPointerPreview.value = null;
    resetControlsVisibility();
    clearControlsRevealSuppression();
    resetPlaybackProgressState();
  }

  function requestAutoplayOnce(): void {
    void playVideo({ ignoreBlocked: true });
  }

  async function playVideo(options: { ignoreBlocked?: boolean } = {}): Promise<void> {
    const video = videoElement.value;
    if (video === null || playbackError.value.length > 0) {
      return;
    }

    try {
      applyPlaybackSpeed(video);
      await video.play();
      playing.value = true;
      scheduleAutoHideControls();
    } catch {
      if (!options.ignoreBlocked) {
        setPlaybackError("movies.player.error.startFailed");
      }
      playing.value = false;
      controlsVisible.value = true;
    }
  }

  function pauseVideo(): void {
    const video = videoElement.value;
    if (video === null) {
      return;
    }

    video.pause();
    playing.value = false;
    controlsVisible.value = true;
    clearHideControlsTimer();
  }

  function togglePlayback(): void {
    showControls({ force: true });
    if (playing.value) {
      pauseVideo();
    } else {
      void playVideo();
    }
  }

  function clearControlsRevealSuppression(): void {
    suppressControlsRevealUntilMs = 0;
  }

  function suppressControlsRevealForKeyboardSeek(): void {
    suppressControlsRevealUntilMs = Date.now() + KEYBOARD_SEEK_REVEAL_SUPPRESSION_MS;
  }

  function shouldSuppressControlsReveal(): boolean {
    return playing.value && !controlsVisible.value && Date.now() < suppressControlsRevealUntilMs;
  }

  function qualityFallbackLabel(index: number): string {
    return t("movies.player.qualityFallback", { number: index + 1 });
  }

  function setPlaybackError(key: MoviePlaybackErrorKey): void {
    playbackErrorKey.value = key;
  }

  function clearPlaybackError(): void {
    playbackErrorKey.value = "";
  }

  return {
    cancelSeekPreview,
    commitSeek,
    controlsFocused,
    controlsHidden,
    controlsStyle,
    displayTime,
    duration,
    formatTime: formatMoviePlayerTime,
    fullscreen,
    fullscreenLabel,
    handleAppKeydown,
    hasDuration,
    hasPlaybackAdMarkers,
    hasQualityMenu,
    hasSettingsMenu,
    muteLabel,
    muted,
    mutedOrSilent,
    nextEpisodeButtonLabel,
    onCenterPlayClick,
    onCenterPlayDoubleClick,
    onControlsFocusOut,
    onLoadedMetadata,
    onPlayerSurfaceClick,
    onPlayerSurfaceDoubleClick,
    onProgress,
    onSeekKeydown,
    onSeekPointerCancel,
    onSeekPointerDown,
    onSeekPointerLeave,
    onSeekPointerMove,
    onSeekPointerUp,
    onStageKeydown,
    onStageKeydownCapture,
    onTimeUpdate,
    onVideoCanPlay,
    onVideoEnded,
    onVideoError,
    onVideoPause,
    onVideoPlay,
    onVideoWaiting,
    pictureInPicture,
    pictureInPictureLabel,
    pictureInPictureSupported,
    playVideo,
    playbackError,
    playbackSpeedOptions,
    playbackSpeedSelectValue,
    playerShell,
    posterVisible,
    previewSeek,
    qualityOptions,
    qualitySelectValue,
    seekMax,
    seekPointerPreview,
    seekPointerPreviewText,
    seekPosition,
    seekValueText,
    setVolumeFromSlider,
    showCenterPlay,
    showControls,
    showNextEpisodeButton,
    showSpinner,
    sourceStatusText,
    speedLabel,
    syncMediaState,
    syncVideoAspectRatio,
    toggleFullscreen,
    toggleMute,
    togglePictureInPicture,
    volumeSliderValue,
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
