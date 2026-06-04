<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from "vue";

import { AppFrame, useAppChrome } from "@daopk/kit";
import { AppContextInjectionKey, KernelInjectionKey } from "@daopk/sdk";
import type { AppChromeContentSize } from "@daopk/sdk";

import YouTubeEmbed from "./components/YouTubeEmbed.vue";
import YouTubePlayerControls from "./components/YouTubePlayerControls.vue";
import YouTubePosterOverlay from "./components/YouTubePosterOverlay.vue";
import { useAspectFitBox } from "./composables/useAspectFitBox";
import { useAutoHideControls } from "./composables/useAutoHideControls";
import { usePlayerFullscreen } from "./composables/usePlayerFullscreen";
import { useYouTubePlayer } from "./composables/useYouTubePlayer";
import { fitAspectRatioBox } from "./utils/aspectRatio";
import { playerStatusMessage } from "./utils/playerStatus";
import { fetchYouTubeVideoAspectRatio } from "./utils/youtubeOEmbed";
import { videoIdFromLaunchArgs } from "./utils/youtubeVideo";

const PREFERRED_PLAYER_CONTENT_SIZE = { width: 960, height: 540 };

const appContext = inject(AppContextInjectionKey, null);
const kernel = inject(KernelInjectionKey, null);
const playerViewport = ref<HTMLElement | null>(null);
const playerShell = ref<HTMLElement | null>(null);
const playerHost = ref<HTMLIFrameElement | null>(null);
const videoAspectRatio = ref<number | null>(null);
const videoAspectRatioSource = ref<"metadata" | "poster" | null>(null);
const videoId = ref<string | null>(videoIdFromLaunchArgs(appContext?.args));
let videoAspectRatioRequest: AbortController | null = null;

const {
  commitSeek,
  controlsDisabled,
  currentTime,
  duration,
  hasVideo,
  loadedPercent,
  mutedOrSilent,
  notice,
  playerErrorCode,
  playing,
  previewSeek,
  seekPosition,
  seekValueText,
  setPlayerVolume,
  sliderMax,
  toggleMute,
  togglePlayback,
  videoTitle,
  volume,
  volumeValueText,
} = useYouTubePlayer({ videoId, playerHost });
const { fullscreen, toggleFullscreen } = usePlayerFullscreen(playerShell);
const { style: playerStageStyle } = useAspectFitBox(playerViewport, videoAspectRatio);
const { controlsHidden, controlsVisible, setControlsFocused, showControls } = useAutoHideControls({
  playing,
});
const chromeTitle = computed(() => videoTitle.value ?? "YouTube Player");
const posterVisible = computed(() => hasVideo.value && !playing.value);
const statusMessage = computed(() => playerStatusMessage(notice.value, playerErrorCode.value));

const chrome = useAppChrome({ title: chromeTitle });

const stopOpenRequests = kernel?.events.on("youtube-player.open.requested", (payload) => {
  if (payload.handleId !== undefined && payload.handleId !== appContext?.handleId) {
    return;
  }

  const nextVideoId = videoIdFromLaunchArgs(payload);
  if (nextVideoId === null) {
    return;
  }

  if (nextVideoId === videoId.value) {
    return;
  }

  videoId.value = nextVideoId;
});

onUnmounted(() => {
  videoAspectRatioRequest?.abort();
  stopOpenRequests?.();
});

watch(
  videoId,
  (nextVideoId) => {
    videoAspectRatio.value = null;
    videoAspectRatioSource.value = null;
    videoAspectRatioRequest?.abort();
    videoAspectRatioRequest = null;

    if (nextVideoId === null) {
      return;
    }

    const request = new AbortController();
    videoAspectRatioRequest = request;
    void fetchYouTubeVideoAspectRatio(nextVideoId, { signal: request.signal })
      .then((nextAspectRatio) => {
        if (request.signal.aborted || nextAspectRatio === null) {
          return;
        }

        setVideoAspectRatio(nextAspectRatio, "metadata");
      })
      .catch(() => {
        // Poster dimensions are still available as a no-network fallback.
      });
  },
  { immediate: true },
);

watch(videoId, () => {
  chrome.setContentSize(null);
});

function setPlayerHost(host: HTMLIFrameElement | null): void {
  playerHost.value = host;
}

function setVideoAspectRatio(
  nextAspectRatio: number,
  source: "metadata" | "poster" = "poster",
): void {
  if (source === "poster" && videoAspectRatioSource.value === "metadata") {
    return;
  }

  requestAspectRatioWindowSize(nextAspectRatio);
  videoAspectRatio.value = nextAspectRatio;
  videoAspectRatioSource.value = source;
}

function requestAspectRatioWindowSize(nextAspectRatio: number): void {
  const fittedBox = fitAspectRatioBox(PREFERRED_PLAYER_CONTENT_SIZE, nextAspectRatio);
  if (fittedBox === null) {
    return;
  }

  const contentSize: AppChromeContentSize = {
    width: Math.max(1, Math.round(fittedBox.width)),
    height: Math.max(1, Math.round(fittedBox.height)),
  };

  chrome.setContentSize(contentSize);
}
</script>

<template>
  <AppFrame
    class="youtube-player"
    layout="grid"
    :safe-area="false"
    background="default"
    aria-label="YouTube Player"
  >
    <div ref="playerViewport" class="youtube-player__viewport">
      <div
        ref="playerShell"
        class="youtube-player__stage"
        :class="{ 'youtube-player__stage--controls-hidden': controlsHidden }"
        :style="playerStageStyle"
        @pointerdown="showControls"
        @pointermove="showControls"
        @touchstart="showControls"
      >
        <YouTubeEmbed :has-video="hasVideo" :video-id="videoId" @host-change="setPlayerHost" />

        <YouTubePosterOverlay
          v-if="posterVisible"
          :disabled="controlsDisabled"
          :title="videoTitle"
          :video-id="videoId"
          @aspect-ratio-change="setVideoAspectRatio"
          @interaction="showControls"
          @play="togglePlayback"
        />

        <div
          v-if="hasVideo && controlsHidden"
          class="youtube-player__interaction-layer"
          aria-hidden="true"
          @pointerdown="showControls"
          @pointermove="showControls"
          @touchstart="showControls"
        />

        <p v-if="statusMessage" class="youtube-player__status" role="status" aria-live="polite">
          {{ statusMessage }}
        </p>

        <YouTubePlayerControls
          v-if="hasVideo"
          :controls-disabled="controlsDisabled"
          :current-time="currentTime"
          :duration="duration"
          :fullscreen="fullscreen"
          :loaded-percent="loadedPercent"
          :muted-or-silent="mutedOrSilent"
          :playing="playing"
          :seek-position="seekPosition"
          :seek-value-text="seekValueText"
          :slider-max="sliderMax"
          :visible="controlsVisible"
          :volume="volume"
          :volume-value-text="volumeValueText"
          @commit-seek="commitSeek"
          @focus-change="setControlsFocused"
          @interaction="showControls"
          @preview-seek="previewSeek"
          @set-volume="setPlayerVolume"
          @toggle-fullscreen="toggleFullscreen"
          @toggle-mute="toggleMute"
          @toggle-playback="togglePlayback"
        />
      </div>
    </div>
  </AppFrame>
</template>

<style scoped lang="scss">
.youtube-player {
  background:
    linear-gradient(
      color-mix(in srgb, var(--color-bg) 84%, black),
      color-mix(in srgb, var(--color-bg) 84%, black)
    ),
    var(--color-bg);
  min-block-size: 0;
  overflow: hidden;
}

.youtube-player__viewport {
  align-items: center;
  block-size: 100%;
  display: grid;
  inline-size: 100%;
  justify-items: center;
  min-block-size: 0;
  min-inline-size: 0;
  overflow: hidden;
}

.youtube-player__stage {
  aspect-ratio: var(--youtube-player-aspect-ratio, 1.7777777778);
  background: color-mix(in srgb, var(--color-bg) 92%, black);
  block-size: 100%;
  display: grid;
  inline-size: 100%;
  min-block-size: 0;
  overflow: hidden;
  position: relative;
}

.youtube-player__interaction-layer {
  cursor: default;
  inset: 0;
  position: absolute;
  z-index: 1;
}

.youtube-player__status {
  background: color-mix(in srgb, var(--color-bg-elevated) 86%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  font-size: var(--font-size-sm);
  inset-block-start: var(--space-md);
  inset-inline: var(--space-md);
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  position: absolute;
  text-align: center;
  z-index: 2;
}
</style>
