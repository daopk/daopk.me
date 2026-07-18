<script setup vapor lang="ts">
import { computed, ref, watch } from "vue";

import Play from "~icons/lucide/play";

import { youtubeThumbnailUrls } from "../utils/youtubeVideo";

const props = defineProps<{
  disabled: boolean;
  title: string | null;
  videoId: string | null;
}>();

const emit = defineEmits<{
  "aspect-ratio-change": [ratio: number];
  interaction: [];
  play: [];
}>();

const imageLoaded = ref(false);
const thumbnailIndex = ref(0);
const thumbnailUrls = computed(() => youtubeThumbnailUrls(props.videoId));
const thumbnailUrl = computed(() => thumbnailUrls.value[thumbnailIndex.value] ?? null);
const playLabel = computed(() => (props.title === null ? "Play video" : `Play ${props.title}`));

watch(
  () => props.videoId,
  () => {
    thumbnailIndex.value = 0;
  },
);

watch(thumbnailUrl, () => {
  imageLoaded.value = false;
});

function tryNextThumbnail(): void {
  thumbnailIndex.value += 1;
}

function syncThumbnailAspectRatio(event: Event): void {
  const image = event.currentTarget;
  imageLoaded.value = true;

  if (!(image instanceof HTMLImageElement) || image.naturalHeight <= 0) {
    return;
  }

  emit("aspect-ratio-change", image.naturalWidth / image.naturalHeight);
}
</script>

<template>
  <button
    class="youtube-player__poster"
    type="button"
    :aria-label="playLabel"
    :disabled="disabled"
    @click="emit('play')"
    @pointerdown="emit('interaction')"
    @pointermove="emit('interaction')"
    @touchstart="emit('interaction')"
  >
    <img
      v-if="thumbnailUrl !== null"
      class="youtube-player__poster-image"
      :class="{ 'youtube-player__poster-image--loaded': imageLoaded }"
      :src="thumbnailUrl"
      alt=""
      draggable="false"
      @error="tryNextThumbnail"
      @load="syncThumbnailAspectRatio"
    />
    <span class="youtube-player__poster-play" aria-hidden="true">
      <Play class="youtube-player__poster-icon" />
    </span>
  </button>
</template>

<style scoped lang="scss">
.youtube-player__poster {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 86%, black);
  border: 0;
  color: white;
  cursor: pointer;
  display: grid;
  inset: 0;
  min-block-size: 0;
  min-inline-size: 0;
  overflow: hidden;
  padding: 0;
  place-items: center;
  position: absolute;
  z-index: 1;
}

.youtube-player__poster:disabled {
  cursor: default;
}

.youtube-player__poster::after {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, black 28%, transparent),
      transparent 38%,
      color-mix(in srgb, black 44%, transparent)
    ),
    linear-gradient(90deg, color-mix(in srgb, black 42%, transparent), transparent 24% 76%),
    color-mix(in srgb, black 12%, transparent);
  content: "";
  inset: 0;
  pointer-events: none;
  position: absolute;
}

.youtube-player__poster-image {
  block-size: 100%;
  inset: 0;
  inline-size: 100%;
  object-fit: contain;
  opacity: 0;
  position: absolute;
  transform: scale(1.012);
  transition:
    opacity 220ms var(--ease),
    transform 360ms var(--ease);
  will-change: opacity, transform;
}

.youtube-player__poster-image--loaded {
  opacity: 1;
  transform: scale(1);
}

.youtube-player__poster-play {
  align-items: center;
  backdrop-filter: blur(12px);
  background: color-mix(in srgb, var(--color-fg) 14%, transparent);
  block-size: 56px;
  border: 1px solid color-mix(in srgb, white 34%, transparent);
  border-radius: var(--radius-full);
  box-shadow: 0 18px 42px color-mix(in srgb, black 42%, transparent);
  color: white;
  display: inline-flex;
  grid-area: 1 / 1;
  inline-size: 56px;
  justify-content: center;
  position: relative;
  transition:
    background var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
  z-index: 1;
}

.youtube-player__poster:hover:not(:disabled) .youtube-player__poster-play,
.youtube-player__poster:focus-visible .youtube-player__poster-play {
  background: color-mix(in srgb, var(--color-fg) 22%, transparent);
  transform: scale(1.04);
}

.youtube-player__poster:disabled .youtube-player__poster-play {
  opacity: 0.58;
}

.youtube-player__poster:focus-visible {
  outline: none;
}

.youtube-player__poster:focus-visible .youtube-player__poster-play {
  outline: 2px solid color-mix(in srgb, white 72%, transparent);
  outline-offset: 4px;
}

.youtube-player__poster-icon {
  block-size: 24px;
  inline-size: 24px;
  margin-inline-start: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .youtube-player__poster-image {
    transform: none;
    transition: none;
  }

  .youtube-player__poster-play {
    transition: none;
  }
}
</style>
