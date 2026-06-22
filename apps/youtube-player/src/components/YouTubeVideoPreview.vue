<script setup lang="ts">
import { computed } from "vue";

import type { AppPreviewInput, AppPreviewSurface } from "@daopk/sdk";

import YouTubePlayerSurface from "./YouTubePlayerSurface.vue";
import {
  autoplayFromLaunchArgs,
  videoIdFromLaunchArgs,
  videoIdFromUrl,
} from "../utils/youtubeVideo";

const props = defineProps<{
  readonly input: AppPreviewInput;
  readonly args: Readonly<Record<string, unknown>>;
  readonly surface: AppPreviewSurface;
}>();

const emit = defineEmits<{
  "aspect-ratio-change": [aspectRatio: number | null];
}>();

const videoId = computed(
  () =>
    videoIdFromLaunchArgs(props.args) ??
    (props.input.kind === "url" ? videoIdFromUrl(props.input.url) : null),
);
const isMoviesTrailer = computed(() => props.surface === "movies.trailer");
const autoplayRevision = computed(() =>
  isMoviesTrailer.value && autoplayFromLaunchArgs(props.args) ? 1 : 0,
);
const controlsEnabled = computed(() => !isMoviesTrailer.value);
const privacyEnhanced = computed(() => isMoviesTrailer.value);
</script>

<template>
  <div class="youtube-video-preview" :data-preview-surface="surface">
    <YouTubePlayerSurface
      v-if="videoId !== null"
      :video-id="videoId"
      :autoplay-revision="autoplayRevision"
      :controls-enabled="controlsEnabled"
      :privacy-enhanced="privacyEnhanced"
      @aspect-ratio-change="emit('aspect-ratio-change', $event)"
    />
    <div v-else class="youtube-video-preview__state" role="status">Video unavailable</div>
  </div>
</template>

<style scoped lang="scss">
.youtube-video-preview {
  aspect-ratio: 16 / 9;
  background: color-mix(in srgb, var(--color-bg) 90%, black);
  border: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: var(--radius-md);
  display: grid;
  inline-size: 100%;
  margin-block: var(--space-lg);
  min-block-size: 0;
  min-inline-size: 0;
  overflow: hidden;
  position: relative;
}

.youtube-video-preview__state {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  font-size: var(--font-size-sm);
  justify-content: center;
}

.youtube-video-preview[data-preview-surface="movies.trailer"] {
  block-size: 100%;
  border: 0;
  border-radius: 0;
  margin-block: 0;
}
</style>
