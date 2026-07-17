<script setup vapor lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ArrowLeft, Layers2 } from "@daopk/icons";

import MovieHlsPlayer from "./MovieHlsPlayer.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import SeasonEpisodesSection from "./SeasonEpisodesSection.vue";
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
  type MovieSummary,
  type MovieSeasonEpisode,
} from "../moviesApi";
import {
  createMoviesPlaybackProgressStore,
  episodePlaybackProgressKey,
  moviePlaybackProgressKey,
  resolveMoviesPlaybackProgressSourceIndex,
} from "../moviesPlaybackProgress";
import {
  createMoviesSourcePreferenceStore,
  moviesSourcePreferenceSnapshot,
  resolveMoviesPreferredSourceIndex,
  type MoviesSourcePreferenceSnapshot,
} from "../moviesSourcePreference";
import type { MoviesWatchTarget } from "../moviesRoutes";

type LoadState = "loading" | "ready" | "error";
interface MovieHlsPlayerInstance {
  readonly handleAppKeydown?: (event: KeyboardEvent) => void;
}

interface WatchViewProps {
  autoplay?: boolean;
  sourcePreference?: MoviesSourcePreferenceSnapshot | null;
  target: MoviesWatchTarget;
}

const props = withDefaults(defineProps<WatchViewProps>(), {
  autoplay: false,
  sourcePreference: null,
});

interface WatchEpisodeRequest {
  readonly sourcePreference: MoviesSourcePreferenceSnapshot | null;
  readonly target: MovieEpisodeTarget;
}

const emit = defineEmits<{
  back: [];
  "open-detail": [movie: MovieSummary];
  "watch-episode": [request: WatchEpisodeRequest];
}>();

const state = ref<LoadState>("loading");
const movieDetail = ref<MovieDetail | null>(null);
const episodeDetail = ref<MovieEpisodeDetail | null>(null);
const playbackSpeed = ref(1);
const selectedSourceIndex = ref(0);
const playerRef = ref<MovieHlsPlayerInstance | null>(null);
const scrollAreaRef = ref<{ element: HTMLElement | null } | null>(null);
const { locale, t } = useMoviesI18n();
let abortController: AbortController | null = null;
let viewportObserver: ResizeObserver | null = null;
let lastViewportBlockSize = -1;
const playbackProgressStore = createMoviesPlaybackProgressStore();
const sourcePreferenceStore = createMoviesSourcePreferenceStore();

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
const activeEpisodeNumber = computed(() => {
  const target = props.target;
  return target.kind === "episode" ? target.episodeNumber : null;
});
const canChooseAnotherSeason = computed(() => {
  const target = props.target;
  const currentEpisodeDetail = episodeDetail.value;
  if (target.kind !== "episode" || currentEpisodeDetail === null) {
    return false;
  }

  return currentEpisodeDetail.series.seasons.some(
    (season) => season.seasonNumber !== target.seasonNumber,
  );
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
  return episode === null
    ? ""
    : t("movies.player.nextEpisode", {
        episode: formatEpisodeLabel(episode, t),
        title: episode.name,
      });
});

watch(
  () => [props.target, props.sourcePreference, locale.value] as const,
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
  playbackProgressStore.dispose();
  sourcePreferenceStore.dispose();
});

// Publish the watch viewport height so the player can fit the visible area,
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
    restoreSavedSourceIndex(props.sourcePreference);
    state.value = "ready";
  } catch {
    if (controller.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}

function restoreSavedSourceIndex(
  sourcePreferenceOverride: MoviesSourcePreferenceSnapshot | null = null,
): void {
  const currentPlay = play.value;
  if (currentPlay === null) {
    selectedSourceIndex.value = 0;
    return;
  }

  const progress = playbackProgressStore.get(progressKey.value);
  selectedSourceIndex.value =
    sourcePreferenceOverride !== null
      ? resolveMoviesPreferredSourceIndex(sourcePreferenceOverride, currentPlay.sources)
      : progress?.source === undefined
        ? resolveMoviesPreferredSourceIndex(sourcePreferenceStore.get(), currentPlay.sources)
        : resolveMoviesPlaybackProgressSourceIndex(progress, currentPlay.sources);
}

function selectSource(index: number): void {
  selectedSourceIndex.value = index;
  saveSelectedSourcePreference();
}

function saveSelectedSourcePreference(): MoviesSourcePreferenceSnapshot | null {
  const source = play.value?.sources[selectedSourceIndex.value];
  if (source === undefined) {
    return null;
  }

  const preference = moviesSourcePreferenceSnapshot(source, selectedSourceIndex.value);
  sourcePreferenceStore.save(preference);
  return preference;
}

function watchNextEpisode(): void {
  const target = nextEpisodeTarget.value;
  if (target !== null) {
    emit("watch-episode", {
      sourcePreference: saveSelectedSourcePreference(),
      target,
    });
  }
}

function watchSeasonEpisode(episode: MovieSeasonEpisode): void {
  const currentEpisodeDetail = episodeDetail.value;
  if (episode.play === null || currentEpisodeDetail === null) {
    return;
  }

  emit("watch-episode", {
    sourcePreference: saveSelectedSourcePreference(),
    target: {
      episodeNumber: episode.episodeNumber,
      seasonNumber: episode.seasonNumber,
      slug: currentEpisodeDetail.series.slug,
      tmdbId: props.target.tmdbId,
    },
  });
}

function openSeriesDetail(): void {
  const series = episodeDetail.value?.series ?? null;
  if (series !== null) {
    emit("open-detail", series);
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
        v-model:playback-speed="playbackSpeed"
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
            @click="selectSource(source.index)"
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
        <Button
          v-if="canChooseAnotherSeason"
          class="movies-watch__series-link"
          size="sm"
          variant="secondary"
          :icon-start="Layers2"
          @click="openSeriesDetail"
        >
          {{ t("movies.action.seriesOverview") }}
        </Button>
      </section>

      <SeasonEpisodesSection
        v-if="episodeDetail !== null"
        class="movies-watch__episodes"
        :active-episode-number="activeEpisodeNumber"
        :initial-season="episodeDetail.season"
        :series="episodeDetail.series"
        :tmdb-id="props.target.tmdbId"
        @open="watchSeasonEpisode"
      />
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
  --movies-player-video-fit: contain;

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

.movies-watch__series-link {
  justify-self: start;
  margin-block-start: var(--space-xs);
}
</style>
