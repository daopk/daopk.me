<script setup vapor lang="ts">
import { computed, ref, watch } from "vue";

import { Select, type SelectOption } from "@daopk/ui";

import { type MovieDetail, type MovieSeasonDetail, type MovieSeasonEpisode } from "../moviesApi";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import { useMoviesContent, type MoviesContentState } from "../moviesContent";
import EpisodeList from "./EpisodeList.vue";
import { seasonLabel, seasonMetaLabel } from "./detail/detailFormatters";

interface SeasonEpisodesSectionProps {
  activeEpisodeNumber?: number | null;
  ariaLabel?: string;
  headingSize?: "lg" | "xl";
  initialSeason: MovieSeasonDetail;
  series: MovieDetail;
  showOverview?: boolean;
  tmdbId: number;
}

const props = withDefaults(defineProps<SeasonEpisodesSectionProps>(), {
  activeEpisodeNumber: null,
  ariaLabel: undefined,
  headingSize: "lg",
  showOverview: false,
});

const emit = defineEmits<{
  open: [episode: MovieSeasonEpisode];
}>();

const selectedSeasonNumber = ref("");
const { t } = useMoviesI18n();
const selectedSeasonValue = computed(() => {
  if (selectedSeasonNumber.value === "") return null;
  const value = Number(selectedSeasonNumber.value);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
});
const resource = useMoviesContent(() => {
  const seasonNumber = selectedSeasonValue.value;
  if (seasonNumber === null || seasonNumber === props.initialSeason.seasonNumber) {
    return null;
  }
  return {
    kind: "season-episodes",
    seasonNumber,
    tmdbId: props.tmdbId,
  } as const;
});
const selectedSeasonDetail = computed<MovieSeasonDetail | null>(() => {
  if (selectedSeasonValue.value === props.initialSeason.seasonNumber) {
    return props.initialSeason;
  }
  return resource.content.value?.season ?? null;
});
const episodesState = computed<MoviesContentState>(() =>
  selectedSeasonValue.value === props.initialSeason.seasonNumber ? "ready" : resource.state.value,
);

const selectedSeason = computed(() => {
  return (
    selectedSeasonDetail.value ??
    props.series.seasons.find(
      (season) => String(season.seasonNumber) === selectedSeasonNumber.value,
    ) ??
    null
  );
});
const selectedSeasonLabel = computed(() => {
  const currentSeason = selectedSeason.value;
  return currentSeason === null ? t("movies.section.episode") : seasonLabel(currentSeason, t);
});
const selectedSeasonMeta = computed(() => {
  const currentSeason = selectedSeason.value;
  return currentSeason === null ? "" : seasonMetaLabel(currentSeason, t);
});
const selectedSeasonOverview = computed(() =>
  props.showOverview ? (selectedSeason.value?.overview ?? "") : "",
);
const seasonOptions = computed<SelectOption[]>(() =>
  [...props.series.seasons]
    .sort((left, right) => left.seasonNumber - right.seasonNumber)
    .map((season) => ({
      label: seasonLabel(season, t),
      value: String(season.seasonNumber),
    })),
);
const showSeasonPicker = computed(() => seasonOptions.value.length > 1);
const activeEpisodeNumber = computed(() =>
  selectedSeasonNumber.value === String(props.initialSeason.seasonNumber)
    ? props.activeEpisodeNumber
    : null,
);
const episodes = computed(() => selectedSeasonDetail.value?.episodes ?? []);
const sectionAriaLabel = computed(() => props.ariaLabel ?? t("movies.section.episode"));

watch(
  () => [props.tmdbId, props.initialSeason] as const,
  () => {
    selectedSeasonNumber.value = String(props.initialSeason.seasonNumber);
  },
  { immediate: true },
);

function selectSeason(value: string | number | null): void {
  if (value === null) return;
  selectedSeasonNumber.value = String(value);
}
</script>

<template>
  <section
    class="movies-season-episodes"
    :class="`movies-season-episodes--heading-${headingSize}`"
    :aria-label="sectionAriaLabel"
  >
    <div class="movies-season-episodes__heading">
      <span>
        <Select
          v-if="showSeasonPicker"
          class="movies-season-episodes__season-select"
          :ariaLabel="t('movies.action.chooseAnotherSeason')"
          :model-value="selectedSeasonNumber"
          :options="seasonOptions"
          @update:model-value="selectSeason"
        />
        <h2 v-else>{{ selectedSeasonLabel }}</h2>
        <p
          v-if="selectedSeasonMeta"
          :class="{ 'movies-season-episodes__meta--after-select': showSeasonPicker }"
        >
          {{ selectedSeasonMeta }}
        </p>
      </span>
    </div>

    <p v-if="selectedSeasonOverview" class="movies-season-episodes__overview">
      {{ selectedSeasonOverview }}
    </p>
    <p v-if="episodesState === 'loading'" class="movies-season-episodes__muted">
      {{ t("movies.section.loadingEpisodes") }}
    </p>
    <p v-else-if="episodesState === 'error'" class="movies-season-episodes__muted" role="alert">
      {{ t("movies.error.episodes") }}
    </p>
    <p
      v-else-if="selectedSeasonDetail !== null && episodes.length === 0"
      class="movies-season-episodes__muted"
    >
      {{ t("movies.section.noEpisodes") }}
    </p>
    <EpisodeList
      v-else-if="selectedSeasonDetail !== null"
      :episodes="episodes"
      :active-episode-number="activeEpisodeNumber"
      @open="emit('open', $event)"
    />
  </section>
</template>

<style scoped lang="scss">
.movies-season-episodes {
  display: grid;
  gap: var(--space-md);
}

.movies-season-episodes__heading {
  display: grid;
}

.movies-season-episodes__heading > span {
  display: grid;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.movies-season-episodes__heading h2 {
  font-size: var(--font-size-lg);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-season-episodes--heading-xl .movies-season-episodes__heading h2 {
  font-size: var(--font-size-xl);
}

.movies-season-episodes__heading p,
.movies-season-episodes__muted {
  color: var(--color-fg-muted);
  margin: 0;
}

.movies-season-episodes__heading .movies-season-episodes__meta--after-select {
  margin-block-start: var(--space-sm);
}

.movies-season-episodes__overview {
  line-height: var(--leading-relaxed);
  margin: 0;
  max-inline-size: 78ch;
}

.movies-season-episodes__season-select {
  /* Match Ropav's upstream Select metrics instead of the compact WebOS token bridge. */
  --rp-font-size-md: 1rem;
  --rp-size-control-md: 42px;
  --rp-spacing-1: 0.25rem;
  --rp-spacing-2: 0.5rem;
  --rp-spacing-4: 1rem;

  max-inline-size: 220px;
}

.movies-season-episodes__season-select :deep(.rp-select__trigger),
.movies-season-episodes__season-select :deep(.rp-select__option) {
  box-sizing: content-box;
}

@media (max-width: 620px) {
  .movies-season-episodes__season-select {
    max-inline-size: none;
  }
}
</style>
