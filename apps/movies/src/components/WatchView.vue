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
  type MovieEpisodeTarget,
  type MoviePlayInfo,
  type MovieSeasonEpisode,
} from "../moviesApi";
import { episodePlaybackProgressKey, moviePlaybackProgressKey } from "../moviesPlaybackProgress";
import type { MoviesWatchTarget } from "../moviesRoutes";

type LoadState = "loading" | "ready" | "error";
type MovieHlsPlayerInstance = InstanceType<typeof MovieHlsPlayer> & {
  readonly handleAppKeydown?: (event: KeyboardEvent) => void;
};

interface WatchViewProps {
  autoplay?: boolean;
  target: MoviesWatchTarget;
}

const props = withDefaults(defineProps<WatchViewProps>(), {
  autoplay: false,
});

const emit = defineEmits<{
  back: [];
  "watch-episode": [request: MovieEpisodeTarget];
}>();

const state = ref<LoadState>("loading");
const movieDetail = ref<MovieDetail | null>(null);
const episodeDetail = ref<MovieEpisodeDetail | null>(null);
const playerRef = ref<MovieHlsPlayerInstance | null>(null);
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
const nextEpisode = computed<MovieSeasonEpisode | null>(() => {
  const target = props.target;
  const currentEpisodeDetail = episodeDetail.value;
  if (target.kind !== "episode" || currentEpisodeDetail === null) {
    return null;
  }

  return (
    currentEpisodeDetail.season.episodes
      .filter(
        (episode) =>
          episode.seasonNumber === target.seasonNumber &&
          episode.episodeNumber > target.episodeNumber &&
          episode.play !== null,
      )
      .sort((left, right) => left.episodeNumber - right.episodeNumber)[0] ?? null
  );
});
const nextEpisodeTarget = computed<MovieEpisodeTarget | null>(() => {
  const episode = nextEpisode.value;
  const currentEpisodeDetail = episodeDetail.value;
  if (episode === null || currentEpisodeDetail === null) {
    return null;
  }

  return {
    episodeNumber: episode.episodeNumber,
    seasonNumber: episode.seasonNumber,
    slug: currentEpisodeDetail.series.slug,
    tmdbId: props.target.tmdbId,
  };
});
const nextEpisodeLabel = computed(() => {
  const episode = nextEpisode.value;
  return episode === null ? "" : `Next episode: ${formatEpisodeLabel(episode)} - ${episode.name}`;
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

function watchNextEpisode(): void {
  const target = nextEpisodeTarget.value;
  if (target !== null) {
    emit("watch-episode", target);
  }
}

function handleKeyboardEvent(event: KeyboardEvent): void {
  playerRef.value?.handleAppKeydown?.(event);
}

defineExpose({
  handleKeyboardEvent,
});
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
        ref="playerRef"
        class="movies-watch__player"
        :autoplay="autoplay"
        :next-episode-label="nextEpisodeLabel"
        :play="play"
        :poster-url="posterUrl"
        :progress-key="progressKey"
        show-back-button
        :title="title"
        @back="$emit('back')"
        @next-episode="watchNextEpisode"
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
  padding-block-start: var(--mobile-shell-app-safe-area-top, 0px);
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
