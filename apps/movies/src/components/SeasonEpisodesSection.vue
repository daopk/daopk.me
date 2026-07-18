<script setup vapor lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { Select, type SelectOption } from "@daopk/ui";

import {
  fetchMovieSeason,
  type MovieDetail,
  type MovieSeasonDetail,
  type MovieSeasonEpisode,
} from "../moviesApi";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import EpisodeList from "./EpisodeList.vue";
import { seasonLabel, seasonMetaLabel } from "./detail/detailFormatters";

type EpisodesState = "idle" | "loading" | "ready" | "error";

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

const selectedSeasonDetail = ref<MovieSeasonDetail | null>(null);
const selectedSeasonNumber = ref("");
const episodesState = ref<EpisodesState>("idle");
const { t } = useMoviesI18n();
let abortController: AbortController | null = null;

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
    abortController?.abort();
    selectedSeasonDetail.value = props.initialSeason;
    selectedSeasonNumber.value = String(props.initialSeason.seasonNumber);
    episodesState.value = "ready";
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
});

function selectSeason(value: string | number | null): void {
  if (value === null) return;
  const seasonValue = String(value);
  selectedSeasonNumber.value = seasonValue;
  const seasonNumber = Number(seasonValue);
  void loadSelectedSeason(
    Number.isSafeInteger(seasonNumber) && seasonNumber >= 0 ? seasonNumber : null,
  );
}

async function loadSelectedSeason(seasonNumber: number | null): Promise<void> {
  abortController?.abort();

  if (seasonNumber === null) {
    selectedSeasonDetail.value = null;
    episodesState.value = "idle";
    return;
  }

  if (seasonNumber === props.initialSeason.seasonNumber) {
    selectedSeasonDetail.value = props.initialSeason;
    episodesState.value = "ready";
    return;
  }

  const controller = new AbortController();
  abortController = controller;
  selectedSeasonDetail.value = null;
  episodesState.value = "loading";

  try {
    selectedSeasonDetail.value = await fetchMovieSeason(props.tmdbId, seasonNumber, {
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
