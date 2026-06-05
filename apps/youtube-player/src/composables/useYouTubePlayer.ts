import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";

import {
  loadYouTubeIframeApi,
  YOUTUBE_PLAYER_STATES,
  type YouTubePlayer,
  type YouTubePlayerErrorEvent,
  type YouTubePlayerEvent,
  type YouTubePlayerState,
  type YouTubePlayerStateChangeEvent,
} from "../youtubeIframeApi";
import {
  cleanVideoTitle,
  clampFraction,
  clampNumber,
  clampVolume,
  formatTime,
  safeNumber,
} from "../utils/playerValues";
import type { PlayerNotice } from "../utils/playerStatus";

const POLL_INTERVAL_MS = 500;

export interface UseYouTubePlayerOptions {
  readonly autoplayRevision?: Readonly<Ref<number>>;
  readonly videoId: Readonly<Ref<string | null>>;
  readonly playerHost: Ref<HTMLIFrameElement | null>;
}

export function useYouTubePlayer(options: UseYouTubePlayerOptions) {
  const ready = ref(false);
  const playerState = ref<YouTubePlayerState>(YOUTUBE_PLAYER_STATES.unstarted);
  const currentTime = ref(0);
  const duration = ref(0);
  const loadedFraction = ref(0);
  const seekPosition = ref(0);
  const volume = ref(100);
  const muted = ref(false);
  const notice = ref<PlayerNotice | null>(null);
  const playerErrorCode = ref<number | null>(null);
  const videoTitle = ref<string | null>(null);

  let player: YouTubePlayer | null = null;
  let pollInterval: number | undefined;
  let initRun = 0;
  let lastAutoplayRevision = 0;

  const autoplayRevision = computed(() => options.autoplayRevision?.value ?? 0);
  const hasVideo = computed(() => options.videoId.value !== null);
  const playing = computed(
    () =>
      playerState.value === YOUTUBE_PLAYER_STATES.playing ||
      playerState.value === YOUTUBE_PLAYER_STATES.buffering,
  );
  const controlsDisabled = computed(() => !ready.value);
  const mutedOrSilent = computed(() => muted.value || volume.value <= 0);
  const sliderMax = computed(() => Math.max(1, Math.ceil(duration.value)));
  const loadedPercent = computed(() => `${Math.round(loadedFraction.value * 100)}%`);
  const seekValueText = computed(
    () => `${formatTime(seekPosition.value)} of ${formatTime(duration.value)}`,
  );
  const volumeValueText = computed(() => `${volume.value}% volume`);

  const stopPlayerWatch = watch(
    [options.videoId, options.playerHost],
    ([nextVideoId, nextHost]) => {
      if (nextVideoId === null) {
        destroyPlayer();
        return;
      }

      if (nextHost === null) {
        return;
      }

      void initializePlayer(nextVideoId);
    },
    { immediate: true, flush: "post" },
  );

  const stopAutoplayWatch = watch(
    [ready, autoplayRevision],
    () => {
      maybeAutoplay();
    },
    { immediate: true, flush: "post" },
  );

  onBeforeUnmount(() => {
    initRun += 1;
    stopPlayerWatch();
    stopAutoplayWatch();
    destroyPlayer();
  });

  function resetPlayerState(): void {
    ready.value = false;
    playerState.value = YOUTUBE_PLAYER_STATES.unstarted;
    currentTime.value = 0;
    duration.value = 0;
    loadedFraction.value = 0;
    seekPosition.value = 0;
    volume.value = 100;
    muted.value = false;
    notice.value = null;
    playerErrorCode.value = null;
    videoTitle.value = null;
  }

  function clearPollInterval(): void {
    if (pollInterval === undefined || typeof window === "undefined") {
      return;
    }

    window.clearInterval(pollInterval);
    pollInterval = undefined;
  }

  function destroyPlayer(): void {
    clearPollInterval();
    try {
      player?.destroy();
    } catch {
      // YouTube can throw while tearing down an iframe that is already detached.
    }
    player = null;
    resetPlayerState();
  }

  async function initializePlayer(nextVideoId: string | null): Promise<void> {
    const run = ++initRun;
    destroyPlayer();

    if (nextVideoId === null) {
      return;
    }

    await nextTick();

    try {
      const api = await loadYouTubeIframeApi();
      if (run !== initRun) {
        return;
      }

      const host = options.playerHost.value;
      if (host === null) {
        return;
      }

      player = new api.Player(host, {
        events: {
          onAutoplayBlocked,
          onError,
          onReady,
          onStateChange,
        },
      });
    } catch {
      if (run === initRun) {
        notice.value = "api-error";
      }
    }
  }

  function onReady(event: YouTubePlayerEvent): void {
    player = event.target;
    ready.value = true;
    notice.value = null;
    syncVideoTitle();
    syncSnapshot();
    startPolling();
    maybeAutoplay();
  }

  function onStateChange(event: YouTubePlayerStateChangeEvent): void {
    playerState.value = event.data;

    if (event.data === YOUTUBE_PLAYER_STATES.playing) {
      notice.value = null;
    }

    syncVideoTitle();
    syncSnapshot();
  }

  function onError(event: YouTubePlayerErrorEvent): void {
    playerErrorCode.value = event.data;
    notice.value = "player-error";
    syncSnapshot();
  }

  function onAutoplayBlocked(): void {
    notice.value = "autoplay-blocked";
  }

  function startPolling(): void {
    clearPollInterval();
    syncSnapshot();
    if (typeof window !== "undefined") {
      pollInterval = window.setInterval(syncSnapshot, POLL_INTERVAL_MS);
    }
  }

  function syncSnapshot(): void {
    if (player === null || !ready.value) {
      return;
    }

    syncVideoTitle();

    const nextCurrentTime = safeNumber(player.getCurrentTime());
    const nextDuration = safeNumber(player.getDuration());
    currentTime.value = Math.min(nextCurrentTime, nextDuration || nextCurrentTime);
    duration.value = nextDuration;
    loadedFraction.value = clampFraction(player.getVideoLoadedFraction());
    volume.value = clampVolume(player.getVolume());
    muted.value = player.isMuted();
    seekPosition.value = currentTime.value;
  }

  function syncVideoTitle(): void {
    if (player === null) {
      return;
    }

    videoTitle.value = cleanVideoTitle(player.getVideoData().title);
  }

  function togglePlayback(): void {
    if (player === null || !ready.value) {
      return;
    }

    if (playing.value) {
      player.pauseVideo();
    } else {
      notice.value = null;
      player.playVideo();
    }

    syncSnapshot();
  }

  function maybeAutoplay(): void {
    if (player === null || !ready.value) {
      return;
    }

    const revision = autoplayRevision.value;
    if (revision <= 0 || revision === lastAutoplayRevision) {
      return;
    }

    lastAutoplayRevision = revision;
    notice.value = null;
    player.playVideo();
    syncSnapshot();
  }

  function previewSeek(next: number): void {
    seekPosition.value = clampNumber(next, 0, sliderMax.value);
  }

  function commitSeek(next: number): void {
    if (player === null || !ready.value || duration.value <= 0) {
      return;
    }

    const seconds = clampNumber(next, 0, duration.value);
    seekPosition.value = seconds;
    currentTime.value = seconds;
    player.seekTo(seconds, true);
    syncSnapshot();
  }

  function setPlayerVolume(next: number): void {
    if (player === null || !ready.value) {
      return;
    }

    const nextVolume = clampVolume(next);
    volume.value = nextVolume;
    player.setVolume(nextVolume);

    if (nextVolume > 0) {
      player.unMute();
      muted.value = false;
    } else {
      player.mute();
      muted.value = true;
    }
  }

  function toggleMute(): void {
    if (player === null || !ready.value) {
      return;
    }

    if (mutedOrSilent.value) {
      const nextVolume = volume.value > 0 ? volume.value : 100;
      player.setVolume(nextVolume);
      player.unMute();
      volume.value = nextVolume;
      muted.value = false;
    } else {
      player.mute();
      muted.value = true;
    }
  }

  return {
    controlsDisabled,
    currentTime,
    duration,
    hasVideo,
    loadedFraction,
    loadedPercent,
    muted,
    mutedOrSilent,
    notice,
    playerErrorCode,
    playing,
    ready,
    seekPosition,
    seekValueText,
    setPlayerVolume,
    sliderMax,
    toggleMute,
    togglePlayback,
    videoTitle,
    volume,
    volumeValueText,
    previewSeek,
    commitSeek,
  };
}
