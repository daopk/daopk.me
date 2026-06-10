<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea, StatusBanner } from "@daopk/kit";
import { Button } from "@daopk/ui";

import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import MovieCard from "./MovieCard.vue";
import {
  DEFAULT_MOVIES_LIST_LIMIT,
  fetchMoviesFilters,
  fetchMoviesList,
  listTitleForQuery,
  SEARCH_MEDIA_LABELS,
  type MovieMediaType,
  type MovieSummary,
  type MoviesFiltersResult,
  type MoviesListQuery,
  type MoviesListSort,
  type MoviesPagination,
  type MoviesSearchMedia,
} from "../moviesApi";

type LoadState = "idle" | "loading" | "ready" | "error";
type FilterLoadState = "idle" | "loading" | "ready" | "error";

const CATALOG_MEDIA_OPTIONS: readonly {
  readonly label: string;
  readonly value: MoviesSearchMedia;
}[] = [
  { label: "All", value: "all" },
  { label: "Movies", value: "movie" },
  { label: "TV Shows", value: "tv" },
];
const POPULAR_COUNTRY_CODES = [
  "VN",
  "US",
  "KR",
  "JP",
  "CN",
  "GB",
  "FR",
  "DE",
  "IN",
  "TH",
  "HK",
  "TW",
] as const;
const POPULAR_COUNTRY_CODE_SET = new Set<string>(POPULAR_COUNTRY_CODES);

interface ListViewProps {
  query: MoviesListQuery;
}

const props = defineProps<ListViewProps>();

const emit = defineEmits<{
  "open-detail": [movie: MovieSummary];
  "open-list": [query: MoviesListQuery];
}>();

const items = ref<readonly MovieSummary[]>([]);
const pagination = ref<MoviesPagination | null>(null);
const state = ref<LoadState>("idle");
const filtersByMedia = ref<Record<MovieMediaType, MoviesFiltersResult | null>>({
  movie: null,
  tv: null,
});
const filterStateByMedia = ref<Record<MovieMediaType, FilterLoadState>>({
  movie: "idle",
  tv: "idle",
});
const genreSelect = ref<HTMLSelectElement | null>(null);
const countrySelect = ref<HTMLSelectElement | null>(null);
let abortController: AbortController | null = null;
const filtersAbortControllers: Record<MovieMediaType, AbortController | null> = {
  movie: null,
  tv: null,
};

const title = computed(() => listTitleForQuery(props.query));
const activeSearchMedia = computed(() => props.query.media ?? "all");
const searchMediaTabs = Object.entries(SEARCH_MEDIA_LABELS) as Array<[MoviesSearchMedia, string]>;
const isSearchList = computed(() => (props.query.keyword?.trim().length ?? 0) > 0);
const catalogMedia = computed<MoviesSearchMedia>(() => catalogMediaForQuery(props.query));
const combinedFilters = computed<MoviesFiltersResult | null>(() =>
  combineFilters(filtersByMedia.value.movie, filtersByMedia.value.tv),
);
const currentFilters = computed(() =>
  catalogMedia.value === "all" ? combinedFilters.value : filtersByMedia.value[catalogMedia.value],
);
const currentFilterState = computed<FilterLoadState>(() =>
  filterStateForCatalogMedia(catalogMedia.value),
);
const activeGenreValue = computed(() => (props.query.genre ?? "").toString());
const activeCountry = computed(() => props.query.country ?? "");
const activeSort = computed<MoviesListSort>(() => props.query.sort ?? "popular");
const popularCountries = computed(() => {
  const countries = currentFilters.value?.countries ?? [];
  const countriesByCode = new Map(countries.map((country) => [country.code, country]));
  const selectedCountry = activeCountry.value.trim().toUpperCase();
  const selectedNonPopularCountry =
    selectedCountry.length > 0 && !POPULAR_COUNTRY_CODE_SET.has(selectedCountry)
      ? countriesByCode.get(selectedCountry)
      : undefined;

  return [
    ...POPULAR_COUNTRY_CODES.flatMap((code) => {
      const country = countriesByCode.get(code);
      return country === undefined ? [] : [country];
    }),
    ...(selectedNonPopularCountry === undefined ? [] : [selectedNonPopularCountry]),
  ];
});
const loadingInitial = computed(() => state.value === "loading" && items.value.length === 0);
const canLoadMore = computed(
  () =>
    state.value !== "loading" &&
    pagination.value !== null &&
    pagination.value.currentPage < pagination.value.totalPages,
);

watch(
  () => [catalogMedia.value, isSearchList.value] as const,
  ([media, searching]) => {
    if (!searching) {
      void ensureFiltersForCatalogMedia(media);
    }
  },
  { immediate: true },
);

watch(
  () => props.query.filterFocus,
  (filterFocus) => {
    if (!isSearchList.value) {
      void focusRequestedFilter(filterFocus);
    }
  },
  { immediate: true },
);

watch(
  () => props.query,
  () => {
    void loadFirstPage();
  },
  { immediate: true, deep: true },
);

onUnmounted(() => {
  abortController?.abort();
  filtersAbortControllers.movie?.abort();
  filtersAbortControllers.tv?.abort();
});

async function ensureFiltersForMedia(media: MovieMediaType): Promise<void> {
  const state = filterStateByMedia.value[media];
  if (state === "loading" || state === "ready") {
    return;
  }

  filtersAbortControllers[media]?.abort();
  const filtersAbortController = new AbortController();
  filtersAbortControllers[media] = filtersAbortController;
  filterStateByMedia.value = { ...filterStateByMedia.value, [media]: "loading" };
  try {
    const filters = await fetchMoviesFilters(media, { signal: filtersAbortController.signal });
    filtersByMedia.value = { ...filtersByMedia.value, [media]: filters };
    filterStateByMedia.value = { ...filterStateByMedia.value, [media]: "ready" };
  } catch {
    if (!filtersAbortController.signal.aborted) {
      filterStateByMedia.value = { ...filterStateByMedia.value, [media]: "error" };
    }
  }
}

async function ensureFiltersForCatalogMedia(media: MoviesSearchMedia): Promise<void> {
  if (media === "all") {
    await Promise.all([ensureFiltersForMedia("movie"), ensureFiltersForMedia("tv")]);
    return;
  }

  await ensureFiltersForMedia(media);
}

async function loadFirstPage(): Promise<void> {
  abortController?.abort();
  abortController = new AbortController();
  state.value = "loading";
  items.value = [];

  try {
    const result = await fetchMoviesList(
      { ...props.query, page: 1, limit: props.query.limit ?? DEFAULT_MOVIES_LIST_LIMIT },
      { signal: abortController.signal },
    );
    items.value = result.items;
    pagination.value = result.pagination;
    state.value = "ready";
  } catch {
    if (abortController.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}

async function loadMore(): Promise<void> {
  if (!canLoadMore.value || pagination.value === null) {
    return;
  }
  abortController?.abort();
  abortController = new AbortController();
  state.value = "loading";

  try {
    const result = await fetchMoviesList(
      {
        ...props.query,
        page: pagination.value.currentPage + 1,
        limit: props.query.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
      },
      { signal: abortController.signal },
    );
    items.value = [...items.value, ...result.items];
    pagination.value = result.pagination;
    state.value = "ready";
  } catch {
    if (abortController.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}

function mediaQuery(media: MoviesSearchMedia): MoviesListQuery {
  return { ...props.query, media, page: 1 };
}

function catalogQuery(next: Partial<MoviesListQuery> = {}): MoviesListQuery {
  return {
    ...(props.query.country === undefined ? {} : { country: props.query.country }),
    ...(props.query.countryName === undefined ? {} : { countryName: props.query.countryName }),
    ...(props.query.genre === undefined ? {} : { genre: props.query.genre }),
    ...(props.query.genreName === undefined ? {} : { genreName: props.query.genreName }),
    limit: props.query.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
    media: catalogMedia.value,
    page: 1,
    sort: activeSort.value,
    ...next,
  };
}

function setCatalogMedia(value: string): void {
  if (!isCatalogMedia(value)) {
    return;
  }
  const {
    genre: _genre,
    genreName: _genreName,
    filterFocus: _filterFocus,
    ...query
  } = catalogQuery({ media: value });
  emit("open-list", query);
}

function setGenre(value: string): void {
  const genreId = Number(value);
  if (!Number.isSafeInteger(genreId) || genreId <= 0) {
    const {
      genre: _genre,
      genreName: _genreName,
      filterFocus: _filterFocus,
      ...query
    } = catalogQuery();
    emit("open-list", query);
    return;
  }

  const genre = currentFilters.value?.genres.find((entry) => entry.id === genreId);
  emit(
    "open-list",
    catalogQuery({
      genre: genreId,
      ...(genre === undefined ? {} : { genreName: genre.name }),
    }),
  );
}

function setCountry(value: string): void {
  if (value.length === 0) {
    const {
      country: _country,
      countryName: _countryName,
      filterFocus: _filterFocus,
      ...query
    } = catalogQuery();
    emit("open-list", query);
    return;
  }

  const country = currentFilters.value?.countries.find((entry) => entry.code === value);
  emit(
    "open-list",
    catalogQuery({
      country: value,
      ...(country === undefined ? {} : { countryName: country.name }),
    }),
  );
}

function setSort(value: string): void {
  if (value !== "popular" && value !== "newest" && value !== "top-rated") {
    return;
  }
  emit("open-list", catalogQuery({ sort: value }));
}

async function focusRequestedFilter(filterFocus: MoviesListQuery["filterFocus"]): Promise<void> {
  if (filterFocus === undefined) {
    return;
  }
  await nextTick();
  if (filterFocus === "genre") {
    genreSelect.value?.focus({ preventScroll: true });
  } else {
    countrySelect.value?.focus({ preventScroll: true });
  }
}

function isCatalogMedia(value: string): value is MoviesSearchMedia {
  return value === "all" || value === "movie" || value === "tv";
}

function catalogMediaForQuery(query: MoviesListQuery): MoviesSearchMedia {
  if (query.media === "all" || query.media === "movie" || query.media === "tv") {
    return query.media;
  }
  return query.kind === "trending-tv" ? "tv" : "movie";
}

function filterStateForCatalogMedia(media: MoviesSearchMedia): FilterLoadState {
  if (media !== "all") {
    return filterStateByMedia.value[media];
  }

  const states = Object.values(filterStateByMedia.value);
  if (states.includes("error")) {
    return "error";
  }
  if (states.includes("idle") || states.includes("loading")) {
    return "loading";
  }
  return "ready";
}

function combineFilters(
  movieFilters: MoviesFiltersResult | null,
  tvFilters: MoviesFiltersResult | null,
): MoviesFiltersResult | null {
  if (movieFilters === null && tvFilters === null) {
    return null;
  }

  return {
    countries: uniqueBy(
      [...(movieFilters?.countries ?? []), ...(tvFilters?.countries ?? [])],
      (country) => country.code,
    ),
    genres: uniqueBy([...(movieFilters?.genres ?? []), ...(tvFilters?.genres ?? [])], (genre) =>
      String(genre.id),
    ),
    media: "movie",
    sortOptions: movieFilters?.sortOptions ?? tvFilters?.sortOptions ?? [],
  };
}

function uniqueBy<T>(items: readonly T[], keyForItem: (item: T) => string): readonly T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyForItem(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
</script>

<template>
  <ScrollArea class="movies-list" safe-area>
    <div class="movies-list__content">
      <header class="movies-list__header">
        <h1>{{ title }}</h1>
        <div v-if="!query.keyword" class="movies-list__filters" aria-label="Catalog filters">
          <label class="movies-list__filter-field">
            <span>Type</span>
            <select
              :value="catalogMedia"
              aria-label="Type"
              @change="setCatalogMedia(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="option in CATALOG_MEDIA_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="movies-list__filter-field">
            <span>Genre</span>
            <select
              ref="genreSelect"
              :value="activeGenreValue"
              aria-label="Genre"
              :disabled="currentFilterState === 'loading' || currentFilterState === 'error'"
              @change="setGenre(($event.target as HTMLSelectElement).value)"
            >
              <option value="">All genres</option>
              <option
                v-for="genre in currentFilters?.genres ?? []"
                :key="genre.id"
                :value="genre.id"
              >
                {{ genre.name }}
              </option>
            </select>
          </label>

          <label class="movies-list__filter-field">
            <span>Country</span>
            <select
              ref="countrySelect"
              :value="activeCountry"
              aria-label="Country"
              :disabled="currentFilterState === 'loading' || currentFilterState === 'error'"
              @change="setCountry(($event.target as HTMLSelectElement).value)"
            >
              <option value="">All countries</option>
              <option v-for="country in popularCountries" :key="country.code" :value="country.code">
                {{ country.name }}
              </option>
            </select>
          </label>

          <label class="movies-list__filter-field">
            <span>Sort</span>
            <select
              :value="activeSort"
              aria-label="Sort"
              @change="setSort(($event.target as HTMLSelectElement).value)"
            >
              <option value="popular">Popular</option>
              <option value="newest">Newest</option>
              <option value="top-rated">Top Rated</option>
            </select>
          </label>
        </div>
        <StatusBanner v-if="!query.keyword && currentFilterState === 'error'" tone="warning">
          Could not load filters. You can still browse the default list.
        </StatusBanner>
        <div v-if="query.keyword" class="movies-list__tabs" aria-label="Search media type">
          <Button
            v-for="[media, label] in searchMediaTabs"
            :key="media"
            size="sm"
            :variant="activeSearchMedia === media ? 'primary' : 'secondary'"
            @click="$emit('open-list', mediaQuery(media))"
          >
            {{ label }}
          </Button>
        </div>
      </header>

      <MoviesLoadingOverlay v-if="loadingInitial" />
      <StatusBanner v-else-if="state === 'error'" tone="error" role="alert">
        Could not load titles. Try again.
      </StatusBanner>

      <EmptyState
        v-else-if="state === 'ready' && items.length === 0"
        title="No titles found"
        description="Try another keyword or filter."
      />

      <template v-else>
        <ul class="movies-list__grid">
          <li v-for="movie in items" :key="movie.id" class="movies-list__item">
            <MovieCard :movie="movie" @open="$emit('open-detail', $event)" />
          </li>
        </ul>

        <div class="movies-list__footer">
          <Button
            v-if="canLoadMore"
            class="movies-list__load-more"
            size="sm"
            :loading="state === 'loading'"
            @click="loadMore"
          >
            Load more
          </Button>
        </div>
      </template>
    </div>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-list {
  block-size: 100%;
  background: var(--movies-surface-bg, var(--color-bg));
  padding: calc(
      var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl))) +
        var(--space-xl)
    )
    var(--movies-content-outer-padding-inline, clamp(var(--space-xl), 5vw, 64px))
    clamp(var(--space-xl), 10vh, 96px);
  position: relative;
}

.movies-list__content {
  display: grid;
  gap: var(--space-lg);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--movies-content-max-inline-size, 1296px);
}

.movies-list__header {
  display: grid;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.movies-list__header h1 {
  font-size: var(--font-size-2xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-list__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.movies-list__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.movies-list__filters {
  align-items: end;
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: minmax(120px, 0.72fr) minmax(160px, 1fr) minmax(220px, 1.4fr) minmax(
      140px,
      0.8fr
    );
}

.movies-list__filter-field {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.movies-list__filter-field span {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-list__filter-field select {
  appearance: none;
  background:
    linear-gradient(45deg, transparent 50%, currentColor 50%) calc(100% - 15px) 50% / 5px 5px
      no-repeat,
    linear-gradient(135deg, currentColor 50%, transparent 50%) calc(100% - 10px) 50% / 5px 5px
      no-repeat,
    color-mix(in srgb, var(--color-bg-elevated) 56%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  font: inherit;
  min-block-size: var(--control-height-md);
  min-inline-size: 0;
  padding: 0 calc(var(--space-xl) + var(--space-xs)) 0 var(--space-sm);
}

.movies-list__filter-field select:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-accent) 52%, transparent);
  outline-offset: 2px;
}

.movies-list__item {
  min-inline-size: 0;
}

.movies-list__footer {
  display: flex;
  justify-content: center;
  min-block-size: var(--control-height-lg);
  padding-block-start: var(--space-sm);
}

.movies-list__footer :deep(.movies-list__load-more.ds-button) {
  background: color-mix(in srgb, var(--color-bg-elevated) 42%, transparent);
  border-color: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: var(--radius-full);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    0 4px 10px -10px color-mix(in srgb, black 34%, transparent);
  color: color-mix(in srgb, var(--color-fg) 76%, transparent);
  font-weight: var(--font-weight-semibold);
  min-inline-size: 132px;
  padding-inline: var(--space-lg);
}

.movies-list__footer :deep(.movies-list__load-more.ds-button:hover),
.movies-list__footer :deep(.movies-list__load-more.ds-button:focus-visible) {
  background: color-mix(in srgb, var(--color-bg-elevated) 58%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 36%, var(--color-border));
  color: var(--color-fg);
}

.movies-list__footer :deep(.movies-list__load-more.ds-button--loading) {
  opacity: 0.68;
}

@media (max-width: 980px) {
  .movies-list__filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .movies-list__filters {
    grid-template-columns: 1fr;
  }
}
</style>
