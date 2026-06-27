import { computed, onBeforeUnmount, onMounted, ref, toRef, useTemplateRef, watch } from "vue";

import type { HlsPlaybackAdMarker } from "../hls/hlsAdSkip";
import type { MoviesTranslate } from "../i18n/useMoviesI18n";
import type { MoviePlayInfo } from "../moviesApi";
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
  safeMediaNumber,
  useMoviePlaybackState,
} from "./useMoviePlaybackState";
import { useMoviePlayerControls } from "./useMoviePlayerControls";
import { useMoviePlayerFullscreen } from "./useMoviePlayerFullscreen";
import { useMoviePlayerSeek } from "./useMoviePlayerSeek";

export interface MovieHlsPlayerProps {
  autoplay?: boolean;
  nextEpisodeLabel?: string;
  play: MoviePlayInfo;
  playbackSpeed?: number;
  posterUrl?: string;
  progressKey?: string;
  showBackButton?: boolean;
  sourceIndex?: number;
  title: string;
}

export interface MovieHlsPlayerControllerProps extends MovieHlsPlayerProps {
  autoplay: boolean;
  nextEpisodeLabel: string;
  playbackSpeed: number;
  posterUrl: string;
  progressKey: string;
  showBackButton: boolean;
  sourceIndex: number;
}

interface UseMovieHlsPlayerControllerOptions {
  readonly emitPlaybackSpeed: (speed: number) => void;
  readonly props: Readonly<MovieHlsPlayerControllerProps>;
  readonly t: MoviesTranslate;
}

const SURFACE_CLICK_DELAY_MS = 220;
const SEEK_PREVIEW_THUMB_SIZE_PX = 16;
const VOLUME_STEP = 0.1;
const KEYBOARD_SEEK_REVEAL_SUPPRESSION_MS = 1200;
const MAX_ASPECT_RATIO_PRECISION = 6;

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

  let previousSourcesRef: MoviePlayInfo["sources"] | null = null;
  let surfaceClickTimer: number | undefined;
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
    applySavedPlaybackProgress,
    clearPlaybackProgress,
    disposePlaybackProgress,
    persistPlaybackProgress,
    resetPlaybackProgressState,
  } = useMoviePlaybackProgress({
    currentTime,
    duration,
    hasDuration,
    metadataLoaded,
    play: toRef(props, "play"),
    progressKey: toRef(props, "progressKey"),
    seekPosition,
    sourceIndex: toRef(props, "sourceIndex"),
    syncMediaState,
    videoElement,
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
    hasDuration.value ? clamp(bufferedEnd.value / duration.value, 0, 1) : 0,
  );
  const seekMax = computed(() => Math.max(1, Math.round(duration.value)));
  const displayTime = computed(() => (seeking.value ? seekPosition.value : currentTime.value));
  const seekValueText = computed(() =>
    hasDuration.value
      ? t("movies.player.seekValue", {
          duration: formatTime(duration.value),
          time: formatTime(seekPosition.value),
        })
      : formatTime(seekPosition.value),
  );
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
  const controlsStyle = computed<Record<string, string>>(() => ({
    "--movies-player-ad-markers": adMarkersBackground.value,
    "--movies-player-loaded": String(loadedFraction.value),
    "--movies-player-preview-left": `${
      seekPointerPreview.value?.leftPx ?? SEEK_PREVIEW_THUMB_SIZE_PX / 2
    }px`,
    "--movies-player-slider-thumb-size": `${SEEK_PREVIEW_THUMB_SIZE_PX}px`,
  }));
  const hasPlaybackAdMarkers = computed(
    () => hasDuration.value && playbackAdMarkers.value.length > 0,
  );
  const adMarkersBackground = computed(() =>
    hasDuration.value ? adMarkerTrackBackground(playbackAdMarkers.value, duration.value) : "none",
  );
  const seekPointerPreviewText = computed(() =>
    seekPointerPreview.value === null ? "" : formatTime(seekPointerPreview.value.seconds),
  );

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
    disposePlaybackProgress();
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
    suppressControlsRevealUntilMs = 0;
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

    if (playerControlsContain(target) || playerEventPathContainsControls(event)) {
      return false;
    }

    return true;
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

  function syncMediaState(): void {
    const video = videoElement.value;
    if (video === null) {
      return;
    }

    currentTime.value = safeMediaNumber(video.currentTime);
    duration.value = safeMediaNumber(video.duration);
    syncVolumeState(video);
    updateBufferedEnd();

    if (!seeking.value) {
      seekPosition.value = Math.round(currentTime.value);
    }
  }

  function updateBufferedEnd(): void {
    const video = videoElement.value;
    if (video === null) {
      bufferedEnd.value = 0;
      return;
    }

    const buffered = video.buffered;
    if (buffered.length === 0) {
      bufferedEnd.value = 0;
      return;
    }

    bufferedEnd.value = safeMediaNumber(buffered.end(buffered.length - 1));
  }

  function onLoadedMetadata(): void {
    metadataLoaded.value = true;
    applyPlaybackSpeed(videoElement.value);
    syncVideoAspectRatio();
    syncMediaState();
    applySavedPlaybackProgress();
  }

  function syncVideoAspectRatio(): void {
    const stage = playerShell.value;
    const video = videoElement.value;
    if (stage === null || video === null) {
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      resetVideoAspectRatio();
      return;
    }

    stage.style.setProperty("--movies-player-stage-aspect-ratio", `${width} / ${height}`);
    stage.style.setProperty(
      "--movies-player-stage-aspect-ratio-value",
      String(Number((width / height).toFixed(MAX_ASPECT_RATIO_PRECISION))),
    );
  }

  function resetVideoAspectRatio(): void {
    const stage = playerShell.value;
    if (stage === null) {
      return;
    }

    stage.style.removeProperty("--movies-player-stage-aspect-ratio");
    stage.style.removeProperty("--movies-player-stage-aspect-ratio-value");
  }

  function onTimeUpdate(): void {
    syncMediaState();
    persistPlaybackProgress();
  }

  function onProgress(): void {
    updateBufferedEnd();
  }

  function onVideoPlay(): void {
    applyPlaybackSpeed(videoElement.value);
    playing.value = true;
    waiting.value = false;
    scheduleAutoHideControls();
  }

  function onVideoPause(): void {
    playing.value = false;
    waiting.value = false;
    suppressControlsRevealUntilMs = 0;
    controlsVisible.value = true;
    clearHideControlsTimer();
    syncMediaState();
    persistPlaybackProgress({ force: true });
  }

  function onVideoWaiting(): void {
    waiting.value = true;
    showControls();
  }

  function onVideoCanPlay(): void {
    applyPlaybackSpeed(videoElement.value);
    waiting.value = false;
    suppressControlsRevealUntilMs = 0;
    syncMediaState();
  }

  function onVideoEnded(): void {
    playing.value = false;
    waiting.value = false;
    suppressControlsRevealUntilMs = 0;
    controlsVisible.value = true;
    clearHideControlsTimer();
    syncMediaState();
    clearPlaybackProgress();
  }

  function onVideoError(): void {
    setPlaybackError("movies.player.error.streamFailed");
    waiting.value = false;
    suppressControlsRevealUntilMs = 0;
    showControls({ force: true });
  }

  function shouldPreserveHiddenControls(): boolean {
    return controlsHidden.value && playing.value;
  }

  function suppressControlsRevealForKeyboardSeek(): void {
    suppressControlsRevealUntilMs = Date.now() + KEYBOARD_SEEK_REVEAL_SUPPRESSION_MS;
  }

  function shouldSuppressControlsReveal(): boolean {
    return playing.value && !controlsVisible.value && Date.now() < suppressControlsRevealUntilMs;
  }

  function preserveHiddenControlsForKeyboardSeek(): boolean {
    const preserveHiddenControls = shouldPreserveHiddenControls();
    if (preserveHiddenControls) {
      suppressControlsRevealForKeyboardSeek();
    }
    return preserveHiddenControls;
  }

  function onControlsFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;
    if (!playerControlsContain(nextTarget)) {
      controlsFocused.value = false;
      scheduleAutoHideControls();
    }
  }

  function onSeekKeydown(event: KeyboardEvent): void {
    onSeekKeydownBase(event, {
      preserveHiddenControls: shouldBeginSeekPreviewForKey(event.key)
        ? preserveHiddenControlsForKeyboardSeek()
        : false,
    });
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

  function onStageKeydownCapture(event: KeyboardEvent): void {
    const seekDeltaSeconds = keyboardSeekDeltaSeconds(event.key);
    if (
      event.defaultPrevented ||
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

  function handleKeyboardShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === " " || event.key.toLowerCase() === "k") {
      event.preventDefault();
      togglePlayback();
      return;
    }

    const seekDeltaSeconds = keyboardSeekDeltaSeconds(event.key);
    if (seekDeltaSeconds !== null) {
      event.preventDefault();
      seekBy(seekDeltaSeconds, {
        preserveHiddenControls: preserveHiddenControlsForKeyboardSeek(),
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setVolume(volume.value + VOLUME_STEP);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setVolume(volume.value - VOLUME_STEP);
      return;
    }

    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      toggleMute();
      return;
    }

    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen();
      return;
    }

    if (event.key === "Escape") {
      if (fallbackFullscreen.value) {
        event.preventDefault();
        exitFallbackFullscreen();
        return;
      }

      cancelSeekPreview();
    }
  }

  function handleAppKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target) || playerControlsContain(event.target)) {
      return;
    }

    handleKeyboardShortcut(event);
  }

  function onStageKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) {
      return;
    }

    handleKeyboardShortcut(event);
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
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
    formatTime,
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatTime(totalSeconds: number): string {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function adMarkerTrackBackground(
  markers: readonly HlsPlaybackAdMarker[],
  totalDurationSeconds: number,
): string {
  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) {
    return "none";
  }

  const layers = markers
    .map((marker) => adMarkerGradientLayer(marker, totalDurationSeconds))
    .filter((layer) => layer.length > 0);
  return layers.length === 0 ? "none" : layers.join(", ");
}

function adMarkerGradientLayer(marker: HlsPlaybackAdMarker, totalDurationSeconds: number): string {
  const startPercent = clamp((marker.startSeconds / totalDurationSeconds) * 100, 0, 100);
  const rawDurationPercent = (marker.durationSeconds / totalDurationSeconds) * 100;
  const markerWidthPercent =
    marker.kind === "skipped-replacement" ? 0.42 : Math.max(rawDurationPercent, 0.42);
  const endPercent = clamp(startPercent + markerWidthPercent, startPercent, 100);
  if (endPercent <= startPercent) {
    return "";
  }

  const color =
    marker.kind === "skipped-replacement" ? "rgb(255 96 96 / 90%)" : "rgb(255 190 84 / 76%)";
  return `linear-gradient(to right, transparent 0%, transparent ${startPercent.toFixed(
    3,
  )}%, ${color} ${startPercent.toFixed(3)}%, ${color} ${endPercent.toFixed(
    3,
  )}%, transparent ${endPercent.toFixed(3)}%, transparent 100%)`;
}
