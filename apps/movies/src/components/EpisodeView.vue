<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ArrowLeft } from "@daopk/icons";

import EpisodeList from "./EpisodeList.vue";
import MovieHlsPlayer from "./MovieHlsPlayer.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import DetailPeopleSection from "./detail/DetailPeopleSection.vue";
import {
  episodeLabel,
  episodeMetaLabel,
  seasonLabel,
  seasonMetaLabel,
} from "./detail/detailFormatters";
import {
  fetchMovieEpisode,
  type MovieEpisodeDetail,
  type MovieEpisodeTarget,
  type MoviePersonCredit,
  type MovieSeasonEpisode,
} from "../moviesApi";

type LoadState = "loading" | "ready" | "error";

interface EpisodeViewProps {
  episodeNumber: number;
  seasonNumber: number;
  slug: string;
  tmdbId: number;
}

const props = defineProps<EpisodeViewProps>();

const emit = defineEmits<{
  back: [];
  "open-episode": [request: MovieEpisodeTarget];
  "open-person": [person: MoviePersonCredit];
}>();

const episodeDetail = ref<MovieEpisodeDetail | null>(null);
const state = ref<LoadState>("loading");
let abortController: AbortController | null = null;

const detail = computed(() => episodeDetail.value?.series ?? null);
const season = computed(() => episodeDetail.value?.season ?? null);
const episode = computed<MovieSeasonEpisode | null>(() => episodeDetail.value?.episode ?? null);
const heroImageUrl = computed(() => episode.value?.stillUrl || detail.value?.backdropUrl || "");
const seasonMeta = computed(() => (season.value === null ? "" : seasonMetaLabel(season.value)));
const facts = computed(() => {
  const currentEpisode = episode.value;
  const currentSeason = season.value;
  if (currentEpisode === null || currentSeason === null) {
    return [];
  }

  return [
    { label: "Season", value: seasonLabel(currentSeason) },
    { label: "Episode", value: String(currentEpisode.episodeNumber) },
    { label: "Air Date", value: currentEpisode.airDate },
    {
      label: "Runtime",
      value: currentEpisode.runtime === null ? "" : `${currentEpisode.runtime} min`,
    },
    {
      label: "Rating",
      value: currentEpisode.rating === null ? "" : currentEpisode.rating.toFixed(1),
    },
  ].filter((fact) => fact.value.length > 0);
});

watch(
  () => [props.tmdbId, props.seasonNumber, props.episodeNumber] as const,
  () => {
    void loadEpisode();
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
});

function openSeasonEpisode(nextEpisode: MovieSeasonEpisode): void {
  emit("open-episode", {
    episodeNumber: nextEpisode.episodeNumber,
    seasonNumber: nextEpisode.seasonNumber,
    slug: detail.value?.slug ?? props.slug,
    tmdbId: props.tmdbId,
  });
}

async function loadEpisode(): Promise<void> {
  abortController?.abort();
  abortController = new AbortController();
  state.value = "loading";
  episodeDetail.value = null;

  try {
    episodeDetail.value = await fetchMovieEpisode(
      props.tmdbId,
      props.seasonNumber,
      props.episodeNumber,
      { signal: abortController.signal },
    );
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
  <ScrollArea class="movies-episode" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading'" />

    <EmptyState
      v-else-if="state === 'error'"
      class="movies-episode__status"
      role="alert"
      title="Could not load episode"
      description="Go back and try another episode."
    >
      <Button :icon-start="ArrowLeft" @click="$emit('back')">Back</Button>
    </EmptyState>

    <article v-else-if="detail && season && episode" class="movies-episode__content">
      <header class="movies-episode__hero">
        <MovieHlsPlayer
          v-if="episode.play !== null"
          class="movies-episode__player"
          :play="episode.play"
          :poster-url="heroImageUrl"
          :title="`${detail.name} - ${episode.name}`"
        />
        <img
          v-else-if="heroImageUrl"
          class="movies-episode__still"
          :src="heroImageUrl"
          :alt="episode.name"
          loading="eager"
          decoding="async"
        />
        <span v-else class="movies-episode__still" aria-hidden="true" />

        <div class="movies-episode__intro">
          <p class="movies-episode__eyebrow">{{ detail.name }} · {{ seasonLabel(season) }}</p>
          <h1>{{ episode.name }}</h1>
          <p v-if="episodeMetaLabel(episode)" class="movies-episode__subtitle">
            {{ episodeLabel(episode) }} · {{ episodeMetaLabel(episode) }}
          </p>
          <p v-else class="movies-episode__subtitle">{{ episodeLabel(episode) }}</p>
          <p v-if="episode.overview" class="movies-episode__overview">{{ episode.overview }}</p>
        </div>
      </header>

      <section v-if="facts.length > 0" class="movies-episode__section">
        <h2>Episode Details</h2>
        <dl class="movies-episode__facts">
          <div v-for="fact in facts" :key="fact.label">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="movies-episode__section">
        <span class="movies-episode__section-heading">
          <h2>{{ season.name }}</h2>
          <p v-if="seasonMeta">{{ seasonMeta }}</p>
        </span>
        <p v-if="season.overview" class="movies-episode__season-overview">
          {{ season.overview }}
        </p>
        <EpisodeList
          :episodes="season.episodes"
          :active-episode-number="episode.episodeNumber"
          @open="openSeasonEpisode"
        />
      </section>

      <DetailPeopleSection
        title="Series Cast"
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
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--space-md) 0;
}

.movies-episode__content {
  display: grid;
  gap: var(--space-xl);
  margin-inline: auto;
  max-inline-size: 1100px;
  padding: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--space-lg) clamp(var(--space-xl), 10vh, 96px);
}

.movies-episode__hero {
  align-items: end;
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: minmax(260px, 560px) minmax(0, 1fr);
}

.movies-episode__still {
  aspect-ratio: 16 / 9;
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  inline-size: 100%;
  object-fit: cover;
}

.movies-episode__player {
  inline-size: 100%;
}

.movies-episode__intro {
  display: grid;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.movies-episode__eyebrow,
.movies-episode__subtitle,
.movies-episode__section-heading p {
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

.movies-episode__overview,
.movies-episode__season-overview {
  line-height: var(--leading-relaxed);
  margin: 0;
  max-inline-size: 78ch;
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

@media (max-width: 700px) {
  .movies-episode__content {
    padding-inline: var(--space-md);
  }
}
</style>
