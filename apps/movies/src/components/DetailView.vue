<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";

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
}>();

const detail = ref<MovieDetail | null>(null);
const state = ref<LoadState>("loading");
let abortController: AbortController | null = null;

watch(
  () => [props.mediaType, props.tmdbId] as const,
  () => {
    void loadDetail();
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
});

async function loadDetail(): Promise<void> {
  abortController?.abort();
  abortController = new AbortController();
  state.value = "loading";
  detail.value = null;

  try {
    detail.value = await fetchMovieDetail(props.mediaType, props.tmdbId, {
      signal: abortController.signal,
    });
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
      <DetailHero :detail="detail" />
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
  background: var(--color-bg);
  position: relative;
}

.movies-detail__status {
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--space-md) 0;
}
</style>
