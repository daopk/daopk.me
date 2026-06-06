<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";

import { Play } from "@daopk/icons";

import {
  fetchMovieSeason,
  type MovieSeason,
  type MovieSeasonDetail,
  type MovieSeasonEpisode,
} from "../../moviesApi";
import {
  episodeLabel,
  episodeMetaLabel,
  episodeTotalLabel,
  seasonLabel,
  seasonMetaLabel,
} from "./detailFormatters";

type EpisodesState = "idle" | "loading" | "ready" | "error";

interface DetailSeasonsSectionProps {
  episodeTotal: string;
  seasons: readonly MovieSeason[];
  tmdbId: number;
}

const props = defineProps<DetailSeasonsSectionProps>();

defineEmits<{
  "open-episode": [episode: MovieSeasonEpisode];
}>();

const selectedSeason = ref("");
const seasonDetail = ref<MovieSeasonDetail | null>(null);
const episodesState = ref<EpisodesState>("idle");
const episodesSection = ref<HTMLElement | null>(null);
let abortController: AbortController | null = null;

const orderedSeasons = computed(() =>
  [...props.seasons].sort((left, right) => left.seasonNumber - right.seasonNumber),
);
const selectedSeasonNumber = computed(() => {
  const value = Number(selectedSeason.value);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
});
const activeSeason = computed(
  () =>
    seasonDetail.value ??
    orderedSeasons.value.find((season) => season.seasonNumber === selectedSeasonNumber.value) ??
    null,
);

watch(
  orderedSeasons,
  (seasons) => {
    if (seasons.length === 0) {
      selectedSeason.value = "";
      return;
    }

    const current = Number(selectedSeason.value);
    const hasCurrent = seasons.some((season) => season.seasonNumber === current);
    if (hasCurrent) {
      return;
    }

    const firstSeason = seasons.find((season) => season.seasonNumber > 0) ?? seasons[0];
    selectedSeason.value = String(firstSeason.seasonNumber);
  },
  { immediate: true },
);

watch(
  () => [props.tmdbId, selectedSeasonNumber.value] as const,
  ([, seasonNumber]) => {
    void loadSeason(seasonNumber);
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
});

function selectSeason(seasonNumber: number): void {
  selectedSeason.value = String(seasonNumber);
  void scrollEpisodesIntoView();
}

async function loadSeason(seasonNumber: number | null): Promise<void> {
  abortController?.abort();
  seasonDetail.value = null;

  if (seasonNumber === null) {
    episodesState.value = "idle";
    return;
  }

  const controller = new AbortController();
  abortController = controller;
  episodesState.value = "loading";

  try {
    seasonDetail.value = await fetchMovieSeason(props.tmdbId, seasonNumber, {
      signal: controller.signal,
    });
    episodesState.value = "ready";
  } catch {
    if (controller.signal.aborted) {
      return;
    }
    episodesState.value = "error";
  }
}

async function scrollEpisodesIntoView(): Promise<void> {
  await nextTick();

  const behavior =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";

  episodesSection.value?.scrollIntoView?.({ behavior, block: "start" });
}
</script>

<template>
  <section v-if="orderedSeasons.length > 0" class="movies-detail-section">
    <div class="movies-detail-section__heading">
      <span>
        <h2>Seasons</h2>
        <p v-if="props.episodeTotal">{{ episodeTotalLabel(props.episodeTotal) }}</p>
      </span>
    </div>

    <ul class="movies-detail-seasons">
      <li v-for="season in orderedSeasons" :key="season.id">
        <button
          type="button"
          class="movies-detail-seasons__button"
          :class="{
            'movies-detail-seasons__button--active': season.seasonNumber === selectedSeasonNumber,
          }"
          :aria-pressed="season.seasonNumber === selectedSeasonNumber"
          aria-controls="movies-detail-episodes"
          @click="selectSeason(season.seasonNumber)"
        >
          <img
            v-if="season.posterUrl"
            class="movies-detail-seasons__poster"
            :src="season.posterUrl"
            :alt="season.name"
            loading="lazy"
            decoding="async"
          />
          <span v-else class="movies-detail-seasons__poster" aria-hidden="true" />
          <span class="movies-detail-seasons__copy">
            <span class="movies-detail-section__label">{{ seasonLabel(season) }}</span>
            <strong>{{ season.name }}</strong>
            <span v-if="seasonMetaLabel(season)" class="movies-detail-section__muted">
              {{ seasonMetaLabel(season) }}
            </span>
            <span v-if="season.overview" class="movies-detail-seasons__overview">
              {{ season.overview }}
            </span>
          </span>
        </button>
      </li>
    </ul>

    <div id="movies-detail-episodes" ref="episodesSection" class="movies-detail-episodes">
      <div class="movies-detail-episodes__heading">
        <span>
          <h3>Episodes</h3>
          <p v-if="activeSeason">{{ seasonLabel(activeSeason) }}</p>
        </span>
      </div>

      <p v-if="episodesState === 'loading'" class="movies-detail-section__muted">
        Loading episodes...
      </p>
      <p v-else-if="episodesState === 'error'" class="movies-detail-section__muted" role="alert">
        Could not load episodes.
      </p>
      <p
        v-else-if="seasonDetail !== null && seasonDetail.episodes.length === 0"
        class="movies-detail-section__muted"
      >
        No episodes listed.
      </p>

      <ol v-else-if="seasonDetail !== null" class="movies-detail-episodes__list">
        <li v-for="episode in seasonDetail.episodes" :key="episode.id">
          <button
            type="button"
            class="movies-detail-episodes__button"
            @click="$emit('open-episode', episode)"
          >
            <img
              v-if="episode.stillUrl"
              class="movies-detail-episodes__still"
              :src="episode.stillUrl"
              :alt="episode.name"
              loading="lazy"
              decoding="async"
            />
            <span v-else class="movies-detail-episodes__still" aria-hidden="true" />
            <span class="movies-detail-episodes__copy">
              <span class="movies-detail-episodes__label-row">
                <span class="movies-detail-section__label">{{ episodeLabel(episode) }}</span>
                <Play
                  v-if="episode.play !== null"
                  class="movies-detail-episodes__play-indicator"
                  aria-hidden="true"
                />
              </span>
              <strong>{{ episode.name }}</strong>
              <span v-if="episodeMetaLabel(episode)" class="movies-detail-section__muted">
                {{ episodeMetaLabel(episode) }}
              </span>
              <span v-if="episode.overview" class="movies-detail-episodes__overview">
                {{ episode.overview }}
              </span>
            </span>
          </button>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped lang="scss">
.movies-detail-section {
  display: grid;
  gap: var(--space-md);
}

.movies-detail-section h2,
.movies-detail-section h3,
.movies-detail-section__heading p,
.movies-detail-episodes__heading p {
  margin: 0;
}

.movies-detail-section h2,
.movies-detail-section h3 {
  font-size: var(--font-size-xl);
  line-height: var(--leading-tight);
}

.movies-detail-section__heading {
  align-items: end;
  display: flex;
  gap: var(--space-2xs);
  justify-content: space-between;
}

.movies-detail-section__heading > span {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.movies-detail-section__heading p,
.movies-detail-section__muted {
  color: var(--color-fg-muted);
}

.movies-detail-section__label {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-detail-seasons {
  display: grid;
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
}

.movies-detail-seasons li {
  min-inline-size: 0;
}

.movies-detail-seasons__button {
  align-items: start;
  background: transparent;
  border-block-start: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  border-inline: 0;
  border-block-end: 0;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: var(--space-md);
  grid-template-columns: 72px minmax(0, 1fr);
  inline-size: 100%;
  margin: 0;
  padding-block-start: var(--space-sm);
  padding-inline: 0;
  text-align: start;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.movies-detail-seasons__button--active {
  border-block-start-color: color-mix(in srgb, var(--color-accent) 54%, transparent);
}

.movies-detail-seasons__button:hover strong,
.movies-detail-seasons__button--active strong {
  color: var(--color-accent);
}

.movies-detail-seasons__button:focus-visible {
  border-radius: 8px;
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
}

.movies-detail-seasons__poster {
  aspect-ratio: 2 / 3;
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
  inline-size: 72px;
  object-fit: cover;
}

.movies-detail-seasons__copy {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.movies-detail-seasons__overview {
  color: var(--color-fg);
  line-height: var(--leading-relaxed);
  max-inline-size: 72ch;
}

.movies-detail-episodes {
  border-block-start: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  display: grid;
  gap: var(--space-md);
  padding-block-start: var(--space-md);
  scroll-margin-block-start: max(
    0px,
    calc(
      var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl))) - var(
          --space-sm
        )
    )
  );
}

.movies-detail-episodes__heading {
  align-items: end;
  display: flex;
  justify-content: space-between;
}

.movies-detail-episodes__heading > span {
  display: grid;
  gap: var(--space-2xs);
}

.movies-detail-episodes__list {
  display: grid;
  gap: var(--space-md);
  list-style: none;
  margin: 0;
  padding: 0;
}

.movies-detail-episodes__button {
  align-items: start;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: var(--space-md);
  grid-template-columns: minmax(96px, 180px) minmax(0, 1fr);
  inline-size: 100%;
  padding: 0;
  text-align: start;
}

.movies-detail-episodes__button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.movies-detail-episodes__button:hover strong {
  color: var(--color-accent);
}

.movies-detail-episodes__still {
  aspect-ratio: 16 / 9;
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
  inline-size: 100%;
  object-fit: cover;
}

.movies-detail-episodes__copy {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.movies-detail-episodes__label-row {
  align-items: center;
  display: flex;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.movies-detail-episodes__play-indicator {
  block-size: 14px;
  color: var(--color-accent);
  flex: 0 0 auto;
  inline-size: 14px;
}

.movies-detail-episodes__overview {
  color: var(--color-fg);
  line-height: var(--leading-relaxed);
  max-inline-size: 72ch;
}

@media (max-width: 700px) {
  .movies-detail-section__heading,
  .movies-detail-episodes__heading {
    align-items: stretch;
    display: grid;
  }

  .movies-detail-seasons__select {
    inline-size: 100%;
  }

  .movies-detail-episodes__button {
    grid-template-columns: 1fr;
  }
}
</style>
