<script setup lang="ts">
import { computed, ref } from "vue";

import { IconButton } from "@daopk/kit";
import { Slider } from "@daopk/ui";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "@daopk/icons";

import { formatTime } from "../utils/playerValues";

const props = defineProps<{
  controlsDisabled: boolean;
  currentTime: number;
  duration: number;
  fullscreen: boolean;
  loadedPercent: string;
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

function onFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget;
  if (!(nextTarget instanceof Node) || !controlsRoot.value?.contains(nextTarget)) {
    emit("focus-change", false);
  }
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
      :icon="playPauseIcon"
      :label="playPauseLabel"
      size="sm"
      variant="subtle"
      :disabled="controlsDisabled"
      @click="emit('toggle-playback')"
    />
    <span class="youtube-player__time">{{ formatTime(currentTime) }}</span>
    <div class="youtube-player__progress" :style="{ '--youtube-player-loaded': loadedPercent }">
      <Slider
        class="youtube-player__seek"
        :model-value="seekPosition"
        :min="0"
        :max="sliderMax"
        :step="1"
        :disabled="controlsDisabled || duration <= 0"
        aria-label="Seek"
        :aria-valuetext="seekValueText"
        @update:model-value="emit('preview-seek', $event)"
        @commit="emit('commit-seek', $event)"
      />
    </div>
    <span class="youtube-player__time">{{ formatTime(duration) }}</span>
    <IconButton
      class="youtube-player__button"
      :icon="muteIcon"
      :label="muteLabel"
      size="sm"
      variant="subtle"
      :disabled="controlsDisabled"
      @click="emit('toggle-mute')"
    />
    <Slider
      class="youtube-player__volume"
      :model-value="volume"
      :min="0"
      :max="100"
      :step="1"
      :disabled="controlsDisabled"
      aria-label="Volume"
      :aria-valuetext="volumeValueText"
      @update:model-value="emit('set-volume', $event)"
      @commit="emit('set-volume', $event)"
    />
    <IconButton
      class="youtube-player__button youtube-player__fullscreen"
      :icon="Maximize2"
      :label="fullscreenLabel"
      size="sm"
      variant="subtle"
      @click="emit('toggle-fullscreen')"
    />
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
  min-inline-size: 0;
  position: relative;
}

.youtube-player__progress::before {
  background: color-mix(in srgb, var(--color-fg) 22%, transparent);
  block-size: 3px;
  border-radius: var(--radius-full);
  content: "";
  inline-size: var(--youtube-player-loaded, 0%);
  inset-block-start: calc(50% - 1.5px);
  inset-inline-start: 0;
  pointer-events: none;
  position: absolute;
  z-index: 0;
}

.youtube-player__seek,
.youtube-player__volume {
  position: relative;
  z-index: 1;
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
