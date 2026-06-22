<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ArrowLeft } from "@daopk/icons";

import EpisodeList from "./EpisodeList.vue";
import MovieHlsPlayer from "./MovieHlsPlayer.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import {
  episodeLabel as formatEpisodeLabel,
  episodeMetaLabel,
  seasonLabel,
} from "./detail/detailFormatters";
import { mediaLabel } from "../i18n/labels";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
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
const selectedSourceIndex = ref(0);
const playerRef = ref<MovieHlsPlayerInstance | null>(null);
const scrollAreaRef = ref<{ element: HTMLElement | null } | null>(null);
const { locale, t } = useMoviesI18n();
let abortController: AbortController | null = null;
let viewportObserver: ResizeObserver | null = null;
let lastViewportBlockSize = -1;

const play = computed<MoviePlayInfo | null>(() => {
  if (props.target.kind === "movie") {
    return movieDetail.value?.play ?? null;
  }

  return episodeDetail.value?.episode.play ?? null;
});
const sourceOptions = computed(() =>
  (play.value?.sources ?? []).map((source, index) => ({
    index,
    label:
      [source.serverName, source.name || source.filename || source.slug]
        .filter((value) => value.length > 0)
        .join(" - ") || t("movies.player.sourceFallback", { number: index + 1 }),
  })),
);
const hasSourceOptions = computed(() => sourceOptions.value.length > 1);
const title = computed(() => {
  if (props.target.kind === "movie") {
    return movieDetail.value?.name ?? mediaLabel("movie", t, "singular");
  }

  return episodeDetail.value?.episode.name ?? t("movies.section.episode");
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
    episodeLabel: formatEpisodeLabel(episode, t),
    meta: episodeMetaLabel(episode, t),
    overview: episode.overview,
    seasonLabel: seasonLabel(currentEpisodeDetail.season, t),
    seriesName: currentEpisodeDetail.series.name,
    title: episode.name,
  };
});
const seasonEpisodes = computed<readonly MovieSeasonEpisode[]>(() => {
  if (props.target.kind !== "episode") {
    return [];
  }
  return episodeDetail.value?.season.episodes ?? [];
});
const seasonEpisodesLabel = computed(() => {
  const currentEpisodeDetail = episodeDetail.value;
  return currentEpisodeDetail === null ? "" : seasonLabel(currentEpisodeDetail.season, t);
});
const activeEpisodeNumber = computed(() =>
  props.target.kind === "episode" ? props.target.episodeNumber : null,
);
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
  return episode === null
    ? ""
    : t("movies.player.nextEpisode", {
        episode: formatEpisodeLabel(episode, t),
        title: episode.name,
      });
});

watch(
  () => [props.target, locale.value] as const,
  () => {
    void loadTarget();
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  const element = scrollAreaRef.value?.element ?? null;
  if (element === null || typeof ResizeObserver === "undefined") {
    return;
  }

  viewportObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry !== undefined) {
      applyViewportBlockSize(element, entry.contentRect.height);
    }
  });
  viewportObserver.observe(element);
});

onUnmounted(() => {
  abortController?.abort();
  viewportObserver?.disconnect();
  viewportObserver = null;
});

// Publish the watch viewport height so the player can letterbox itself to the
// visible area (see `--movies-player-fit-block-size` in MovieHlsPlayer.vue),
// keeping the controls/progress bar on-screen when the window is short.
function applyViewportBlockSize(element: HTMLElement, blockSize: number): void {
  const rounded = Math.round(blockSize);
  if (rounded <= 0 || rounded === lastViewportBlockSize) {
    return;
  }

  lastViewportBlockSize = rounded;
  element.style.setProperty("--movies-player-fit-block-size", `${rounded}px`);
}

async function loadTarget(): Promise<void> {
  abortController?.abort();
  const controller = new AbortController();
  abortController = controller;
  state.value = "loading";
  movieDetail.value = null;
  episodeDetail.value = null;
  selectedSourceIndex.value = 0;

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

function watchSeasonEpisode(episode: MovieSeasonEpisode): void {
  const currentEpisodeDetail = episodeDetail.value;
  if (episode.play === null || currentEpisodeDetail === null) {
    return;
  }

  emit("watch-episode", {
    episodeNumber: episode.episodeNumber,
    seasonNumber: episode.seasonNumber,
    slug: currentEpisodeDetail.series.slug,
    tmdbId: props.target.tmdbId,
  });
}

function handleKeyboardEvent(event: KeyboardEvent): void {
  playerRef.value?.handleAppKeydown?.(event);
}

defineExpose({
  handleKeyboardEvent,
});
</script>

<template>
  <ScrollArea ref="scrollAreaRef" class="movies-watch" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading'" />

    <EmptyState
      v-else-if="state === 'error'"
      class="movies-watch__status"
      role="alert"
      :title="t('movies.error.playback.title')"
      :description="t('movies.error.playback.description')"
    >
      <Button :icon-start="ArrowLeft" @click="$emit('back')">{{ t("movies.action.back") }}</Button>
    </EmptyState>

    <EmptyState
      v-else-if="play === null"
      class="movies-watch__status"
      role="alert"
      :title="t('movies.error.playbackUnavailable.title')"
      :description="t('movies.error.playback.description')"
    >
      <Button :icon-start="ArrowLeft" @click="$emit('back')">{{ t("movies.action.back") }}</Button>
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
        :source-index="selectedSourceIndex"
        :title="title"
        @back="$emit('back')"
        @next-episode="watchNextEpisode"
      />

      <section
        v-if="hasSourceOptions"
        class="movies-watch__sources"
        :aria-label="t('movies.player.source')"
      >
        <span class="movies-watch__sources-label">{{ t("movies.player.source") }}</span>
        <div class="movies-watch__sources-list">
          <Button
            v-for="source in sourceOptions"
            :key="source.index"
            size="sm"
            :variant="selectedSourceIndex === source.index ? 'primary' : 'secondary'"
            :aria-pressed="selectedSourceIndex === source.index"
            @click="selectedSourceIndex = source.index"
          >
            {{ source.label }}
          </Button>
        </div>
      </section>

      <section
        v-if="episodeInfo !== null"
        class="movies-watch__episode-info"
        :aria-label="t('movies.nowPlayingEpisode.ariaLabel')"
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

      <section
        v-if="seasonEpisodes.length > 0"
        class="movies-watch__episodes"
        :aria-label="t('movies.section.episode')"
      >
        <h2 class="movies-watch__episodes-heading">
          {{ seasonEpisodesLabel || t("movies.section.episode") }}
        </h2>
        <EpisodeList
          :episodes="seasonEpisodes"
          :active-episode-number="activeEpisodeNumber"
          @open="watchSeasonEpisode"
        />
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
  box-sizing: border-box;
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    auto 0;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding-inline: var(--movies-content-outer-padding-inline, var(--space-md));
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

.movies-watch__sources {
  box-sizing: border-box;
  display: grid;
  gap: var(--space-sm);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding: var(--space-lg) var(--movies-content-outer-padding-inline, var(--space-lg)) 0;
}

.movies-watch__sources:last-child {
  padding-block-end: clamp(var(--space-xl), 10vh, 96px);
}

.movies-watch__sources-label {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-watch__sources-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.movies-watch__episode-info {
  box-sizing: border-box;
  display: grid;
  gap: var(--space-xs);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding: var(--space-lg) var(--movies-content-outer-padding-inline, var(--space-lg)) 0;
}

.movies-watch__episode-info:last-child {
  padding-block-end: clamp(var(--space-xl), 10vh, 96px);
}

.movies-watch__episodes {
  box-sizing: border-box;
  display: grid;
  gap: var(--space-md);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding: var(--space-lg) var(--movies-content-outer-padding-inline, var(--space-lg))
    clamp(var(--space-xl), 10vh, 96px);
}

.movies-watch__episodes-heading {
  font-size: var(--font-size-lg);
  line-height: var(--leading-tight);
  margin: 0;
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
</style>
