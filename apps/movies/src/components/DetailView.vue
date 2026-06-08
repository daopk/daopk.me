<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ArrowLeft } from "@daopk/icons";

import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import DetailContent from "./detail/DetailContent.vue";
import DetailHero from "./detail/DetailHero.vue";
import {
  fetchMovieDetail,
  type MovieDetail,
  type MovieEpisodeTarget,
  type MovieMediaType,
  type MoviePersonCredit,
  type MovieSeasonEpisode,
  type MovieSummary,
} from "../moviesApi";
import {
  createMoviesPlaybackProgressStore,
  moviePlaybackProgressKey,
  type MoviesPlaybackProgressEntry,
} from "../moviesPlaybackProgress";

type LoadState = "loading" | "ready" | "error";

interface DetailViewProps {
  mediaType: MovieMediaType;
  tmdbId: number;
}

const props = defineProps<DetailViewProps>();

const emit = defineEmits<{
  back: [];
  "open-detail": [movie: MovieSummary];
  "open-episode": [request: MovieEpisodeTarget];
  "open-person": [person: MoviePersonCredit];
  watch: [movie: MovieSummary];
}>();

const detail = ref<MovieDetail | null>(null);
const state = ref<LoadState>("loading");
const resumeProgress = ref<MoviesPlaybackProgressEntry | null>(null);
const playbackProgressStore = createMoviesPlaybackProgressStore();
let abortController: AbortController | null = null;

const progressKey = computed(() => moviePlaybackProgressKey(props.tmdbId));

watch(
  () => [props.mediaType, props.tmdbId] as const,
  () => {
    void loadDetail();
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
  playbackProgressStore.dispose();
});

async function loadDetail(): Promise<void> {
  abortController?.abort();
  abortController = new AbortController();
  state.value = "loading";
  detail.value = null;
  resumeProgress.value = null;

  try {
    const nextDetail = await fetchMovieDetail(props.mediaType, props.tmdbId, {
      signal: abortController.signal,
    });
    detail.value = nextDetail;
    refreshResumeProgress();
    state.value = "ready";
  } catch {
    if (abortController.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}

function openEpisode(episode: MovieSeasonEpisode): void {
  if (detail.value === null) {
    return;
  }

  emit("open-episode", {
    episodeNumber: episode.episodeNumber,
    seasonNumber: episode.seasonNumber,
    slug: detail.value.slug,
    tmdbId: detail.value.tmdbId,
  });
}

function refreshResumeProgress(): void {
  const currentDetail = detail.value;
  resumeProgress.value =
    currentDetail?.mediaType === "movie" && currentDetail.play !== null
      ? playbackProgressStore.get(progressKey.value)
      : null;
}

function startWatching(): void {
  refreshResumeProgress();
  const currentDetail = detail.value;
  if (currentDetail?.mediaType === "movie" && currentDetail.play !== null) {
    emit("watch", currentDetail);
  }
}
</script>

<template>
  <ScrollArea class="movies-detail" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading'" />

    <EmptyState
      v-else-if="state === 'error'"
      class="movies-detail__status"
      role="alert"
      title="Could not load title"
      description="Go back and try another movie or TV show."
    >
      <Button :icon-start="ArrowLeft" @click="$emit('back')">Back</Button>
    </EmptyState>

    <template v-else-if="detail">
      <DetailHero :detail="detail" :resume-progress="resumeProgress" @watch="startWatching" />
      <DetailContent
        :detail="detail"
        @open-detail="$emit('open-detail', $event)"
        @open-episode="openEpisode"
        @open-person="$emit('open-person', $event)"
      />
    </template>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-detail {
  block-size: 100%;
  background: var(--movies-surface-bg, var(--color-bg));
  position: relative;
}

.movies-detail__status {
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--space-md) 0;
}
</style>
