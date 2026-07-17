<script setup vapor lang="ts">
import { computed, ref } from "vue";

import { IconButton, Slider } from "@daopk/ui";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "@daopk/icons";

import { formatTime } from "../utils/playerValues";

const SEEK_THUMB_SIZE_PX = 16;

const props = defineProps<{
  controlsDisabled: boolean;
  currentTime: number;
  duration: number;
  fullscreen: boolean;
  loadedFraction: number;
  mutedOrSilent: boolean;
  playing: boolean;
  seekPosition: number;
  seekValueText: string;
  sliderMax: number;
  visible: boolean;
  volume: number;
  volumeValueText: string;
}>();

const emit = defineEmits<{
  "begin-seek": [];
  "cancel-seek": [];
  "commit-seek": [value: number];
  "focus-change": [focused: boolean];
  interaction: [];
  "preview-seek": [value: number];
  "set-volume": [value: number];
  "toggle-fullscreen": [];
  "toggle-mute": [];
  "toggle-playback": [];
}>();

const playPauseIcon = computed(() => (props.playing ? Pause : Play));
const playPauseLabel = computed(() => (props.playing ? "Pause" : "Play"));
const muteIcon = computed(() => (props.mutedOrSilent ? VolumeX : Volume2));
const muteLabel = computed(() => (props.mutedOrSilent ? "Unmute" : "Mute"));
const fullscreenLabel = computed(() => (props.fullscreen ? "Exit fullscreen" : "Enter fullscreen"));
const controlsRoot = ref<HTMLElement | null>(null);
const progressRoot = ref<HTMLElement | null>(null);
const seekPointerActive = ref(false);
const seekPointerPreview = ref<{ seconds: number; leftPx: number } | null>(null);
const seekPointerPreviewText = computed(() =>
  seekPointerPreview.value === null ? "" : formatTime(seekPointerPreview.value.seconds),
);
const progressStyle = computed<Record<string, string>>(() => ({
  "--youtube-player-loaded": String(props.loadedFraction),
  "--youtube-player-preview-left": `${seekPointerPreview.value?.leftPx ?? SEEK_THUMB_SIZE_PX / 2}px`,
  "--youtube-player-slider-thumb-size": `${SEEK_THUMB_SIZE_PX}px`,
}));

function onFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget;
  if (!(nextTarget instanceof Node) || !controlsRoot.value?.contains(nextTarget)) {
    emit("focus-change", false);
  }
}

function onSeekKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    emit("cancel-seek");
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
    emit("begin-seek");
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pointerPreviewFromEvent(event: PointerEvent): { seconds: number; leftPx: number } | null {
  if (props.controlsDisabled || props.duration <= 0) {
    return null;
  }

  const root = progressRoot.value;
  if (root === null) {
    return null;
  }

  const rect = root.getBoundingClientRect();
  if (rect.width <= SEEK_THUMB_SIZE_PX) {
    return null;
  }

  const trackStartPx = SEEK_THUMB_SIZE_PX / 2;
  const trackWidthPx = rect.width - SEEK_THUMB_SIZE_PX;
  const trackEndPx = trackStartPx + trackWidthPx;
  const pointerX = clamp(event.clientX - rect.left, trackStartPx, trackEndPx);
  const fraction = (pointerX - trackStartPx) / trackWidthPx;
  const seconds = Math.round(clamp(fraction, 0, 1) * props.duration);

  return { seconds, leftPx: pointerX };
}

function updateSeekPointerPreview(event: PointerEvent): void {
  seekPointerPreview.value = pointerPreviewFromEvent(event);
}

function clearSeekPointerPreview(): void {
  seekPointerPreview.value = null;
}

function onSeekPointerDown(event: PointerEvent): void {
  seekPointerActive.value = true;
  emit("begin-seek");
  updateSeekPointerPreview(event);
}

function onSeekPointerMove(event: PointerEvent): void {
  updateSeekPointerPreview(event);
}

function onSeekPointerLeave(): void {
  if (!seekPointerActive.value) {
    clearSeekPointerPreview();
  }
}

function onSeekPointerUp(event: PointerEvent): void {
  seekPointerActive.value = false;
  updateSeekPointerPreview(event);
}

function onSeekPointerCancel(): void {
  seekPointerActive.value = false;
  clearSeekPointerPreview();
  emit("cancel-seek");
}

function sliderValueFromChange(event: Event): number | null {
  const target = event.target;
  return target instanceof HTMLInputElement ? target.valueAsNumber : null;
}

function commitSeekFromChange(event: Event): void {
  const value = sliderValueFromChange(event);
  if (value !== null) emit("commit-seek", value);
}

function commitVolumeFromChange(event: Event): void {
  const value = sliderValueFromChange(event);
  if (value !== null) emit("set-volume", value);
}
</script>

<template>
  <div
    ref="controlsRoot"
    class="youtube-player__controls"
    :class="{ 'youtube-player__controls--hidden': !visible }"
    aria-label="Playback controls"
    @focusin="emit('focus-change', true)"
    @focusout="onFocusOut"
    @pointerdown="emit('interaction')"
    @pointermove="emit('interaction')"
    @touchstart="emit('interaction')"
  >
    <IconButton
      class="youtube-player__button"
      :ariaLabel="playPauseLabel"
      size="sm"
      variant="surface"
      :disabled="controlsDisabled"
      @click="emit('toggle-playback')"
    >
      <component :is="playPauseIcon" aria-hidden="true" />
    </IconButton>
    <span class="youtube-player__time">{{ formatTime(currentTime) }}</span>
    <div
      ref="progressRoot"
      class="youtube-player__progress"
      :style="progressStyle"
      @pointerdown="onSeekPointerDown"
      @pointermove="onSeekPointerMove"
      @pointerup="onSeekPointerUp"
      @pointercancel="onSeekPointerCancel"
      @pointerleave="onSeekPointerLeave"
    >
      <Slider
        class="youtube-player__seek"
        :model-value="seekPosition"
        :min="0"
        :max="sliderMax"
        :step="1"
        :tooltip="false"
        :disabled="controlsDisabled || duration <= 0"
        ariaLabel="Seek"
        :ariaValueText="seekValueText"
        @focusout="emit('cancel-seek')"
        @keydown="onSeekKeydown"
        @update:model-value="emit('preview-seek', $event)"
        @change="commitSeekFromChange"
      />
      <span v-if="seekPointerPreview" class="youtube-player__seek-preview" aria-hidden="true">
        {{ seekPointerPreviewText }}
      </span>
    </div>
    <span class="youtube-player__time">{{ formatTime(duration) }}</span>
    <IconButton
      class="youtube-player__button"
      :ariaLabel="muteLabel"
      size="sm"
      variant="surface"
      :disabled="controlsDisabled"
      @click="emit('toggle-mute')"
    >
      <component :is="muteIcon" aria-hidden="true" />
    </IconButton>
    <Slider
      class="youtube-player__volume"
      :model-value="volume"
      :min="0"
      :max="100"
      :step="1"
      :tooltip="false"
      :disabled="controlsDisabled"
      ariaLabel="Volume"
      :ariaValueText="volumeValueText"
      @update:model-value="emit('set-volume', $event)"
      @change="commitVolumeFromChange"
    />
    <IconButton
      class="youtube-player__button youtube-player__fullscreen"
      :ariaLabel="fullscreenLabel"
      size="sm"
      variant="surface"
      @click="emit('toggle-fullscreen')"
    >
      <Maximize2 aria-hidden="true" />
    </IconButton>
  </div>
</template>

<style scoped lang="scss">
.youtube-player__controls {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: auto auto minmax(96px, 1fr) auto auto minmax(72px, 120px) auto;
  inset-block-end: var(--space-md);
  inset-inline: var(--space-md);
  min-inline-size: 0;
  opacity: 1;
  padding: var(--space-sm);
  position: absolute;
  transform: translateY(0);
  transition:
    opacity var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
  z-index: 2;
}

.youtube-player__controls--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(var(--space-md));
}

.youtube-player__button {
  color: var(--color-fg);
}

.youtube-player__time {
  color: var(--color-fg);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  min-inline-size: 4.5ch;
  text-align: center;
  white-space: nowrap;
}

.youtube-player__progress {
  --youtube-player-slider-thumb-size: 16px;

  min-inline-size: 0;
  position: relative;
}

.youtube-player__progress::before {
  background: color-mix(in srgb, var(--color-fg) 22%, transparent);
  block-size: 3px;
  border-radius: var(--radius-full);
  content: "";
  inline-size: calc(100% - var(--youtube-player-slider-thumb-size));
  inset-block-start: calc(50% - 1.5px);
  inset-inline-start: calc(var(--youtube-player-slider-thumb-size) / 2);
  pointer-events: none;
  position: absolute;
  transform: scaleX(var(--youtube-player-loaded, 0));
  transform-origin: left center;
  z-index: 0;
}

.youtube-player__seek,
.youtube-player__volume {
  --ds-slider-thumb-opacity: 0;

  position: relative;
  z-index: 1;
}

.youtube-player__seek:hover,
.youtube-player__seek:focus-within,
.youtube-player__seek:active,
.youtube-player__volume:hover,
.youtube-player__volume:focus-within,
.youtube-player__volume:active {
  --ds-slider-thumb-opacity: 1;
}

.youtube-player__seek-preview {
  background: color-mix(in srgb, var(--color-bg-elevated) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  color: var(--color-fg);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  inset-block-end: calc(100% + var(--space-xs));
  inset-inline-start: var(--youtube-player-preview-left);
  min-inline-size: 4.5ch;
  padding: 2px var(--space-xs);
  pointer-events: none;
  position: absolute;
  text-align: center;
  transform: translateX(-50%);
  white-space: nowrap;
  z-index: 3;
}

@media (max-width: 560px) {
  .youtube-player__controls {
    grid-template-columns: auto auto minmax(64px, 1fr) auto auto;
  }

  .youtube-player__volume,
  .youtube-player__fullscreen {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .youtube-player__controls {
    transition: none;
  }
}
</style>
