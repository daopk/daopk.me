<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import type { AppChromeContentSize } from "@daopk/sdk";

import YouTubeEmbed from "./YouTubeEmbed.vue";
import YouTubePlayerControls from "./YouTubePlayerControls.vue";
import YouTubePosterOverlay from "./YouTubePosterOverlay.vue";
import { useAspectFitBox } from "../composables/useAspectFitBox";
import { useAutoHideControls } from "../composables/useAutoHideControls";
import { usePlayerFullscreen } from "../composables/usePlayerFullscreen";
import { useYouTubePlayer } from "../composables/useYouTubePlayer";
import { fitAspectRatioBox } from "../utils/aspectRatio";
import { playerStatusMessage } from "../utils/playerStatus";
import { fetchYouTubeVideoAspectRatio } from "../utils/youtubeOEmbed";

const PREFERRED_PLAYER_CONTENT_SIZE = { width: 960, height: 540 };

const props = withDefaults(
  defineProps<{
    readonly autoplayRevision?: number;
    readonly resizeToAspectRatio?: boolean;
    readonly videoId: string | null;
  }>(),
  {
    autoplayRevision: 0,
    resizeToAspectRatio: false,
  },
);

const emit = defineEmits<{
  "content-size-change": [size: AppChromeContentSize | null];
  "title-change": [title: string];
}>();

const playerViewport = ref<HTMLElement | null>(null);
const playerShell = ref<HTMLElement | null>(null);
const playerHost = ref<HTMLIFrameElement | null>(null);
const videoAspectRatio = ref<number | null>(null);
const videoAspectRatioSource = ref<"metadata" | "poster" | null>(null);
const activeVideoId = computed(() => props.videoId);
const activeAutoplayRevision = computed(() => props.autoplayRevision);
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
} = useYouTubePlayer({
  autoplayRevision: activeAutoplayRevision,
  videoId: activeVideoId,
  playerHost,
});
const { fullscreen, toggleFullscreen } = usePlayerFullscreen(playerShell);
const { style: playerStageStyle } = useAspectFitBox(playerViewport, videoAspectRatio);
const { controlsHidden, controlsVisible, setControlsFocused, showControls } = useAutoHideControls({
  playing,
});
const posterVisible = computed(() => hasVideo.value && !playing.value);
const statusMessage = computed(() => playerStatusMessage(notice.value, playerErrorCode.value));
const surfaceTitle = computed(() => videoTitle.value ?? "YouTube Player");

onUnmounted(() => {
  videoAspectRatioRequest?.abort();
});

watch(surfaceTitle, (nextTitle) => emit("title-change", nextTitle), { immediate: true });

watch(
  () => props.videoId,
  (nextVideoId, previousVideoId) => {
    videoAspectRatio.value = null;
    videoAspectRatioSource.value = null;
    videoAspectRatioRequest?.abort();
    videoAspectRatioRequest = null;

    if (previousVideoId !== undefined && nextVideoId !== previousVideoId) {
      emit("content-size-change", null);
    }

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
  if (!props.resizeToAspectRatio) {
    return;
  }

  const fittedBox = fitAspectRatioBox(PREFERRED_PLAYER_CONTENT_SIZE, nextAspectRatio);
  if (fittedBox === null) {
    return;
  }

  emit("content-size-change", {
    width: Math.max(1, Math.round(fittedBox.width)),
    height: Math.max(1, Math.round(fittedBox.height)),
  });
}
</script>

<template>
  <div class="youtube-player__surface">
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
  </div>
</template>

<style scoped lang="scss">
.youtube-player__surface {
  block-size: 100%;
  color: var(--color-fg);
  display: grid;
  inline-size: 100%;
  min-block-size: 0;
  min-inline-size: 0;
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
