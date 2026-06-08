<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ArrowLeft } from "@daopk/icons";

import MovieHlsPlayer from "./MovieHlsPlayer.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import {
  episodeLabel as formatEpisodeLabel,
  episodeMetaLabel,
  seasonLabel,
} from "./detail/detailFormatters";
import {
  fetchMovieDetail,
  fetchMovieEpisode,
  type MovieDetail,
  type MovieEpisodeDetail,
  type MoviePlayInfo,
} from "../moviesApi";
import { episodePlaybackProgressKey, moviePlaybackProgressKey } from "../moviesPlaybackProgress";
import type { MoviesWatchTarget } from "../moviesRoutes";

type LoadState = "loading" | "ready" | "error";

interface WatchViewProps {
  autoplay?: boolean;
  target: MoviesWatchTarget;
}

const props = withDefaults(defineProps<WatchViewProps>(), {
  autoplay: false,
});

defineEmits<{
  back: [];
}>();

const state = ref<LoadState>("loading");
const movieDetail = ref<MovieDetail | null>(null);
const episodeDetail = ref<MovieEpisodeDetail | null>(null);
let abortController: AbortController | null = null;

const play = computed<MoviePlayInfo | null>(() => {
  if (props.target.kind === "movie") {
    return movieDetail.value?.play ?? null;
  }

  return episodeDetail.value?.episode.play ?? null;
});
const title = computed(() => {
  if (props.target.kind === "movie") {
    return movieDetail.value?.name ?? "Movie";
  }

  return episodeDetail.value?.episode.name ?? "Episode";
});
const posterUrl = computed(() => {
  if (props.target.kind === "movie") {
    const detail = movieDetail.value;
    return detail === null ? "" : detail.backdropUrl || detail.posterUrl;
  }

  const currentEpisodeDetail = episodeDetail.value;
  return currentEpisodeDetail === null
    ? ""
    : currentEpisodeDetail.episode.stillUrl ||
        currentEpisodeDetail.series.backdropUrl ||
        currentEpisodeDetail.series.posterUrl;
});
const progressKey = computed(() =>
  props.target.kind === "movie"
    ? moviePlaybackProgressKey(props.target.tmdbId)
    : episodePlaybackProgressKey(
        props.target.tmdbId,
        props.target.seasonNumber,
        props.target.episodeNumber,
      ),
);
const episodeInfo = computed(() => {
  const currentEpisodeDetail = episodeDetail.value;
  if (props.target.kind !== "episode" || currentEpisodeDetail === null) {
    return null;
  }

  const episode = currentEpisodeDetail.episode;
  return {
    episodeLabel: formatEpisodeLabel(episode),
    meta: episodeMetaLabel(episode),
    overview: episode.overview,
    seasonLabel: seasonLabel(currentEpisodeDetail.season),
    seriesName: currentEpisodeDetail.series.name,
    title: episode.name,
  };
});

watch(
  () => props.target,
  () => {
    void loadTarget();
  },
  { deep: true, immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
});

async function loadTarget(): Promise<void> {
  abortController?.abort();
  const controller = new AbortController();
  abortController = controller;
  state.value = "loading";
  movieDetail.value = null;
  episodeDetail.value = null;

  try {
    const target = props.target;
    if (target.kind === "movie") {
      movieDetail.value = await fetchMovieDetail("movie", target.tmdbId, {
        signal: controller.signal,
      });
    } else {
      episodeDetail.value = await fetchMovieEpisode(
        target.tmdbId,
        target.seasonNumber,
        target.episodeNumber,
        { signal: controller.signal },
      );
    }
    state.value = "ready";
  } catch {
    if (controller.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}
</script>

<template>
  <ScrollArea class="movies-watch" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading'" />

    <EmptyState
      v-else-if="state === 'error'"
      class="movies-watch__status"
      role="alert"
      title="Could not load playback"
      description="Go back and try another title."
    >
      <Button :icon-start="ArrowLeft" @click="$emit('back')">Back</Button>
    </EmptyState>

    <EmptyState
      v-else-if="play === null"
      class="movies-watch__status"
      role="alert"
      title="Playback unavailable"
      description="Go back and try another title."
    >
      <Button :icon-start="ArrowLeft" @click="$emit('back')">Back</Button>
    </EmptyState>

    <article v-else class="movies-watch__content">
      <MovieHlsPlayer
        class="movies-watch__player"
        :autoplay="autoplay"
        :play="play"
        :poster-url="posterUrl"
        :progress-key="progressKey"
        show-back-button
        :title="title"
        @back="$emit('back')"
      />

      <section
        v-if="episodeInfo !== null"
        class="movies-watch__episode-info"
        aria-label="Now playing episode"
      >
        <p class="movies-watch__episode-eyebrow">
          {{ episodeInfo.seriesName }} · {{ episodeInfo.seasonLabel }}
        </p>
        <h1>{{ episodeInfo.title }}</h1>
        <p v-if="episodeInfo.meta" class="movies-watch__episode-meta">
          {{ episodeInfo.episodeLabel }} · {{ episodeInfo.meta }}
        </p>
        <p v-else class="movies-watch__episode-meta">{{ episodeInfo.episodeLabel }}</p>
        <p v-if="episodeInfo.overview" class="movies-watch__episode-overview">
          {{ episodeInfo.overview }}
        </p>
      </section>
    </article>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-watch {
  block-size: 100%;
  background: var(--movies-surface-bg, var(--color-bg));
  position: relative;
}

.movies-watch__status {
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--space-md) 0;
}

.movies-watch__content {
  display: grid;
  inline-size: 100%;
  margin: 0;
  max-inline-size: none;
  padding: 0;
}

.movies-watch__player {
  inline-size: 100%;
}

.movies-watch__episode-info {
  display: grid;
  gap: var(--space-xs);
  inline-size: min(100%, 1100px);
  margin-inline: auto;
  padding: var(--space-lg) var(--space-lg) clamp(var(--space-xl), 10vh, 96px);
}

.movies-watch__episode-eyebrow,
.movies-watch__episode-meta {
  color: var(--color-fg-muted);
  margin: 0;
}

.movies-watch__episode-eyebrow {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-watch__episode-info h1 {
  font-size: var(--font-size-xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-watch__episode-overview {
  line-height: var(--leading-relaxed);
  margin: 0;
  max-inline-size: 78ch;
}

@media (max-width: 700px) {
  .movies-watch__episode-info {
    padding-inline: var(--space-md);
  }
}
</style>
