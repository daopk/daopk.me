import { computed, ref, toRef, useTemplateRef } from "vue";

import type { MoviesTranslate } from "../i18n/useMoviesI18n";
import type { MoviePlayInfo } from "../moviesApi";
import { useMovieHlsSource, type MoviePlaybackErrorKey } from "./useMovieHlsSource";
import { useMoviePictureInPicture } from "./useMoviePictureInPicture";
import { useMoviePlaybackProgress } from "./useMoviePlaybackProgress";
import {
  MOVIE_PLAYBACK_SPEED_OPTIONS as PLAYBACK_SPEED_OPTIONS,
  moviePlaybackSpeedLabel as speedLabel,
  useMoviePlaybackState,
} from "./useMoviePlaybackState";
import { useMoviePlayerControls } from "./useMoviePlayerControls";
import { useMoviePlayerFullscreen } from "./useMoviePlayerFullscreen";
import { useMoviePlayerKeyboardShortcuts } from "./useMoviePlayerKeyboardShortcuts";
import { useMoviePlayerLifecycle } from "./useMoviePlayerLifecycle";
import { useMoviePlayerMediaEvents } from "./useMoviePlayerMediaEvents";
import { useMoviePlayerMediaState } from "./useMoviePlayerMediaState";
import { useMoviePlayerSeek } from "./useMoviePlayerSeek";
import { useMoviePlayerSurface } from "./useMoviePlayerSurface";
import { useMoviePlayerViewState } from "./useMoviePlayerViewState";

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

const SEEK_PREVIEW_THUMB_SIZE_PX = 16;
const KEYBOARD_SEEK_REVEAL_SUPPRESSION_MS = 1200;

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
  const {
    controlsStyle,
    displayTime,
    formatTime,
    fullscreenLabel,
    hasPlaybackAdMarkers,
    hasQualityMenu,
    hasSettingsMenu,
    muteLabel,
    nextEpisodeButtonLabel,
    pictureInPictureLabel,
    posterVisible,
    seekMax,
    seekPointerPreviewText,
    seekValueText,
    showCenterPlay,
    showNextEpisodeButton,
    showSpinner,
    sourceStatusText,
  } = useMoviePlayerViewState({
    bufferedEnd,
    currentLevel,
    currentTime,
    duration,
    fullscreen,
    hasDuration,
    hlsLevels,
    mutedOrSilent,
    pictureInPicture,
    playbackAdMarkers,
    playbackError,
    playbackSpeed,
    playing,
    props,
    qualityFallbackLabel,
    qualityOptions,
    seeking,
    seekPointerPreview,
    seekPosition,
    selectedQualityLevel,
    seekPreviewThumbSizePx: SEEK_PREVIEW_THUMB_SIZE_PX,
    t,
    waiting,
  });
  const {
    clearSurfaceClickTimer,
    onCenterPlayClick,
    onCenterPlayDoubleClick,
    onControlsFocusOut,
    onPlayerSurfaceClick,
    onPlayerSurfaceDoubleClick,
    playerControlsContain,
  } = useMoviePlayerSurface({
    backControlsRoot,
    controlsFocused,
    controlsRoot,
    scheduleAutoHideControls,
    showControls,
    toggleFullscreen,
    togglePlayback,
    topbarControlsRoot,
  });
  const { handleAppKeydown, onSeekKeydown, onStageKeydown, onStageKeydownCapture } =
    useMoviePlayerKeyboardShortcuts({
      cancelSeekPreview,
      controlsHidden,
      exitFallbackFullscreen,
      fallbackFullscreen,
      keyboardSeekDeltaSeconds,
      onSeekKeydownBase,
      playerControlsContain,
      playing,
      seekBy,
      setVolume,
      suppressControlsRevealForKeyboardSeek,
      toggleFullscreen,
      toggleMute,
      togglePlayback,
      volume,
    });
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

  useMoviePlayerLifecycle({
    activeSource,
    applyPlaybackSpeed,
    attachSource,
    clearHideControlsTimer,
    clearSurfaceClickTimer,
    currentTime,
    destroyHls,
    disposePlaybackProgress,
    metadataLoaded,
    persistPlaybackProgress,
    playVideo,
    playbackSpeed,
    playing,
    props,
    syncFullscreenState,
    syncPictureInPictureState,
    videoElement,
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
