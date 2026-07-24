<script setup vapor lang="ts">
import { computed } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { AspectRatio, Button } from "@daopk/ui";
import ArrowLeft from "~icons/lucide/arrow-left";
import Layers2 from "~icons/lucide/layers-2";
import Play from "~icons/lucide/play";

import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import SeasonEpisodesSection from "./SeasonEpisodesSection.vue";
import DetailPeopleSection from "./detail/DetailPeopleSection.vue";
import { episodeLabel, episodeMetaLabel, seasonLabel } from "./detail/detailFormatters";
import { moviesText } from "../i18n/labels";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import {
  type MovieEpisodeTarget,
  type MoviePersonCredit,
  type MovieSeasonEpisode,
  type MovieSummary,
} from "../moviesApi";
import { useMoviesContent } from "../moviesContent";

interface EpisodeViewProps {
  episodeNumber: number;
  seasonNumber: number;
  slug: string;
  tmdbId: number;
}

const props = defineProps<EpisodeViewProps>();

const emit = defineEmits<{
  back: [];
  "open-detail": [movie: MovieSummary];
  "open-episode": [request: MovieEpisodeTarget];
  "open-person": [person: MoviePersonCredit];
  watch: [request: MovieEpisodeTarget];
}>();

const { t } = useMoviesI18n();
const resource = useMoviesContent(
  () =>
    ({
      episodeNumber: props.episodeNumber,
      kind: "episode",
      seasonNumber: props.seasonNumber,
      tmdbId: props.tmdbId,
    }) as const,
);
const episodeDetail = computed(() => resource.content.value?.detail ?? null);
const { state } = resource;

const detail = computed(() => episodeDetail.value?.series ?? null);
const season = computed(() => episodeDetail.value?.season ?? null);
const episode = computed<MovieSeasonEpisode | null>(() => episodeDetail.value?.episode ?? null);
const heroImageUrl = computed(() => episode.value?.stillUrl || detail.value?.backdropUrl || "");
const canChooseAnotherSeason = computed(() => {
  const currentDetail = detail.value;
  if (currentDetail === null) {
    return false;
  }

  return currentDetail.seasons.some((entry) => entry.seasonNumber !== props.seasonNumber);
});
const facts = computed(() => {
  const currentEpisode = episode.value;
  const currentSeason = season.value;
  if (currentEpisode === null || currentSeason === null) {
    return [];
  }

  return [
    { label: t("movies.section.season"), value: seasonLabel(currentSeason, t) },
    { label: t("movies.section.episode"), value: String(currentEpisode.episodeNumber) },
    { label: t("movies.section.airDate"), value: currentEpisode.airDate },
    {
      label: t("movies.section.runtime"),
      value:
        currentEpisode.runtime === null
          ? ""
          : moviesText(t, "movies.format.minute.short", "{count} min", {
              count: currentEpisode.runtime,
            }),
    },
    {
      label: t("movies.section.rating"),
      value: currentEpisode.rating === null ? "" : currentEpisode.rating.toFixed(1),
    },
  ].filter((fact) => fact.value.length > 0);
});

function openSeasonEpisode(nextEpisode: MovieSeasonEpisode): void {
  emit("open-episode", {
    episodeNumber: nextEpisode.episodeNumber,
    seasonNumber: nextEpisode.seasonNumber,
    slug: detail.value?.slug ?? props.slug,
    tmdbId: props.tmdbId,
  });
}

function watchEpisode(): void {
  const currentDetail = detail.value;
  const currentEpisode = episode.value;
  if (currentEpisode === null || currentEpisode.play === null) {
    return;
  }

  emit("watch", {
    episodeNumber: currentEpisode.episodeNumber,
    seasonNumber: currentEpisode.seasonNumber,
    slug: currentDetail?.slug ?? props.slug,
    tmdbId: props.tmdbId,
  });
}

function openSeriesDetail(): void {
  const currentDetail = detail.value;
  if (currentDetail !== null) {
    emit("open-detail", currentDetail);
  }
}
</script>

<template>
  <ScrollArea class="movies-episode" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading'" />

    <EmptyState
      v-else-if="state === 'error'"
      class="movies-episode__status"
      role="alert"
      :title="t('movies.error.episode.title')"
      :description="t('movies.error.episode.description')"
    >
      <Button @click="$emit('back')">
        <template #left><ArrowLeft aria-hidden="true" /></template>
        {{ t("movies.action.back") }}
      </Button>
    </EmptyState>

    <article v-else-if="detail && season && episode" class="movies-episode__content">
      <header class="movies-episode__hero">
        <button
          v-if="episode.play !== null"
          type="button"
          class="movies-episode__media movies-episode__media--button"
          :aria-label="`${t('movies.action.play')} ${episode.name}`"
          @click="watchEpisode"
        >
          <AspectRatio :ratio="16 / 9">
            <img
              v-if="heroImageUrl"
              class="movies-episode__still"
              :src="heroImageUrl"
              :alt="episode.name"
              loading="eager"
              decoding="async"
            />
            <span v-else class="movies-episode__still" aria-hidden="true" />
          </AspectRatio>
          <span class="movies-episode__play-overlay" aria-hidden="true">
            <Play />
          </span>
        </button>
        <AspectRatio v-else class="movies-episode__media" :ratio="16 / 9">
          <img
            v-if="heroImageUrl"
            class="movies-episode__still"
            :src="heroImageUrl"
            :alt="episode.name"
            loading="eager"
            decoding="async"
          />
          <span v-else class="movies-episode__still" aria-hidden="true" />
        </AspectRatio>

        <div class="movies-episode__intro">
          <p class="movies-episode__eyebrow">{{ detail.name }} · {{ seasonLabel(season, t) }}</p>
          <h1>{{ episode.name }}</h1>
          <p v-if="episodeMetaLabel(episode, t)" class="movies-episode__subtitle">
            {{ episodeLabel(episode, t) }} · {{ episodeMetaLabel(episode, t) }}
          </p>
          <p v-else class="movies-episode__subtitle">{{ episodeLabel(episode, t) }}</p>
          <p v-if="episode.overview" class="movies-episode__overview">{{ episode.overview }}</p>
          <Button
            v-if="canChooseAnotherSeason"
            class="movies-episode__series-link"
            size="sm"
            variant="surface"
            @click="openSeriesDetail"
          >
            <template #left><Layers2 aria-hidden="true" /></template>
            {{ t("movies.action.seriesOverview") }}
          </Button>
        </div>
      </header>

      <section v-if="facts.length > 0" class="movies-episode__section">
        <h2>{{ t("movies.section.episodeDetails") }}</h2>
        <dl class="movies-episode__facts">
          <div v-for="fact in facts" :key="fact.label">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </div>
        </dl>
      </section>

      <SeasonEpisodesSection
        class="movies-episode__section"
        heading-size="xl"
        show-overview
        :active-episode-number="episode.episodeNumber"
        :initial-season="season"
        :series="detail"
        :tmdb-id="props.tmdbId"
        @open="openSeasonEpisode"
      />

      <DetailPeopleSection
        :title="t('movies.section.seriesCast')"
        :people="detail.cast"
        @open-person="$emit('open-person', $event)"
      />
    </article>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-episode {
  block-size: 100%;
  background: var(--movies-surface-bg, var(--color-bg));
  position: relative;
}

.movies-episode__status {
  box-sizing: border-box;
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    auto 0;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding-inline: var(--movies-content-outer-padding-inline, var(--space-md));
}

.movies-episode__content {
  box-sizing: border-box;
  display: grid;
  gap: var(--space-xl);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--movies-content-outer-padding-inline, var(--space-lg)) clamp(var(--space-xl), 10vh, 96px);
}

.movies-episode__hero {
  align-items: end;
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: minmax(260px, 560px) minmax(0, 1fr);
}

.movies-episode__media {
  background: transparent;
  border: 0;
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  color: inherit;
  display: block;
  inline-size: 100%;
  overflow: hidden;
  padding: 0;
  position: relative;
}

.movies-episode__media--button {
  cursor: pointer;
}

.movies-episode__media--button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
}

.movies-episode__still {
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
  transition:
    filter var(--duration-fast) var(--ease),
    transform var(--duration-base) var(--ease);
}

.movies-episode__media--button:hover .movies-episode__still,
.movies-episode__media--button:focus-visible .movies-episode__still {
  filter: brightness(0.72);
  transform: scale(1.03);
}

.movies-episode__play-overlay {
  align-items: center;
  backdrop-filter: blur(14px);
  background: rgb(8 9 13 / 66%);
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: var(--radius-full);
  block-size: 56px;
  color: #fff;
  display: inline-flex;
  inline-size: 56px;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  justify-content: center;
  position: absolute;
  transform: translate(-50%, -50%);
}

.movies-episode__play-overlay svg {
  block-size: 22px;
  inline-size: 22px;
  margin-inline-start: 2px;
}

.movies-episode__intro {
  display: grid;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.movies-episode__eyebrow,
.movies-episode__subtitle {
  color: var(--color-fg-muted);
  margin: 0;
}

.movies-episode__eyebrow {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-episode__intro h1 {
  font-size: var(--font-size-2xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-episode__overview {
  line-height: var(--leading-relaxed);
  margin: 0;
  max-inline-size: 78ch;
}

.movies-episode__series-link {
  justify-self: start;
  margin-block-start: var(--space-xs);
}

.movies-episode__section {
  display: grid;
  gap: var(--space-md);
}

.movies-episode__section h2,
.movies-episode__section-heading {
  margin: 0;
}

.movies-episode__section h2 {
  font-size: var(--font-size-xl);
  line-height: var(--leading-tight);
}

.movies-episode__section-heading {
  display: grid;
  gap: var(--space-2xs);
}

.movies-episode__facts {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin: 0;
}

.movies-episode__facts div {
  border-block-start: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  display: grid;
  gap: var(--space-2xs);
  padding-block-start: var(--space-sm);
}

.movies-episode__facts dt {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
}

.movies-episode__facts dd {
  font-weight: var(--font-weight-semibold);
  margin: 0;
}

@media (max-width: 820px) {
  .movies-episode__hero {
    align-items: start;
    grid-template-columns: 1fr;
  }
}
</style>
