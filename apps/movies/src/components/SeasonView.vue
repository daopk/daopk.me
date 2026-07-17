<script setup vapor lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ArrowLeft } from "@daopk/icons";

import EpisodeList from "./EpisodeList.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import DetailPeopleSection from "./detail/DetailPeopleSection.vue";
import { episodeCountLabel, seasonLabel, seasonMetaLabel } from "./detail/detailFormatters";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import {
  fetchMovieDetail,
  fetchMovieSeason,
  type MovieDetail,
  type MovieEpisodeTarget,
  type MoviePersonCredit,
  type MovieSeasonDetail,
  type MovieSeasonEpisode,
} from "../moviesApi";

type LoadState = "loading" | "ready" | "error";

interface SeasonViewProps {
  seasonNumber: number;
  slug: string;
  tmdbId: number;
}

const props = defineProps<SeasonViewProps>();

const emit = defineEmits<{
  back: [];
  "open-episode": [request: MovieEpisodeTarget];
  "open-person": [person: MoviePersonCredit];
}>();

const detail = ref<MovieDetail | null>(null);
const season = ref<MovieSeasonDetail | null>(null);
const state = ref<LoadState>("loading");
const { locale, t } = useMoviesI18n();
let abortController: AbortController | null = null;

const heroImageUrl = computed(
  () => season.value?.posterUrl || detail.value?.backdropUrl || detail.value?.posterUrl || "",
);
const heading = computed(() => {
  const currentDetail = detail.value;
  const currentSeason = season.value;
  if (currentDetail === null || currentSeason === null) {
    return "";
  }

  return `${currentDetail.name}: ${seasonLabel(currentSeason, t)}`;
});
const meta = computed(() => {
  const currentSeason = season.value;
  if (currentSeason === null) {
    return "";
  }

  return seasonMetaLabel(currentSeason, t) || episodeCountLabel(currentSeason.episodes.length, t);
});

watch(
  () => [props.tmdbId, props.seasonNumber, locale.value] as const,
  () => {
    void loadSeason();
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
});

function openEpisode(episode: MovieSeasonEpisode): void {
  emit("open-episode", {
    episodeNumber: episode.episodeNumber,
    seasonNumber: episode.seasonNumber,
    slug: detail.value?.slug ?? props.slug,
    tmdbId: props.tmdbId,
  });
}

async function loadSeason(): Promise<void> {
  abortController?.abort();
  abortController = new AbortController();
  detail.value = null;
  season.value = null;
  state.value = "loading";

  try {
    const [nextDetail, nextSeason] = await Promise.all([
      fetchMovieDetail("tv", props.tmdbId, { signal: abortController.signal }),
      fetchMovieSeason(props.tmdbId, props.seasonNumber, { signal: abortController.signal }),
    ]);
    detail.value = nextDetail;
    season.value = nextSeason;
    state.value = "ready";
  } catch {
    if (abortController.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}
</script>

<template>
  <ScrollArea class="movies-season" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading'" />

    <EmptyState
      v-else-if="state === 'error'"
      class="movies-season__status"
      role="alert"
      :title="t('movies.error.season.title')"
      :description="t('movies.error.season.description')"
    >
      <Button @click="$emit('back')">
        <template #left><ArrowLeft aria-hidden="true" /></template>
        {{ t("movies.action.back") }}
      </Button>
    </EmptyState>

    <article v-else-if="detail && season" class="movies-season__content">
      <header class="movies-season__hero">
        <span class="movies-season__poster-shell">
          <img
            v-if="heroImageUrl"
            class="movies-season__poster"
            :src="heroImageUrl"
            :alt="heading"
            loading="eager"
            decoding="async"
          />
          <span v-else class="movies-season__poster" aria-hidden="true" />
        </span>

        <div class="movies-season__intro">
          <p class="movies-season__eyebrow">{{ detail.name }}</p>
          <h1>{{ heading }}</h1>
          <p v-if="meta" class="movies-season__subtitle">{{ meta }}</p>
          <p v-if="season.overview" class="movies-season__overview">{{ season.overview }}</p>
        </div>
      </header>

      <section class="movies-season__section">
        <span class="movies-season__section-heading">
          <h2>{{ t("movies.section.episodes") }}</h2>
          <p v-if="season.episodes.length > 0">
            {{ episodeCountLabel(season.episodes.length, t) }}
          </p>
        </span>
        <p v-if="season.episodes.length === 0" class="movies-season__muted">
          {{ t("movies.section.noEpisodes") }}
        </p>
        <EpisodeList v-else show-meta :episodes="season.episodes" @open="openEpisode" />
      </section>

      <DetailPeopleSection
        :title="t('movies.section.seriesCast')"
        :people="detail.cast"
        @open-person="$emit('open-person', $event)"
      />
    </article>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-season {
  block-size: 100%;
  background: var(--movies-surface-bg, var(--color-bg));
  position: relative;
}

.movies-season__status {
  box-sizing: border-box;
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    auto 0;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding-inline: var(--movies-content-outer-padding-inline, var(--space-md));
}

.movies-season__content {
  box-sizing: border-box;
  display: grid;
  gap: var(--space-xl);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--movies-content-outer-padding-inline, var(--space-lg)) clamp(var(--space-xl), 10vh, 96px);
}

.movies-season__hero {
  align-items: end;
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: minmax(180px, 300px) minmax(0, 1fr);
}

.movies-season__poster-shell {
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  display: block;
  inline-size: 100%;
  overflow: hidden;
}

.movies-season__poster {
  aspect-ratio: 2 / 3;
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
}

.movies-season__intro {
  display: grid;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.movies-season__eyebrow,
.movies-season__subtitle,
.movies-season__section-heading p,
.movies-season__muted {
  color: var(--color-fg-muted);
  margin: 0;
}

.movies-season__eyebrow {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-season__intro h1 {
  font-size: var(--font-size-2xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-season__overview {
  line-height: var(--leading-relaxed);
  margin: 0;
  max-inline-size: 78ch;
}

.movies-season__section {
  display: grid;
  gap: var(--space-md);
}

.movies-season__section h2,
.movies-season__section-heading {
  margin: 0;
}

.movies-season__section h2 {
  font-size: var(--font-size-xl);
  line-height: var(--leading-tight);
}

.movies-season__section-heading {
  display: grid;
  gap: var(--space-2xs);
}

@media (max-width: 760px) {
  .movies-season__hero {
    align-items: start;
    grid-template-columns: minmax(0, 180px) minmax(0, 1fr);
  }
}

@media (max-width: 620px) {
  .movies-season__hero {
    grid-template-columns: 1fr;
  }

  .movies-season__poster-shell {
    max-inline-size: 220px;
  }
}
</style>
