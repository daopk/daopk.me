<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ArrowLeft } from "@daopk/icons";

import MovieHlsPlayer from "./MovieHlsPlayer.vue";
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
const playerSection = ref<HTMLElement | null>(null);
const showPlayer = ref(false);
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
  showPlayer.value = false;

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

async function startWatching(): Promise<void> {
  showPlayer.value = true;
  await nextTick();
  playerSection.value?.scrollIntoView?.({
    behavior:
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    block: "start",
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
      <DetailHero :detail="detail" @watch="startWatching" />
      <section
        v-if="showPlayer && detail.play !== null"
        ref="playerSection"
        class="movies-detail__player"
        aria-label="Movie player"
      >
        <MovieHlsPlayer
          autoplay
          :play="detail.play"
          :poster-url="detail.backdropUrl || detail.posterUrl"
          :title="detail.name"
        />
      </section>
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

.movies-detail__player {
  margin: var(--space-xl) auto 0;
  max-inline-size: 1100px;
  padding-inline: var(--space-lg);
  scroll-margin-block-start: var(
    --movies-toolbar-content-offset,
    calc(var(--control-height-md) + var(--space-xl))
  );
}

@media (max-width: 700px) {
  .movies-detail__player {
    padding-inline: var(--space-md);
  }
}
</style>
