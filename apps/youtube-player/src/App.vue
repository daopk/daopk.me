<script setup lang="ts">
import { inject, onUnmounted, ref } from "vue";

import { AppFrame, useAppChrome } from "@daopk/kit";
import { AppContextInjectionKey, KernelInjectionKey, type AppChromeContentSize } from "@daopk/sdk";

import YouTubePlayerSurface from "./components/YouTubePlayerSurface.vue";
import { videoIdFromLaunchArgs } from "./utils/youtubeVideo";

const appContext = inject(AppContextInjectionKey, null);
const kernel = inject(KernelInjectionKey, null);
const videoId = ref<string | null>(videoIdFromLaunchArgs(appContext?.args));
const playerTitle = ref("YouTube Player");

const chrome = useAppChrome({ title: playerTitle });

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
  stopOpenRequests?.();
});

function setPlayerTitle(nextTitle: string): void {
  playerTitle.value = nextTitle;
}

function setContentSize(size: AppChromeContentSize | null): void {
  chrome.setContentSize(size);
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
    <YouTubePlayerSurface
      :video-id="videoId"
      resize-to-aspect-ratio
      @content-size-change="setContentSize"
      @title-change="setPlayerTitle"
    />
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
</style>
