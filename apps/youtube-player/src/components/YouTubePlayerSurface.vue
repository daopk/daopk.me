<script setup vapor lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { EmptyState, TextInput } from "@daopk/kit";
import { Play } from "@daopk/icons";
import type { AppChromeContentSize } from "@daopk/sdk";
import { Button } from "@daopk/ui";

import YouTubeEmbed from "./YouTubeEmbed.vue";
import YouTubePlayerControls from "./YouTubePlayerControls.vue";
import YouTubePosterOverlay from "./YouTubePosterOverlay.vue";
import { useAspectFitBox } from "../composables/useAspectFitBox";
import { useAutoHideControls } from "../composables/useAutoHideControls";
import { usePlayerFullscreen } from "../composables/usePlayerFullscreen";
import { useYouTubePlayer } from "../composables/useYouTubePlayer";
import {
  fitAspectRatioBox,
  type AspectRatioFit,
  type AspectRatioOverscan,
} from "../utils/aspectRatio";
import { playerStatusMessage } from "../utils/playerStatus";
import { fetchYouTubeVideoAspectRatio } from "../utils/youtubeOEmbed";
import { videoIdFromUserInput } from "../utils/youtubeVideo";

const PREFERRED_PLAYER_CONTENT_SIZE = { width: 960, height: 540 };

const props = withDefaults(
  defineProps<{
    readonly autoplayRevision?: number;
    readonly controlsEnabled?: boolean;
    readonly fit?: AspectRatioFit;
    readonly muted?: boolean;
    readonly overscan?: AspectRatioOverscan;
    readonly privacyEnhanced?: boolean;
    readonly resizeToAspectRatio?: boolean;
    readonly videoId: string | null;
  }>(),
  {
    autoplayRevision: 0,
    controlsEnabled: true,
    fit: "contain",
    muted: false,
    overscan: 1,
    privacyEnhanced: false,
    resizeToAspectRatio: false,
  },
);

const emit = defineEmits<{
  "aspect-ratio-change": [aspectRatio: number | null];
  "content-size-change": [size: AppChromeContentSize | null];
  ended: [];
  playing: [];
  "title-change": [title: string];
  "video-request": [videoId: string];
}>();

const manualVideoInput = ref("");
const manualVideoInputInvalid = ref(false);
const playerViewport = ref<HTMLElement | null>(null);
const playerShell = ref<HTMLElement | null>(null);
const playerHost = ref<HTMLIFrameElement | null>(null);
const videoAspectRatio = ref<number | null>(null);
const videoAspectRatioSource = ref<"metadata" | "poster" | null>(null);
const activeVideoId = computed(() => props.videoId);
const activeAutoplayRevision = computed(() => props.autoplayRevision);
const activeMuted = computed(() => props.muted);
let videoAspectRatioRequest: AbortController | null = null;

const {
  beginSeekPreview,
  cancelSeekPreview,
  commitSeek,
  controlsDisabled,
  currentTime,
  duration,
  ended,
  hasVideo,
  loadedFraction,
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
  videoPlaying,
  videoTitle,
  volume,
  volumeValueText,
} = useYouTubePlayer({
  autoplayRevision: activeAutoplayRevision,
  muted: activeMuted,
  videoId: activeVideoId,
  playerHost,
});
const { fullscreen, toggleFullscreen } = usePlayerFullscreen(playerShell);
const fitMode = computed(() => props.fit);
const overscan = computed(() => props.overscan);
const { style: playerStageStyle } = useAspectFitBox(
  playerViewport,
  videoAspectRatio,
  fitMode,
  overscan,
);
const { controlsHidden, controlsVisible, setControlsFocused, showControls } = useAutoHideControls({
  playing,
});
const posterVisible = computed(() => props.controlsEnabled && hasVideo.value && !playing.value);
const statusMessage = computed(() =>
  playerStatusMessage(notice.value, playerErrorCode.value, {
    canStartPlayback: props.controlsEnabled,
  }),
);
const surfaceTitle = computed(() => videoTitle.value ?? "YouTube Player");

onUnmounted(() => {
  videoAspectRatioRequest?.abort();
});

watch(surfaceTitle, (nextTitle) => emit("title-change", nextTitle), { immediate: true });

watch(ended, (nextEnded) => {
  if (nextEnded) {
    emit("ended");
  }
});

watch(videoPlaying, (nextPlaying) => {
  if (nextPlaying) {
    emit("playing");
  }
});

watch(
  () => props.videoId,
  (nextVideoId, previousVideoId) => {
    videoAspectRatio.value = null;
    videoAspectRatioSource.value = null;
    videoAspectRatioRequest?.abort();
    videoAspectRatioRequest = null;
    emit("aspect-ratio-change", null);

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
  emit("aspect-ratio-change", nextAspectRatio);
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

function clearManualVideoInputError(): void {
  manualVideoInputInvalid.value = false;
}

function submitManualVideo(): void {
  const nextVideoId = videoIdFromUserInput(manualVideoInput.value);
  if (nextVideoId === null) {
    manualVideoInputInvalid.value = true;
    return;
  }

  manualVideoInput.value = "";
  manualVideoInputInvalid.value = false;
  emit("video-request", nextVideoId);
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
        @pointerdown="props.controlsEnabled && showControls()"
        @pointermove="props.controlsEnabled && showControls()"
        @touchstart="props.controlsEnabled && showControls()"
      >
        <YouTubeEmbed
          :has-video="hasVideo"
          :interactive="props.controlsEnabled"
          :muted="props.muted"
          :privacy-enhanced="privacyEnhanced"
          :video-id="videoId"
          @host-change="setPlayerHost"
        />

        <EmptyState v-if="!hasVideo" class="youtube-player__empty" role="presentation">
          <form
            class="youtube-player__open-form"
            aria-label="Open YouTube video"
            @submit.prevent="submitManualVideo"
          >
            <label class="youtube-player__input-label" for="youtube-player-video-input">
              YouTube URL or video ID
            </label>
            <div
              class="youtube-player__open-group"
              :class="{ 'youtube-player__open-group--invalid': manualVideoInputInvalid }"
            >
              <TextInput
                id="youtube-player-video-input"
                v-model="manualVideoInput"
                class="youtube-player__open-input"
                type="text"
                variant="plain"
                autocomplete="url"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                inputmode="url"
                placeholder="YouTube URL or video ID"
                :invalid="manualVideoInputInvalid"
                @update:model-value="clearManualVideoInputError"
              />
              <Button
                class="youtube-player__open-button"
                type="submit"
                size="sm"
                variant="primary"
                :icon-start="Play"
                :disabled="manualVideoInput.trim().length === 0"
              >
                Play
              </Button>
            </div>
            <p v-if="manualVideoInputInvalid" class="youtube-player__input-error" role="alert">
              Enter a valid YouTube URL or video ID.
            </p>
          </form>
        </EmptyState>

        <Transition name="youtube-player__poster-fade">
          <YouTubePosterOverlay
            v-if="posterVisible"
            :disabled="controlsDisabled"
            :title="videoTitle"
            :video-id="videoId"
            @aspect-ratio-change="setVideoAspectRatio"
            @interaction="showControls"
            @play="togglePlayback"
          />
        </Transition>

        <div
          v-if="props.controlsEnabled && hasVideo && controlsHidden"
          class="youtube-player__interaction-layer"
          aria-hidden="true"
          @pointerdown="showControls"
          @pointermove="showControls"
          @touchstart="showControls"
        />
        <div
          v-else-if="!props.controlsEnabled && hasVideo"
          class="youtube-player__preview-shield"
          aria-hidden="true"
        />

        <p v-if="statusMessage" class="youtube-player__status" role="status" aria-live="polite">
          {{ statusMessage }}
        </p>

        <YouTubePlayerControls
          v-if="props.controlsEnabled && hasVideo"
          :controls-disabled="controlsDisabled"
          :current-time="currentTime"
          :duration="duration"
          :fullscreen="fullscreen"
          :loaded-fraction="loadedFraction"
          :muted-or-silent="mutedOrSilent"
          :playing="playing"
          :seek-position="seekPosition"
          :seek-value-text="seekValueText"
          :slider-max="sliderMax"
          :visible="controlsVisible"
          :volume="volume"
          :volume-value-text="volumeValueText"
          @begin-seek="beginSeekPreview"
          @cancel-seek="cancelSeekPreview"
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
  position: relative;
}

.youtube-player__stage {
  aspect-ratio: var(--youtube-player-aspect-ratio, 1.7777777778);
  background: color-mix(in srgb, var(--color-bg) 92%, black);
  block-size: 100%;
  display: grid;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  inline-size: 100%;
  min-block-size: 0;
  overflow: hidden;
  position: absolute;
  transform: translate(-50%, -50%);
}

.youtube-player__interaction-layer {
  cursor: default;
  inset: 0;
  position: absolute;
  z-index: 1;
}

.youtube-player__preview-shield {
  cursor: default;
  inset: 0;
  position: absolute;
  z-index: 3;
}

.youtube-player__empty {
  align-self: stretch;
  justify-self: stretch;
}

.youtube-player__open-form {
  display: grid;
  gap: var(--space-xs);
  inline-size: min(100%, 34rem);
}

.youtube-player__open-group {
  align-items: center;
  background:
    linear-gradient(
      color-mix(in srgb, var(--color-bg-elevated) 78%, transparent),
      color-mix(in srgb, var(--color-bg-elevated) 78%, transparent)
    ),
    color-mix(in srgb, var(--color-bg) 88%, black);
  border: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  border-radius: var(--radius-md);
  box-shadow:
    0 16px 48px color-mix(in srgb, black 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 8%, transparent);
  display: grid;
  gap: var(--space-xs);
  grid-template-columns: minmax(0, 1fr) auto;
  min-block-size: 52px;
  padding: var(--space-2xs);
  transition:
    border-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);
}

.youtube-player__open-group:focus-within {
  border-color: color-mix(in srgb, var(--color-accent) 80%, var(--color-border));
  box-shadow:
    0 18px 54px color-mix(in srgb, black 20%, transparent),
    0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 10%, transparent);
}

.youtube-player__open-group--invalid {
  border-color: color-mix(in srgb, var(--color-error-soft) 82%, var(--color-border));
}

.youtube-player__input-label {
  block-size: 1px;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
}

.youtube-player__open-input {
  color: var(--color-fg);
  min-inline-size: 0;
  padding-inline: var(--space-md) var(--space-sm);
}

.youtube-player__open-input:focus-visible {
  outline: none;
}

.youtube-player__open-button {
  border-radius: var(--radius-sm);
  min-block-size: 40px;
  min-inline-size: 5.5rem;
  white-space: nowrap;
}

.youtube-player__input-error {
  color: var(--color-error-soft);
  font-size: var(--font-size-sm);
  grid-column: 1 / -1;
  line-height: var(--leading-normal);
  margin: 0;
}

:deep(.youtube-player__poster-fade-enter-active),
:deep(.youtube-player__poster-fade-leave-active) {
  transition:
    opacity 180ms var(--ease),
    transform 240ms var(--ease);
}

:deep(.youtube-player__poster-fade-enter-from),
:deep(.youtube-player__poster-fade-leave-to) {
  opacity: 0;
  transform: scale(1.012);
}

:deep(.youtube-player__poster-fade-enter-to),
:deep(.youtube-player__poster-fade-leave-from) {
  opacity: 1;
  transform: scale(1);
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

@media (prefers-reduced-motion: reduce) {
  :deep(.youtube-player__poster-fade-enter-active),
  :deep(.youtube-player__poster-fade-leave-active) {
    transition: none;
  }
}

@media (max-width: 520px) {
  .youtube-player__open-group {
    grid-template-columns: 1fr;
    padding: var(--space-xs);
  }

  .youtube-player__open-button {
    inline-size: 100%;
  }
}
</style>
