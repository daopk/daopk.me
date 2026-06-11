<script setup lang="ts">
import Hls, { type ErrorData, type ManifestParsedData } from "hls.js";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { IconButton } from "@daopk/kit";
import {
  DropdownMenu,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  Slider,
} from "@daopk/ui";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PictureInPicture,
  PictureInPicture2,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
} from "@daopk/icons";

import {
  createMoviesPlaybackProgressStore,
  isResumableMoviePlaybackTime,
} from "../moviesPlaybackProgress";
import type { MoviesTranslationKey } from "../i18n";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import type { MoviePlayInfo } from "../moviesApi";
import { createMoviesHlsConfig, type HlsPlaybackAdMarker } from "../hls/hlsAdSkip";

interface MovieHlsPlayerProps {
  autoplay?: boolean;
  nextEpisodeLabel?: string;
  play: MoviePlayInfo;
  posterUrl?: string;
  progressKey?: string;
  showBackButton?: boolean;
  title: string;
}

interface QualityOption {
  readonly label: string;
  readonly value: number;
}

interface HlsQualityLevel {
  readonly bitrate: number;
  readonly height: number;
}

type FullscreenMethod = () => Promise<void> | void;
type WebKitPresentationMode = "fullscreen" | "inline" | "picture-in-picture";
type ShowControlsOptions = {
  readonly force?: boolean;
};
type PlaybackErrorKey = Extract<
  MoviesTranslationKey,
  | "movies.player.error.startFailed"
  | "movies.player.error.streamFailed"
  | "movies.player.error.unsupported"
>;

interface WebKitFullscreenDocument extends Document {
  readonly webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: FullscreenMethod;
}

interface WebKitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: FullscreenMethod;
}

interface WebKitVideoElement extends HTMLVideoElement {
  readonly webkitDisplayingFullscreen?: boolean;
  readonly webkitPresentationMode?: WebKitPresentationMode;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitSetPresentationMode?: (mode: WebKitPresentationMode) => void;
  webkitSupportsPresentationMode?: (mode: WebKitPresentationMode) => boolean;
}

interface StandaloneNavigator extends Navigator {
  readonly standalone?: boolean;
}

const AUTO_HIDE_CONTROLS_DELAY_MS = 3200;
const SURFACE_CLICK_DELAY_MS = 220;
const SEEK_PREVIEW_THUMB_SIZE_PX = 16;
const SEEK_STEP_SECONDS = 10;
const VOLUME_STEP = 0.1;
const PLAYBACK_SPEED_OPTIONS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
const PROGRESS_PERSIST_INTERVAL_MS = 5000;
const KEYBOARD_SEEK_REVEAL_SUPPRESSION_MS = 1200;

const props = withDefaults(defineProps<MovieHlsPlayerProps>(), {
  autoplay: false,
  nextEpisodeLabel: "",
  posterUrl: "",
  progressKey: "",
  showBackButton: false,
});

const emit = defineEmits<{
  back: [];
  "next-episode": [];
}>();

const playerShell = ref<HTMLElement | null>(null);
const backControlsRoot = ref<HTMLElement | null>(null);
const controlsRoot = ref<HTMLElement | null>(null);
const progressRoot = ref<HTMLElement | null>(null);
const videoElement = ref<HTMLVideoElement | null>(null);
const selectedSourceIndex = ref(0);
const playbackErrorKey = ref<PlaybackErrorKey | "">("");
const hlsLevels = ref<readonly HlsQualityLevel[]>([]);
const selectedQualityLevel = ref(-1);
const currentLevel = ref(-1);
const currentTime = ref(0);
const duration = ref(0);
const bufferedEnd = ref(0);
const volume = ref(1);
const previousVolume = ref(1);
const muted = ref(false);
const playbackSpeed = ref(1);
const playing = ref(false);
const waiting = ref(false);
const metadataLoaded = ref(false);
const fullscreen = ref(false);
const fallbackFullscreen = ref(false);
const pictureInPicture = ref(false);
const pictureInPictureSupported = ref(false);
const controlsVisible = ref(true);
const controlsFocused = ref(false);
const seeking = ref(false);
const seekPosition = ref(0);
const seekPointerActive = ref(false);
const seekPointerPreview = ref<{ leftPx: number; seconds: number } | null>(null);
const playbackAdMarkers = ref<readonly HlsPlaybackAdMarker[]>([]);

let hls: Hls | null = null;
let hideControlsTimer: number | undefined;
let surfaceClickTimer: number | undefined;
let suppressControlsRevealUntilMs = 0;
let lastProgressPersistedAtMs = 0;
let resumeProgressApplied = false;

const { t } = useMoviesI18n();
const playbackProgressStore = createMoviesPlaybackProgressStore();

const sourceOptions = computed(() =>
  props.play.sources.map((source, index) => ({
    index,
    label: [source.serverName, source.name || source.filename || source.slug]
      .filter((value) => value.length > 0)
      .join(" - "),
  })),
);
const activeSource = computed(
  () => props.play.sources[selectedSourceIndex.value] ?? props.play.sources[0] ?? null,
);
const sourceSelectValue = computed({
  get: () => String(selectedSourceIndex.value),
  set: (nextValue: string) => {
    const nextIndex = Number(nextValue);
    if (Number.isInteger(nextIndex)) {
      selectedSourceIndex.value = nextIndex;
    }
  },
});
const qualityOptions = computed<readonly QualityOption[]>(() => {
  if (hlsLevels.value.length <= 1) {
    return [];
  }

  return hlsLevels.value.map((level, index) => ({
    label: qualityLabel(level, index),
    value: index,
  }));
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
const selectedSourceLabel = computed(
  () =>
    sourceOptions.value.find((source) => source.index === selectedSourceIndex.value)?.label ??
    t("movies.player.source"),
);
const selectedQualityLabel = computed(() => {
  if (!hasQualityMenu.value) {
    return "";
  }

  if (selectedQualityLevel.value === -1) {
    return currentLevel.value >= 0
      ? t("movies.player.autoQuality", {
          quality: qualityLabel(hlsLevels.value[currentLevel.value], currentLevel.value),
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
  const parts = [
    selectedSourceLabel.value,
    selectedQualityLabel.value,
    selectedPlaybackSpeedStatus.value,
  ].filter((part) => part.length > 0);
  return parts.join(" - ");
});
const hasDuration = computed(() => Number.isFinite(duration.value) && duration.value > 0);
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
const volumeSliderValue = computed(() => Math.round(volume.value * 100));
const mutedOrSilent = computed(() => muted.value || volume.value <= 0);
const muteIcon = computed(() => (mutedOrSilent.value ? VolumeX : Volume2));
const muteLabel = computed(() =>
  mutedOrSilent.value ? t("movies.player.unmute") : t("movies.player.mute"),
);
const fullscreenIcon = computed(() => (fullscreen.value ? Minimize2 : Maximize2));
const fullscreenLabel = computed(() =>
  fullscreen.value ? t("movies.player.fullscreen.exit") : t("movies.player.fullscreen.enter"),
);
const pictureInPictureIcon = computed(() =>
  pictureInPicture.value ? PictureInPicture : PictureInPicture2,
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
const controlsHidden = computed(() => !controlsVisible.value && !controlsFocused.value);
const controlsStyle = computed<Record<string, string>>(() => ({
  "--movies-player-ad-markers": adMarkersBackground.value,
  "--movies-player-loaded": String(loadedFraction.value),
  "--movies-player-preview-left": `${seekPointerPreview.value?.leftPx ?? SEEK_PREVIEW_THUMB_SIZE_PX / 2}px`,
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
const playbackError = computed(() =>
  playbackErrorKey.value === "" ? "" : t(playbackErrorKey.value),
);

watch(
  () => props.play.sources,
  (sources) => {
    if (sources.length === 0 || selectedSourceIndex.value >= sources.length) {
      selectedSourceIndex.value = 0;
    }
  },
  { immediate: true },
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
  videoElement.value?.addEventListener("webkitpresentationmodechanged", syncPictureInPictureState);
  void attachSource({ autoplay: props.autoplay });
});

watch(
  () => activeSource.value?.m3u8Url ?? "",
  (_next, previous) => {
    void attachSource({ autoplay: props.autoplay && previous === undefined });
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

onBeforeUnmount(() => {
  persistPlaybackProgress({ force: true });
  clearHideControlsTimer();
  clearSurfaceClickTimer();
  destroyHls();
  playbackProgressStore.dispose();
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

function destroyHls(): void {
  hls?.destroy();
  hls = null;
}

function resetPlaybackState(): void {
  clearPlaybackError();
  hlsLevels.value = [];
  selectedQualityLevel.value = -1;
  currentLevel.value = -1;
  currentTime.value = 0;
  duration.value = 0;
  bufferedEnd.value = 0;
  playing.value = false;
  waiting.value = false;
  metadataLoaded.value = false;
  playbackAdMarkers.value = [];
  seeking.value = false;
  seekPosition.value = 0;
  seekPointerPreview.value = null;
  controlsVisible.value = true;
  suppressControlsRevealUntilMs = 0;
  lastProgressPersistedAtMs = 0;
  resumeProgressApplied = false;
}

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return (
    video.canPlayType("application/vnd.apple.mpegurl").length > 0 ||
    video.canPlayType("application/x-mpegURL").length > 0
  );
}

function loadVideo(video: HTMLVideoElement): void {
  try {
    video.load();
  } catch {
    // Some test/browser environments expose media elements without a usable load implementation.
  }
}

async function attachSource(options: { autoplay: boolean } = { autoplay: false }): Promise<void> {
  await nextTick();

  const video = videoElement.value;
  const source = activeSource.value;
  persistPlaybackProgress({ force: true });
  destroyHls();
  resetPlaybackState();

  if (video === null || source === null) {
    return;
  }

  video.removeAttribute("src");
  video.currentTime = 0;
  applyPlaybackSpeed(video);

  if (Hls.isSupported()) {
    let nextHls: Hls | null = null;
    const instance = new Hls(
      createMoviesHlsConfig({
        onAdMarkers: (markers) => {
          if (hls === nextHls) {
            playbackAdMarkers.value = markers;
          }
        },
      }),
    );
    nextHls = instance;
    hls = instance;
    instance.on(Hls.Events.ERROR, onHlsError);
    instance.on(Hls.Events.MANIFEST_PARSED, onHlsManifestParsed);
    instance.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      currentLevel.value = data.level;
    });
    instance.loadSource(source.m3u8Url);
    instance.attachMedia(video);
    if (options.autoplay) {
      video.addEventListener("loadedmetadata", requestAutoplayOnce, { once: true });
    }
    return;
  }

  if (canPlayNativeHls(video)) {
    video.src = source.m3u8Url;
    if (options.autoplay) {
      video.addEventListener("loadedmetadata", requestAutoplayOnce, { once: true });
    }
    loadVideo(video);
    return;
  }

  setPlaybackError("movies.player.error.unsupported");
}

function onHlsManifestParsed(_event: string, data: ManifestParsedData): void {
  hlsLevels.value = data.levels.map((level) => ({
    bitrate: level.bitrate,
    height: level.height,
  }));
  currentLevel.value = hls?.currentLevel ?? -1;
}

function onHlsError(_event: string, data: ErrorData): void {
  if (data.fatal) {
    setPlaybackError("movies.player.error.streamFailed");
    waiting.value = false;
    destroyHls();
    showControls({ force: true });
  }
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
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
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
  muted.value = video.muted;
  volume.value = clamp(video.volume, 0, 1);
  playbackSpeed.value = normalizedPlaybackSpeed(video.playbackRate);
  updateBufferedEnd();

  if (!seeking.value) {
    seekPosition.value = Math.round(currentTime.value);
  }
}

function normalizedProgressKey(): string | null {
  const key = props.progressKey.trim();
  return key.length === 0 ? null : key;
}

function applySavedPlaybackProgress(): void {
  if (resumeProgressApplied) {
    return;
  }

  resumeProgressApplied = true;

  const key = normalizedProgressKey();
  const video = videoElement.value;
  if (key === null || video === null || !hasDuration.value) {
    return;
  }

  const progress = playbackProgressStore.get(key);
  if (progress === null) {
    return;
  }

  if (!isResumableMoviePlaybackTime(progress.currentTime, duration.value)) {
    playbackProgressStore.clear(key);
    return;
  }

  video.currentTime = progress.currentTime;
  currentTime.value = progress.currentTime;
  seekPosition.value = Math.round(progress.currentTime);
}

function persistPlaybackProgress(options: { force?: boolean } = {}): void {
  const key = normalizedProgressKey();
  const video = videoElement.value;
  if (key === null || video === null || !metadataLoaded.value) {
    return;
  }

  const now = Date.now();
  if (!options.force && now - lastProgressPersistedAtMs < PROGRESS_PERSIST_INTERVAL_MS) {
    return;
  }

  syncMediaState();
  playbackProgressStore.save(key, {
    currentTime: currentTime.value,
    duration: duration.value,
  });
  lastProgressPersistedAtMs = now;
}

function clearPlaybackProgress(): void {
  const key = normalizedProgressKey();
  if (key !== null) {
    playbackProgressStore.clear(key);
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
  syncMediaState();
  applySavedPlaybackProgress();
}

function onTimeUpdate(): void {
  syncMediaState();
  persistPlaybackProgress();
}

function onProgress(): void {
  updateBufferedEnd();
}

function onVideoPlay(): void {
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

function beginSeekPreview(options: { preserveHiddenControls?: boolean } = {}): void {
  if (!hasDuration.value) {
    return;
  }

  const preserveHiddenControls =
    options.preserveHiddenControls === true || shouldPreserveHiddenControls();
  seeking.value = true;
  seekPosition.value = Math.round(currentTime.value);
  if (preserveHiddenControls) {
    clearHideControlsTimer();
    return;
  }
  showControls({ force: true });
}

function previewSeek(nextValue: number): void {
  if (!hasDuration.value) {
    return;
  }

  seeking.value = true;
  seekPosition.value = Math.round(clamp(nextValue, 0, duration.value));
}

function commitSeek(nextValue: number, options: { preserveHiddenControls?: boolean } = {}): void {
  if (!hasDuration.value) {
    seeking.value = false;
    return;
  }

  const video = videoElement.value;
  const nextTime = clamp(nextValue, 0, duration.value);
  if (video !== null) {
    video.currentTime = nextTime;
  }

  currentTime.value = nextTime;
  seekPosition.value = Math.round(nextTime);
  seeking.value = false;
  clearSeekPointerPreview();
  persistPlaybackProgress({ force: true });
  if (options.preserveHiddenControls && playing.value) {
    controlsVisible.value = false;
    clearHideControlsTimer();
    return;
  }
  scheduleAutoHideControls();
}

function cancelSeekPreview(): void {
  seeking.value = false;
  seekPosition.value = Math.round(currentTime.value);
  clearSeekPointerPreview();
}

function seekBy(deltaSeconds: number, options: { preserveHiddenControls?: boolean } = {}): void {
  if (!hasDuration.value) {
    return;
  }

  commitSeek(currentTime.value + deltaSeconds, options);
}

function setVolumeFromSlider(nextValue: number): void {
  setVolume(nextValue / 100);
}

function setVolume(nextVolume: number): void {
  const video = videoElement.value;
  const normalized = clamp(nextVolume, 0, 1);
  volume.value = normalized;
  if (normalized > 0) {
    previousVolume.value = normalized;
    muted.value = false;
  }
  if (video !== null) {
    video.volume = normalized;
    video.muted = normalized === 0 ? true : muted.value;
  }
  if (normalized === 0) {
    muted.value = true;
  }
  showControls({ force: true });
}

function toggleMute(): void {
  const video = videoElement.value;
  const nextMuted = !mutedOrSilent.value;

  if (nextMuted) {
    previousVolume.value = volume.value > 0 ? volume.value : previousVolume.value;
    muted.value = true;
    if (video !== null) {
      video.muted = true;
    }
  } else {
    const restoredVolume = volume.value > 0 ? volume.value : previousVolume.value || 1;
    muted.value = false;
    volume.value = restoredVolume;
    if (video !== null) {
      video.muted = false;
      video.volume = restoredVolume;
    }
  }

  showControls({ force: true });
}

function setQualityLevel(nextLevel: number): void {
  if (nextLevel !== -1 && (nextLevel < 0 || nextLevel >= hlsLevels.value.length)) {
    return;
  }

  selectedQualityLevel.value = nextLevel;
  if (hls !== null) {
    hls.currentLevel = nextLevel;
    if (nextLevel === -1) {
      hls.nextLevel = -1;
    }
  }
  showControls({ force: true });
}

function setPlaybackSpeed(nextSpeed: number): void {
  const speed = normalizedPlaybackSpeed(nextSpeed);
  playbackSpeed.value = speed;
  applyPlaybackSpeed(videoElement.value);
  showControls({ force: true });
}

function applyPlaybackSpeed(video: HTMLVideoElement | null): void {
  if (video !== null) {
    video.playbackRate = playbackSpeed.value;
  }
}

function clearHideControlsTimer(): void {
  if (hideControlsTimer === undefined || typeof window === "undefined") {
    return;
  }

  window.clearTimeout(hideControlsTimer);
  hideControlsTimer = undefined;
}

function canHideControls(): boolean {
  return (
    playing.value &&
    playbackError.value.length === 0 &&
    !controlsFocused.value &&
    !seeking.value &&
    !waiting.value
  );
}

function scheduleAutoHideControls(): void {
  clearHideControlsTimer();
  if (!canHideControls() || typeof window === "undefined") {
    controlsVisible.value = true;
    return;
  }

  hideControlsTimer = window.setTimeout(() => {
    if (canHideControls()) {
      controlsVisible.value = false;
    }
  }, AUTO_HIDE_CONTROLS_DELAY_MS);
}

function showControls(eventOrOptions?: Event | ShowControlsOptions): void {
  const force =
    typeof eventOrOptions === "object" &&
    eventOrOptions !== null &&
    "force" in eventOrOptions &&
    eventOrOptions.force === true;

  if (!force && shouldSuppressControlsReveal()) {
    return;
  }

  controlsVisible.value = true;
  scheduleAutoHideControls();
}

function onControlsFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget;
  if (!playerControlsContain(nextTarget)) {
    controlsFocused.value = false;
    scheduleAutoHideControls();
  }
}

function keyboardSeekDeltaSeconds(key: string): number | null {
  if (key === "ArrowLeft") {
    return -SEEK_STEP_SECONDS;
  }

  if (key === "ArrowRight") {
    return SEEK_STEP_SECONDS;
  }

  return null;
}

function onSeekKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    cancelSeekPreview();
    return;
  }

  if (
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "Home" ||
    event.key === "End" ||
    event.key === "PageUp" ||
    event.key === "PageDown"
  ) {
    beginSeekPreview({ preserveHiddenControls: preserveHiddenControlsForKeyboardSeek() });
  }
}

function pointerPreviewFromEvent(event: PointerEvent): { leftPx: number; seconds: number } | null {
  if (!hasDuration.value) {
    return null;
  }

  const root = progressRoot.value;
  if (root === null) {
    return null;
  }

  const rect = root.getBoundingClientRect();
  if (rect.width <= SEEK_PREVIEW_THUMB_SIZE_PX) {
    return null;
  }

  const trackStartPx = SEEK_PREVIEW_THUMB_SIZE_PX / 2;
  const trackWidthPx = rect.width - SEEK_PREVIEW_THUMB_SIZE_PX;
  const trackEndPx = trackStartPx + trackWidthPx;
  const pointerX = clamp(event.clientX - rect.left, trackStartPx, trackEndPx);
  const fraction = (pointerX - trackStartPx) / trackWidthPx;
  const seconds = Math.round(clamp(fraction, 0, 1) * duration.value);

  return { leftPx: pointerX, seconds };
}

function updateSeekPointerPreview(event: PointerEvent): void {
  seekPointerPreview.value = pointerPreviewFromEvent(event);
}

function clearSeekPointerPreview(): void {
  seekPointerPreview.value = null;
}

function previewSeekFromPointer(event: PointerEvent): void {
  const preview = pointerPreviewFromEvent(event);
  seekPointerPreview.value = preview;
  if (preview !== null) {
    previewSeek(preview.seconds);
  }
}

function onSeekPointerDown(event: PointerEvent): void {
  seekPointerActive.value = true;
  beginSeekPreview();
  previewSeekFromPointer(event);
}

function onSeekPointerMove(event: PointerEvent): void {
  if (seekPointerActive.value) {
    previewSeekFromPointer(event);
    return;
  }

  updateSeekPointerPreview(event);
}

function onSeekPointerLeave(): void {
  if (!seekPointerActive.value) {
    clearSeekPointerPreview();
  }
}

function onSeekPointerUp(event: PointerEvent): void {
  if (!seekPointerActive.value) {
    return;
  }

  seekPointerActive.value = false;
  const preview = pointerPreviewFromEvent(event);
  if (preview === null) {
    cancelSeekPreview();
    return;
  }

  commitSeek(preview.seconds);
}

function onSeekPointerCancel(): void {
  seekPointerActive.value = false;
  cancelSeekPreview();
}

function fullscreenDocument(): WebKitFullscreenDocument | null {
  return typeof document === "undefined" ? null : (document as WebKitFullscreenDocument);
}

function documentFullscreenElement(): Element | null {
  const currentDocument = fullscreenDocument();
  if (currentDocument === null) {
    return null;
  }

  return currentDocument.fullscreenElement ?? currentDocument.webkitFullscreenElement ?? null;
}

function webKitVideoElement(): WebKitVideoElement | null {
  return videoElement.value as WebKitVideoElement | null;
}

function isNativeVideoFullscreen(video: WebKitVideoElement | null = webKitVideoElement()): boolean {
  return Boolean(video?.webkitDisplayingFullscreen);
}

function syncFullscreenState(): void {
  const element = playerShell.value;

  fullscreen.value =
    element !== null &&
    (fallbackFullscreen.value ||
      documentFullscreenElement() === element ||
      isNativeVideoFullscreen(webKitVideoElement()));
}

async function requestDocumentFullscreen(element: HTMLElement): Promise<boolean> {
  const webKitElement = element as WebKitFullscreenElement;

  if (typeof element.requestFullscreen === "function") {
    try {
      await element.requestFullscreen();
      return true;
    } catch {
      // Fall through to Safari's prefixed API or native video fullscreen.
    }
  }

  if (typeof webKitElement.webkitRequestFullscreen === "function") {
    try {
      await webKitElement.webkitRequestFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

async function exitDocumentFullscreen(): Promise<boolean> {
  const currentDocument = fullscreenDocument();
  if (currentDocument === null) {
    return false;
  }

  if (typeof currentDocument.exitFullscreen === "function") {
    try {
      await currentDocument.exitFullscreen();
      return true;
    } catch {
      // Fall through to Safari's prefixed API.
    }
  }

  if (typeof currentDocument.webkitExitFullscreen === "function") {
    try {
      await currentDocument.webkitExitFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function enterNativeVideoFullscreen(video: WebKitVideoElement | null): boolean {
  if (typeof video?.webkitEnterFullscreen !== "function") {
    return false;
  }

  try {
    video.webkitEnterFullscreen();
    return true;
  } catch {
    return false;
  }
}

function exitNativeVideoFullscreen(video: WebKitVideoElement | null): boolean {
  if (typeof video?.webkitExitFullscreen !== "function") {
    return false;
  }

  try {
    video.webkitExitFullscreen();
    return true;
  } catch {
    return false;
  }
}

function enterFallbackFullscreen(): void {
  fallbackFullscreen.value = true;
  fullscreen.value = true;
  showControls({ force: true });
}

function exitFallbackFullscreen(): void {
  fallbackFullscreen.value = false;
  syncFullscreenState();
}

async function toggleFullscreen(): Promise<void> {
  const element = playerShell.value;
  if (element === null || typeof document === "undefined") {
    return;
  }

  const video = webKitVideoElement();

  if (fallbackFullscreen.value) {
    exitFallbackFullscreen();
    return;
  }

  if (documentFullscreenElement() === element) {
    await exitDocumentFullscreen();
    syncFullscreenState();
    return;
  }

  if (isNativeVideoFullscreen(video)) {
    exitNativeVideoFullscreen(video);
    syncFullscreenState();
    return;
  }

  if (!(await requestDocumentFullscreen(element))) {
    const enteredVideoFullscreen = enterNativeVideoFullscreen(video);
    if (!enteredVideoFullscreen) {
      enterFallbackFullscreen();
      return;
    }
  }
  syncFullscreenState();
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

defineExpose({
  handleAppKeydown,
});

function pictureInPictureDocument(): Document | null {
  return typeof document === "undefined" ? null : document;
}

function pictureInPictureVideoElement(): WebKitVideoElement | null {
  return webKitVideoElement();
}

function standaloneNavigator(): StandaloneNavigator | null {
  return typeof navigator === "undefined" ? null : (navigator as StandaloneNavigator);
}

function isStandaloneDisplayMode(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function isAppleTouchPlatform(navigatorLike: Navigator | null): boolean {
  if (navigatorLike === null) {
    return false;
  }

  return (
    /iPad|iPhone|iPod/.test(navigatorLike.userAgent) ||
    (navigatorLike.platform === "MacIntel" && navigatorLike.maxTouchPoints > 1)
  );
}

function isIosStandaloneWebApp(): boolean {
  const navigatorLike = standaloneNavigator();
  return (
    navigatorLike?.standalone === true ||
    (isAppleTouchPlatform(navigatorLike) && isStandaloneDisplayMode())
  );
}

function canUseStandardPictureInPicture(
  video: WebKitVideoElement | null = pictureInPictureVideoElement(),
): boolean {
  const currentDocument = pictureInPictureDocument();
  return Boolean(
    currentDocument?.pictureInPictureEnabled &&
    typeof video?.requestPictureInPicture === "function" &&
    !video.disablePictureInPicture,
  );
}

function canUseWebKitPictureInPicture(
  video: WebKitVideoElement | null = pictureInPictureVideoElement(),
): boolean {
  if (
    video === null ||
    video.disablePictureInPicture ||
    typeof video.webkitSetPresentationMode !== "function" ||
    typeof video.webkitSupportsPresentationMode !== "function"
  ) {
    return false;
  }

  try {
    return video.webkitSupportsPresentationMode("picture-in-picture");
  } catch {
    return false;
  }
}

function canUsePictureInPicture(
  video: WebKitVideoElement | null = pictureInPictureVideoElement(),
): boolean {
  if (isIosStandaloneWebApp()) {
    return false;
  }

  return canUseStandardPictureInPicture(video) || canUseWebKitPictureInPicture(video);
}

function isStandardPictureInPicture(video: WebKitVideoElement | null): boolean {
  const currentDocument = pictureInPictureDocument();
  return video !== null && currentDocument?.pictureInPictureElement === video;
}

function isWebKitPictureInPicture(video: WebKitVideoElement | null): boolean {
  return video?.webkitPresentationMode === "picture-in-picture";
}

function syncPictureInPictureState(): void {
  const video = pictureInPictureVideoElement();
  pictureInPictureSupported.value = canUsePictureInPicture(video);
  pictureInPicture.value = isStandardPictureInPicture(video) || isWebKitPictureInPicture(video);
}

function setWebKitPictureInPicture(video: WebKitVideoElement, enabled: boolean): boolean {
  if (!canUseWebKitPictureInPicture(video)) {
    return false;
  }

  try {
    video.webkitSetPresentationMode?.(enabled ? "picture-in-picture" : "inline");
    return true;
  } catch {
    return false;
  }
}

async function togglePictureInPicture(): Promise<void> {
  const currentDocument = pictureInPictureDocument();
  const video = pictureInPictureVideoElement();
  if (currentDocument === null || video === null || !canUsePictureInPicture(video)) {
    syncPictureInPictureState();
    return;
  }

  try {
    if (isStandardPictureInPicture(video)) {
      await currentDocument.exitPictureInPicture?.();
      syncPictureInPictureState();
      return;
    }

    if (isWebKitPictureInPicture(video)) {
      setWebKitPictureInPicture(video, false);
      syncPictureInPictureState();
      return;
    }

    if (currentDocument.pictureInPictureElement != null) {
      await currentDocument.exitPictureInPicture?.();
    }

    if (canUseStandardPictureInPicture(video)) {
      await video.requestPictureInPicture?.();
    } else {
      setWebKitPictureInPicture(video, true);
    }

    syncPictureInPictureState();
    showControls({ force: true });
  } catch {
    syncPictureInPictureState();
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function safeMediaNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizedPlaybackSpeed(value: number): number {
  return PLAYBACK_SPEED_OPTIONS.includes(value) ? value : 1;
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

function qualityLabel(level: HlsQualityLevel | undefined, index: number): string {
  if (level === undefined) {
    return qualityFallbackLabel(index);
  }

  if (level.height > 0) {
    return `${level.height}p`;
  }

  if (level.bitrate > 0) {
    return `${Math.round(level.bitrate / 1000)} kbps`;
  }

  return qualityFallbackLabel(index);
}

function speedLabel(speed: number): string {
  return `${speed}x`;
}

function sourceFallbackLabel(index: number): string {
  return t("movies.player.sourceFallback", { number: index + 1 });
}

function qualityFallbackLabel(index: number): string {
  return t("movies.player.qualityFallback", { number: index + 1 });
}

function setPlaybackError(key: PlaybackErrorKey): void {
  playbackErrorKey.value = key;
}

function clearPlaybackError(): void {
  playbackErrorKey.value = "";
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
  return `linear-gradient(to right, transparent 0%, transparent ${startPercent.toFixed(3)}%, ${color} ${startPercent.toFixed(3)}%, ${color} ${endPercent.toFixed(3)}%, transparent ${endPercent.toFixed(3)}%, transparent 100%)`;
}
</script>

<template>
  <div class="movies-hls-player">
    <div
      ref="playerShell"
      class="movies-hls-player__stage"
      :class="{
        'movies-hls-player__stage--controls-hidden': controlsHidden,
        'movies-hls-player__stage--fullscreen': fullscreen,
      }"
      tabindex="0"
      :aria-label="t('movies.player.ariaLabel', { title })"
      @keydown.capture="onStageKeydownCapture"
      @keydown="onStageKeydown"
      @click="onPlayerSurfaceClick"
      @dblclick="onPlayerSurfaceDoubleClick"
      @pointerdown="showControls"
      @pointermove="showControls"
      @touchstart="showControls"
    >
      <video
        ref="videoElement"
        class="movies-hls-player__video"
        playsinline
        preload="metadata"
        :poster="posterUrl || undefined"
        :title="title"
        @canplay="onVideoCanPlay"
        @durationchange="syncMediaState"
        @ended="onVideoEnded"
        @error="onVideoError"
        @loadedmetadata="onLoadedMetadata"
        @pause="onVideoPause"
        @play="onVideoPlay"
        @playing="onVideoCanPlay"
        @progress="onProgress"
        @ratechange="syncMediaState"
        @timeupdate="onTimeUpdate"
        @volumechange="syncMediaState"
        @waiting="onVideoWaiting"
      />

      <Transition name="movies-hls-player__poster-fade">
        <div v-if="posterVisible" class="movies-hls-player__poster" aria-hidden="true">
          <img :src="posterUrl" alt="" decoding="async" />
        </div>
      </Transition>

      <div class="movies-hls-player__shade movies-hls-player__shade--top" aria-hidden="true" />
      <div class="movies-hls-player__shade movies-hls-player__shade--bottom" aria-hidden="true" />

      <button
        v-if="showCenterPlay"
        type="button"
        class="movies-hls-player__center-play"
        :aria-label="t('movies.action.play')"
        @click="onCenterPlayClick"
        @dblclick="onCenterPlayDoubleClick"
      >
        <Play aria-hidden="true" />
      </button>

      <div v-if="showSpinner" class="movies-hls-player__spinner" role="status" aria-live="polite">
        <span>{{ t("movies.player.loadingVideo") }}</span>
      </div>

      <p v-if="playbackError" class="movies-hls-player__error" role="alert">
        <AlertCircle aria-hidden="true" />
        <span>{{ playbackError }}</span>
      </p>

      <div
        v-if="!pictureInPicture"
        class="movies-hls-player__topbar"
        :class="{
          'movies-hls-player__topbar--hidden': controlsHidden,
          'movies-hls-player__topbar--with-back': showBackButton,
        }"
      >
        <div
          v-if="showBackButton"
          ref="backControlsRoot"
          class="movies-hls-player__back-action"
          @focusin="
            controlsFocused = true;
            showControls();
          "
          @focusout="onControlsFocusOut"
          @click.stop
          @dblclick.stop
          @pointerdown="showControls"
          @pointermove="showControls"
          @touchstart="showControls"
        >
          <IconButton
            class="movies-hls-player__button movies-hls-player__back-button"
            :icon="ChevronLeft"
            :label="t('movies.action.back')"
            size="sm"
            variant="subtle"
            @click="emit('back')"
          />
        </div>

        <div class="movies-hls-player__topline">
          <span class="movies-hls-player__title">{{ title }}</span>
          <span v-if="sourceStatusText" class="movies-hls-player__source-status">
            {{ sourceStatusText }}
          </span>
        </div>
      </div>

      <div
        ref="controlsRoot"
        class="movies-hls-player__controls"
        :class="{ 'movies-hls-player__controls--hidden': controlsHidden }"
        :style="controlsStyle"
        :aria-label="t('movies.player.controls.ariaLabel')"
        @focusin="
          controlsFocused = true;
          showControls();
        "
        @focusout="onControlsFocusOut"
        @click.stop
        @dblclick.stop
        @pointerdown="showControls"
        @pointermove="showControls"
        @touchstart="showControls"
      >
        <div
          class="movies-hls-player__control-row"
          :class="{ 'movies-hls-player__control-row--has-settings': hasSettingsMenu }"
        >
          <span class="movies-hls-player__time">
            {{ formatTime(displayTime) }}
          </span>

          <div
            ref="progressRoot"
            class="movies-hls-player__progress"
            @pointercancel="onSeekPointerCancel"
            @pointerdown="onSeekPointerDown"
            @pointerleave="onSeekPointerLeave"
            @pointermove="onSeekPointerMove"
            @pointerup="onSeekPointerUp"
          >
            <span
              v-if="hasPlaybackAdMarkers"
              class="movies-hls-player__ad-markers"
              aria-hidden="true"
            />
            <Slider
              class="movies-hls-player__seek"
              :model-value="seekPosition"
              :min="0"
              :max="seekMax"
              :step="1"
              :disabled="!hasDuration || playbackError.length > 0"
              :aria-label="t('movies.player.seek')"
              :aria-valuetext="seekValueText"
              @focusout="cancelSeekPreview"
              @keydown="onSeekKeydown"
              @update:model-value="previewSeek"
              @commit="commitSeek"
            />
            <span
              v-if="seekPointerPreview"
              class="movies-hls-player__seek-preview"
              aria-hidden="true"
            >
              {{ seekPointerPreviewText }}
            </span>
          </div>

          <span class="movies-hls-player__duration">
            {{ hasDuration ? formatTime(duration) : "--:--" }}
          </span>

          <div class="movies-hls-player__volume-control">
            <IconButton
              class="movies-hls-player__button"
              :icon="muteIcon"
              :label="muteLabel"
              size="sm"
              variant="subtle"
              :disabled="playbackError.length > 0"
              @click="toggleMute"
            />

            <div class="movies-hls-player__volume-popover">
              <Slider
                class="movies-hls-player__volume"
                orientation="vertical"
                :model-value="volumeSliderValue"
                :min="0"
                :max="100"
                :step="1"
                :disabled="playbackError.length > 0"
                :aria-label="t('movies.player.volume')"
                :aria-valuetext="`${volumeSliderValue}%`"
                @update:model-value="setVolumeFromSlider"
                @commit="setVolumeFromSlider"
              />
            </div>
          </div>

          <IconButton
            v-if="showNextEpisodeButton"
            class="movies-hls-player__button movies-hls-player__next-episode-button"
            :icon="SkipForward"
            :label="nextEpisodeButtonLabel"
            size="sm"
            variant="subtle"
            @click="emit('next-episode')"
          />

          <IconButton
            v-if="pictureInPictureSupported"
            class="movies-hls-player__button movies-hls-player__pip-button"
            :icon="pictureInPictureIcon"
            :label="pictureInPictureLabel"
            size="sm"
            variant="subtle"
            :disabled="playbackError.length > 0"
            @click="togglePictureInPicture"
          />

          <DropdownMenu
            v-if="hasSettingsMenu"
            align="end"
            content-class="movies-hls-player__settings-menu"
            :portal-to="playerShell ?? 'body'"
          >
            <template #trigger>
              <IconButton
                class="movies-hls-player__button"
                :icon="MoreHorizontal"
                :label="t('movies.player.settings')"
                size="sm"
                variant="subtle"
              />
            </template>
            <template #items>
              <DropdownMenuLabel v-if="sourceOptions.length > 1" class="ds-dropdown-menu__label">
                {{ t("movies.player.source") }}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup v-if="sourceOptions.length > 1" v-model="sourceSelectValue">
                <DropdownMenuRadioItem
                  v-for="source in sourceOptions"
                  :key="source.index"
                  :value="String(source.index)"
                  :text-value="source.label || sourceFallbackLabel(source.index)"
                >
                  <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">
                    <Check aria-hidden="true" />
                  </DropdownMenuItemIndicator>
                  {{ source.label || sourceFallbackLabel(source.index) }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator v-if="sourceOptions.length > 1" />

              <DropdownMenuLabel class="ds-dropdown-menu__label">
                {{ t("movies.player.speed") }}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup v-model="playbackSpeedSelectValue">
                <DropdownMenuRadioItem
                  v-for="speed in PLAYBACK_SPEED_OPTIONS"
                  :key="speed"
                  :value="String(speed)"
                  :text-value="speedLabel(speed)"
                >
                  <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">
                    <Check aria-hidden="true" />
                  </DropdownMenuItemIndicator>
                  {{ speedLabel(speed) }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator v-if="hasQualityMenu" />

              <DropdownMenuLabel v-if="hasQualityMenu" class="ds-dropdown-menu__label">
                {{ t("movies.player.quality") }}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup v-if="hasQualityMenu" v-model="qualitySelectValue">
                <DropdownMenuRadioItem value="-1" :text-value="t('movies.player.auto')">
                  <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">
                    <Check aria-hidden="true" />
                  </DropdownMenuItemIndicator>
                  {{ t("movies.player.auto") }}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  v-for="quality in qualityOptions"
                  :key="quality.value"
                  :value="String(quality.value)"
                  :text-value="quality.label"
                >
                  <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">
                    <Check aria-hidden="true" />
                  </DropdownMenuItemIndicator>
                  {{ quality.label }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </template>
          </DropdownMenu>

          <IconButton
            v-if="!pictureInPicture"
            class="movies-hls-player__button movies-hls-player__fullscreen-button"
            :icon="fullscreenIcon"
            :label="fullscreenLabel"
            size="sm"
            variant="subtle"
            @click="toggleFullscreen"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.movies-hls-player {
  color: var(--color-fg);
  display: grid;
  inline-size: 100%;
  min-inline-size: 0;
}

.movies-hls-player__stage {
  aspect-ratio: 16 / 9;
  background: #08090d;
  border-radius: 0;
  color: #f7f8fb;
  cursor: pointer;
  inline-size: 100%;
  min-block-size: 0;
  min-inline-size: 0;
  overflow: hidden;
  position: relative;
}

.movies-hls-player__stage:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.movies-hls-player__stage--fullscreen {
  aspect-ratio: auto;
  block-size: 100dvh;
  border-radius: 0;
  inline-size: 100vw;
  inset: 0;
  position: fixed;
  z-index: 10000;
}

.movies-hls-player__video,
.movies-hls-player__poster,
.movies-hls-player__poster img {
  block-size: 100%;
  inline-size: 100%;
}

.movies-hls-player__video {
  background: #08090d;
  display: block;
  object-fit: contain;
}

.movies-hls-player__poster {
  background: #08090d;
  border: 0;
  inset: 0;
  padding: 0;
  pointer-events: none;
  position: absolute;
  z-index: 1;
}

.movies-hls-player__poster img {
  display: block;
  object-fit: cover;
}

.movies-hls-player__shade {
  inset-inline: 0;
  pointer-events: none;
  position: absolute;
  z-index: 1;
}

.movies-hls-player__shade--top {
  background: linear-gradient(to bottom, rgb(0 0 0 / 60%), transparent);
  block-size: 32%;
  inset-block-start: 0;
}

.movies-hls-player__shade--bottom {
  background: linear-gradient(to top, rgb(0 0 0 / 74%), transparent);
  block-size: 46%;
  inset-block-end: 0;
}

.movies-hls-player__center-play {
  align-items: center;
  backdrop-filter: blur(18px);
  background: rgb(8 9 13 / 64%);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 8px;
  block-size: 64px;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  inline-size: 64px;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  justify-content: center;
  padding: 0;
  position: absolute;
  transform: translate(-50%, -50%);
  transition:
    background-color var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
  z-index: 3;
}

.movies-hls-player__center-play:hover,
.movies-hls-player__center-play:focus-visible {
  background: rgb(20 22 30 / 78%);
  transform: translate(-50%, -50%) scale(1.04);
}

.movies-hls-player__center-play:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.movies-hls-player__center-play svg {
  block-size: 30px;
  inline-size: 30px;
}

.movies-hls-player__spinner {
  align-items: center;
  background: rgb(8 9 13 / 58%);
  border-radius: 8px;
  display: inline-flex;
  gap: var(--space-sm);
  inset-block-start: 50%;
  inset-inline-start: 50%;
  padding: var(--space-sm) var(--space-md);
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 4;
}

.movies-hls-player__spinner::before {
  animation: movies-hls-player-spin 780ms linear infinite;
  border: 2px solid rgb(255 255 255 / 28%);
  border-block-start-color: #fff;
  border-radius: var(--radius-full);
  block-size: 16px;
  content: "";
  inline-size: 16px;
}

.movies-hls-player__spinner span {
  font-size: var(--font-size-sm);
}

.movies-hls-player__error {
  align-items: center;
  background: rgb(18 20 28 / 86%);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 8px;
  color: #fff;
  display: inline-flex;
  font-size: var(--font-size-sm);
  gap: var(--space-sm);
  inset-block-start: var(--space-md);
  inset-inline: var(--space-md);
  justify-content: center;
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  position: absolute;
  text-align: center;
  z-index: 5;
}

.movies-hls-player__error svg {
  block-size: 16px;
  flex: 0 0 auto;
  inline-size: 16px;
}

.movies-hls-player__topbar {
  align-items: center;
  display: flex;
  gap: var(--space-xs);
  inset-block-start: var(--space-md);
  inset-inline-end: var(--space-md);
  inset-inline-start: var(--space-md);
  min-inline-size: 0;
  opacity: 1;
  pointer-events: none;
  position: absolute;
  transition:
    opacity var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
  z-index: 2;
}

.movies-hls-player__topbar--with-back {
  gap: var(--space-sm);
}

.movies-hls-player__topline {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
  pointer-events: none;
}

.movies-hls-player__back-action {
  flex: 0 0 auto;
  pointer-events: auto;
}

.movies-hls-player__topbar--hidden {
  opacity: 0;
}

.movies-hls-player__topbar--hidden {
  pointer-events: none;
  transform: translateY(calc(var(--space-xs) * -1));
}

.movies-hls-player__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.movies-hls-player__source-status {
  color: rgb(255 255 255 / 72%);
  flex: 0 1 auto;
  font-size: var(--font-size-xs);
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.movies-hls-player__controls {
  cursor: default;
  display: grid;
  inset-block-end: var(--space-md);
  inset-inline: var(--space-md);
  opacity: 1;
  position: absolute;
  transform: translateY(0);
  transition:
    opacity var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
  z-index: 4;
}

.movies-hls-player__controls--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(var(--space-md));
}

.movies-hls-player__progress {
  --movies-player-slider-thumb-size: 16px;

  min-inline-size: 0;
  position: relative;
}

.movies-hls-player__progress::before {
  background: rgb(255 255 255 / 24%);
  block-size: 3px;
  border-radius: var(--radius-full);
  content: "";
  inline-size: calc(100% - var(--movies-player-slider-thumb-size));
  inset-block-start: calc(50% - 1.5px);
  inset-inline-start: calc(var(--movies-player-slider-thumb-size) / 2);
  pointer-events: none;
  position: absolute;
  transform: scaleX(var(--movies-player-loaded, 0));
  transform-origin: left center;
  z-index: 0;
}

.movies-hls-player__ad-markers {
  background: var(--movies-player-ad-markers, none);
  block-size: 3px;
  border-radius: var(--radius-full);
  inline-size: calc(100% - var(--movies-player-slider-thumb-size));
  inset-block-start: calc(50% - 1.5px);
  inset-inline-start: calc(var(--movies-player-slider-thumb-size) / 2);
  pointer-events: none;
  position: absolute;
  z-index: 0;
}

.movies-hls-player__seek {
  --color-accent: #fff;
  --color-bg-subtle: rgb(255 255 255 / 22%);
  --ds-slider-hit-size: 36px;
  --ds-slider-thumb-opacity: 0;

  position: relative;
  z-index: 1;
}

.movies-hls-player__seek:hover,
.movies-hls-player__seek:focus-within,
.movies-hls-player__seek:active {
  --ds-slider-thumb-opacity: 1;
}

.movies-hls-player__seek-preview {
  background: rgb(18 20 28 / 90%);
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  color: #fff;
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  inset-block-end: calc(100% + var(--space-xs));
  inset-inline-start: var(--movies-player-preview-left);
  min-inline-size: 4.5ch;
  padding: 2px var(--space-xs);
  pointer-events: none;
  position: absolute;
  text-align: center;
  transform: translateX(-50%);
  white-space: nowrap;
  z-index: 5;
}

.movies-hls-player__control-row {
  align-items: center;
  display: grid;
  gap: var(--space-xs);
  grid-auto-columns: auto;
  grid-auto-flow: column;
  grid-template-columns: auto minmax(88px, 1fr) auto;
  min-inline-size: 0;
  padding: var(--space-xs) var(--space-md);
}

.movies-hls-player__button {
  color: #fff;
}

.movies-hls-player__time,
.movies-hls-player__duration {
  color: rgb(255 255 255 / 88%);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  min-inline-size: 5ch;
  white-space: nowrap;
}

.movies-hls-player__duration {
  text-align: end;
}

.movies-hls-player__volume-control {
  display: inline-grid;
  position: relative;
}

.movies-hls-player__volume-control::before {
  block-size: calc(var(--space-xs) + var(--space-sm));
  content: "";
  inline-size: 56px;
  inset-block-end: calc(100% - 2px);
  inset-inline-start: 50%;
  position: absolute;
  transform: translateX(-50%);
  z-index: 5;
}

.movies-hls-player__volume-popover {
  align-items: center;
  backdrop-filter: blur(18px);
  background: rgb(8 9 13 / 78%);
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 8px;
  block-size: 136px;
  box-shadow: var(--shadow-md);
  display: flex;
  inline-size: 44px;
  inset-block-end: calc(100% + var(--space-xs));
  inset-inline-start: 50%;
  justify-content: center;
  opacity: 0;
  padding: var(--space-sm) 0;
  pointer-events: none;
  position: absolute;
  transform: translate(-50%, var(--space-xs));
  transition:
    opacity var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease),
    visibility var(--duration-fast) var(--ease);
  visibility: hidden;
  z-index: 6;
}

.movies-hls-player__volume-control:hover .movies-hls-player__volume-popover,
.movies-hls-player__volume-control:focus-within .movies-hls-player__volume-popover {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0);
  visibility: visible;
}

.movies-hls-player__volume {
  --color-accent: #fff;
  --color-bg-subtle: rgb(255 255 255 / 22%);
  --ds-slider-thumb-opacity: 1;

  block-size: 104px;
  inline-size: 20px;
}

:global(.movies-hls-player__settings-menu.ds-dropdown-menu) {
  min-inline-size: 124px;
  padding: var(--space-2xs);
}

:global(.movies-hls-player__settings-menu.ds-dropdown-menu [role="menuitemradio"]) {
  gap: var(--space-xs);
  min-block-size: 34px;
  padding-block: var(--space-xs);
  padding-inline-end: var(--space-sm);
  padding-inline-start: 42px;
}

:global(.movies-hls-player__settings-menu .ds-dropdown-menu__indicator) {
  block-size: 18px;
  inline-size: 18px;
  inset-inline-start: var(--space-sm);
  justify-content: center;
}

:global(.movies-hls-player__settings-menu .ds-dropdown-menu__indicator svg) {
  block-size: 18px;
  inline-size: 18px;
}

:global(.movies-hls-player__settings-menu .ds-dropdown-menu__label) {
  padding: var(--space-xs) var(--space-sm);
}

.movies-hls-player__poster-fade-enter-active,
.movies-hls-player__poster-fade-leave-active {
  transition: opacity var(--duration-fast) var(--ease);
}

.movies-hls-player__poster-fade-enter-from,
.movies-hls-player__poster-fade-leave-to {
  opacity: 0;
}

@keyframes movies-hls-player-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (max-width: 700px) {
  .movies-hls-player__controls {
    inset-block-end: var(--space-sm);
    inset-inline: var(--space-sm);
  }

  .movies-hls-player__topbar {
    inset-block-start: var(--space-sm);
    inset-inline-end: var(--space-sm);
    inset-inline-start: var(--space-sm);
  }

  .movies-hls-player__control-row {
    gap: var(--space-xs);
    grid-template-columns: auto minmax(48px, 1fr) auto;
    min-block-size: 44px;
  }

  .movies-hls-player__button {
    min-block-size: 44px;
    min-inline-size: 44px;
  }

  .movies-hls-player__time,
  .movies-hls-player__duration {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .movies-hls-player__volume-popover {
    block-size: 128px;
  }
}

@media (max-width: 460px) {
  .movies-hls-player__source-status {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .movies-hls-player__center-play,
  .movies-hls-player__controls,
  .movies-hls-player__poster-fade-enter-active,
  .movies-hls-player__poster-fade-leave-active,
  .movies-hls-player__topbar,
  .movies-hls-player__volume-popover {
    transition: none;
  }

  .movies-hls-player__spinner::before {
    animation: none;
  }
}
</style>
