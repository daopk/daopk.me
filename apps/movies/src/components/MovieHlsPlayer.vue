<script setup lang="ts">
import Hls from "hls.js";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { MoviePlayInfo } from "../moviesApi";

interface MovieHlsPlayerProps {
  play: MoviePlayInfo;
  posterUrl?: string;
  title: string;
}

const props = withDefaults(defineProps<MovieHlsPlayerProps>(), {
  posterUrl: "",
});

const videoElement = ref<HTMLVideoElement | null>(null);
const selectedSourceIndex = ref(0);
const playbackError = ref("");
let hls: Hls | null = null;

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
  void attachSource();
});

watch(
  () => activeSource.value?.m3u8Url ?? "",
  () => {
    void attachSource();
  },
);

onBeforeUnmount(() => {
  destroyHls();
});

function destroyHls(): void {
  hls?.destroy();
  hls = null;
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

async function attachSource(): Promise<void> {
  await nextTick();

  const video = videoElement.value;
  const source = activeSource.value;
  destroyHls();
  playbackError.value = "";

  if (video === null || source === null) {
    return;
  }

  video.removeAttribute("src");

  if (Hls.isSupported()) {
    const instance = new Hls();
    hls = instance;
    instance.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        playbackError.value = "Could not play this stream.";
        destroyHls();
      }
    });
    instance.loadSource(source.m3u8Url);
    instance.attachMedia(video);
    return;
  }

  if (canPlayNativeHls(video)) {
    video.src = source.m3u8Url;
    loadVideo(video);
    return;
  }

  playbackError.value = "This browser cannot play this stream.";
}

function onVideoError(): void {
  playbackError.value = "Could not play this stream.";
}
</script>

<template>
  <div class="movies-hls-player">
    <div class="movies-hls-player__stage">
      <video
        ref="videoElement"
        class="movies-hls-player__video"
        controls
        playsinline
        preload="metadata"
        :poster="posterUrl || undefined"
        :title="title"
        @error="onVideoError"
      />
      <p v-if="playbackError" class="movies-hls-player__error" role="alert">
        {{ playbackError }}
      </p>
    </div>

    <label v-if="sourceOptions.length > 1" class="movies-hls-player__source">
      <span>Source</span>
      <select v-model.number="selectedSourceIndex" aria-label="Playback source">
        <option v-for="source in sourceOptions" :key="source.index" :value="source.index">
          {{ source.label || `Source ${source.index + 1}` }}
        </option>
      </select>
    </label>
  </div>
</template>

<style scoped lang="scss">
.movies-hls-player {
  color: var(--color-fg);
  display: grid;
  gap: var(--space-sm);
  inline-size: 100%;
  min-inline-size: 0;
}

.movies-hls-player__stage {
  aspect-ratio: 16 / 9;
  background: color-mix(in srgb, var(--color-bg) 92%, var(--color-fg) 8%);
  border-radius: 8px;
  inline-size: 100%;
  overflow: hidden;
  position: relative;
}

.movies-hls-player__video {
  background: color-mix(in srgb, var(--color-bg) 92%, var(--color-fg) 8%);
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: contain;
}

.movies-hls-player__error {
  background: color-mix(in srgb, var(--color-bg-elevated) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  font-size: var(--font-size-sm);
  inset-block-start: var(--space-md);
  inset-inline: var(--space-md);
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  position: absolute;
  text-align: center;
}

.movies-hls-player__source {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
  min-inline-size: 0;
}

.movies-hls-player__source span {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-hls-player__source select {
  background: color-mix(in srgb, var(--color-fg) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  font: inherit;
  max-inline-size: min(100%, 320px);
  min-inline-size: 0;
  padding: var(--space-xs) var(--space-sm);
}

.movies-hls-player__source select:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

@media (max-width: 700px) {
  .movies-hls-player__source {
    align-items: stretch;
    display: grid;
    justify-content: stretch;
  }

  .movies-hls-player__source select {
    max-inline-size: none;
  }
}
</style>
