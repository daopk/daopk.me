<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Play } from "@daopk/icons";
import { useKernel, type AppPreviewInput, type AppPreviewSurface } from "@daopk/sdk";

import { videoIdFromLaunchArgs, videoIdFromUrl, youtubeThumbnailUrls } from "../utils/youtubeVideo";

const props = defineProps<{
  readonly input: AppPreviewInput;
  readonly args: Readonly<Record<string, unknown>>;
  readonly surface: AppPreviewSurface;
}>();

const kernel = useKernel();
const thumbnailIndex = ref(0);
const videoId = computed(
  () =>
    videoIdFromLaunchArgs(props.args) ??
    (props.input.kind === "url" ? videoIdFromUrl(props.input.url) : null),
);
const thumbnailUrls = computed(() => youtubeThumbnailUrls(videoId.value));
const thumbnailUrl = computed(() => thumbnailUrls.value[thumbnailIndex.value] ?? null);
const launchArgs = computed<Readonly<Record<string, unknown>>>(() => {
  if (typeof props.args.videoId === "string" || typeof props.args.url === "string") {
    return props.args;
  }

  if (props.input.kind === "url") {
    return { url: props.input.url };
  }

  return videoId.value === null ? {} : { videoId: videoId.value };
});

watch(videoId, () => {
  thumbnailIndex.value = 0;
});

function tryNextThumbnail(): void {
  thumbnailIndex.value += 1;
}

function openVideo(): void {
  if (videoId.value === null) {
    return;
  }

  kernel.events.emit("app.launch.requested", {
    manifestId: "youtube-player",
    source: "deeplink",
    args: launchArgs.value,
  });
}
</script>

<template>
  <button
    class="youtube-video-preview"
    type="button"
    :disabled="videoId === null"
    :data-preview-surface="surface"
    aria-label="Open YouTube video"
    @click="openVideo"
  >
    <img
      v-if="thumbnailUrl !== null"
      class="youtube-video-preview__image"
      :src="thumbnailUrl"
      alt=""
      decoding="async"
      draggable="false"
      @error="tryNextThumbnail"
    />
    <span class="youtube-video-preview__scrim" aria-hidden="true" />
    <span class="youtube-video-preview__play" aria-hidden="true">
      <Play class="youtube-video-preview__icon" />
    </span>
  </button>
</template>

<style scoped lang="scss">
.youtube-video-preview {
  align-items: center;
  aspect-ratio: 16 / 9;
  background: color-mix(in srgb, var(--color-bg) 88%, black);
  border: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: var(--radius-md);
  color: white;
  cursor: pointer;
  display: grid;
  inline-size: 100%;
  margin-block: var(--space-lg);
  min-block-size: 0;
  overflow: hidden;
  padding: 0;
  place-items: center;
  position: relative;
}

.youtube-video-preview:disabled {
  cursor: default;
  opacity: 0.72;
}

.youtube-video-preview__image,
.youtube-video-preview__scrim {
  block-size: 100%;
  inline-size: 100%;
  inset: 0;
  position: absolute;
}

.youtube-video-preview__image {
  object-fit: cover;
}

.youtube-video-preview__scrim {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, black 22%, transparent),
      transparent 42%,
      color-mix(in srgb, black 38%, transparent)
    ),
    color-mix(in srgb, black 8%, transparent);
}

.youtube-video-preview__play {
  align-items: center;
  backdrop-filter: blur(12px);
  background: color-mix(in srgb, white 18%, transparent);
  block-size: 64px;
  border: 1px solid color-mix(in srgb, white 34%, transparent);
  border-radius: var(--radius-full);
  box-shadow: 0 18px 42px color-mix(in srgb, black 42%, transparent);
  display: inline-flex;
  inline-size: 64px;
  justify-content: center;
  position: relative;
  transition:
    background var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
}

.youtube-video-preview:hover:not(:disabled) .youtube-video-preview__play,
.youtube-video-preview:focus-visible .youtube-video-preview__play {
  background: color-mix(in srgb, white 25%, transparent);
  transform: scale(1.04);
}

.youtube-video-preview:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.youtube-video-preview__icon {
  block-size: 28px;
  inline-size: 28px;
  margin-inline-start: 3px;
}
</style>
