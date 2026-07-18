<script setup vapor lang="ts">
import { computed, nextTick, toRef, useTemplateRef, watch } from "vue";

import { EmptyState, ScrollArea, Spinner } from "@daopk/kit";
import Search from "~icons/lucide/search";
import { Alert, Button, Input, Select, type SelectOption } from "@daopk/ui";

import MovieCard from "./MovieCard.vue";
import MovieTrailerHoverPreview from "./MovieTrailerHoverPreview.vue";
import { countryLabel, genreLabel, sortLabel } from "../i18n/labels";
import type { MovieSummary, MoviesListQuery } from "../moviesApi";
import { useMovieTrailerPreview } from "../composables/useMovieTrailerPreview";
import { useMoviesListView } from "../composables/useMoviesListView";

interface ListViewProps {
  query: MoviesListQuery;
}

const props = defineProps<ListViewProps>();

const emit = defineEmits<{
  "open-detail": [movie: MovieSummary];
  "open-list": [query: MoviesListQuery];
}>();

const {
  anchorMode: trailerPreviewAnchorMode,
  close: closeTrailerPreview,
  closeNow: closeTrailerPreviewNow,
  enabled: trailerPreviewEnabled,
  keepOpen: keepTrailerPreviewOpen,
  movie: trailerPreviewMovie,
  move: moveTrailerPreview,
  reference: trailerPreviewReference,
  showFromFocus: showTrailerPreviewFromFocus,
  showFromPointer: showTrailerPreviewFromPointer,
  trailerCache: trailerPreviewCache,
} = useMovieTrailerPreview();

const {
  activeCountry,
  activeGenreValue,
  activeSearchMedia,
  activeSort,
  canLoadMore,
  catalogMedia,
  catalogMediaSelectOptions,
  currentFilters,
  currentFilterState,
  isSearchList,
  items,
  loadingInitial,
  loadingMore,
  loadMore,
  mediaQuery,
  popularCountries,
  searchDraft,
  searchMediaOptions,
  setCatalogMedia,
  setCountry,
  setGenre,
  setSort,
  state,
  submitSearchKeyword,
  t,
  title,
} = useMoviesListView({
  openList,
  query: toRef(props, "query"),
});

const catalogOptions = computed<SelectOption[]>(() =>
  catalogMediaSelectOptions.value.map((option) => ({ ...option })),
);
const genreOptions = computed<SelectOption[]>(() => [
  { label: t("movies.filters.allGenres"), value: "" },
  ...(currentFilters.value?.genres.map((genre) => ({
    label: genreLabel(genre, t),
    value: String(genre.id),
  })) ?? []),
]);
const countryOptions = computed<SelectOption[]>(() => [
  { label: t("movies.filters.allCountries"), value: "" },
  ...popularCountries.value.map((country) => ({
    label: countryLabel(country, t),
    value: country.code,
  })),
]);
const sortOptions = computed<SelectOption[]>(() => [
  { label: sortLabel("popular", t), value: "popular" },
  { label: sortLabel("newest", t), value: "newest" },
  { label: sortLabel("top-rated", t), value: "top-rated" },
]);
const resultsElement = useTemplateRef<HTMLElement>("resultsElement");

// Vue Vapor beta can lose its render context when this attribute updates inside ScrollArea.
watch(
  () => [resultsElement.value, loadingInitial.value] as const,
  ([element, loading]) => {
    element?.setAttribute("aria-busy", loading ? "true" : "false");
  },
  { flush: "post", immediate: true },
);

function updateStringValue(value: string | number | null, update: (value: string) => void): void {
  if (value !== null) update(String(value));
}

async function closeTrailerPreviewBeforeNavigation(): Promise<void> {
  closeTrailerPreviewNow();
  await nextTick();
}

async function openDetail(movie: MovieSummary): Promise<void> {
  await closeTrailerPreviewBeforeNavigation();
  emit("open-detail", movie);
}

async function openList(query: MoviesListQuery): Promise<void> {
  await closeTrailerPreviewBeforeNavigation();
  emit("open-list", query);
}
</script>

<template>
  <ScrollArea class="movies-list" safe-area>
    <div class="movies-list__content">
      <header class="movies-list__header">
        <h1 id="movies-list-title">{{ title }}</h1>
        <div
          v-if="isSearchList"
          class="movies-list__search-panel"
          role="group"
          aria-labelledby="movies-list-title"
        >
          <form
            class="movies-list__search-form"
            role="search"
            @submit.prevent="submitSearchKeyword"
          >
            <Input
              v-model="searchDraft"
              class="movies-list__search-input-root"
              type="text"
              size="lg"
              radius="xl"
              :ariaLabel="t('movies.search.keyword.ariaLabel')"
              :placeholder="t('movies.search.titlesPlaceholder')"
              :input-attrs="{
                autocomplete: 'off',
                role: 'searchbox',
              }"
              @search="submitSearchKeyword"
            >
              <template #left>
                <Search class="movies-list__search-input-icon" aria-hidden="true" />
              </template>
            </Input>
          </form>
          <div class="movies-list__tabs" role="group" aria-labelledby="movies-list-title">
            <Button
              v-for="option in searchMediaOptions"
              :key="option.value"
              class="movies-list__tab"
              :class="{ 'movies-list__tab--active': activeSearchMedia === option.value }"
              size="md"
              :variant="activeSearchMedia === option.value ? 'solid' : 'ghost'"
              :color="activeSearchMedia === option.value ? 'blue' : 'gray'"
              @click="openList(mediaQuery(option.value))"
            >
              {{ option.label }}
            </Button>
          </div>
        </div>
        <div
          v-if="!isSearchList"
          class="movies-list__filters"
          role="group"
          aria-labelledby="movies-list-title"
        >
          <label class="movies-list__filter-field">
            <span>{{ t("movies.filters.type") }}</span>
            <Select
              class="movies-list__filter-select"
              :model-value="catalogMedia"
              :options="catalogOptions"
              :ariaLabel="t('movies.filters.type')"
              @update:model-value="updateStringValue($event, setCatalogMedia)"
            />
          </label>

          <label class="movies-list__filter-field">
            <span>{{ t("movies.filters.genre") }}</span>
            <Select
              ref="genreSelect"
              class="movies-list__filter-select"
              :model-value="activeGenreValue"
              :options="genreOptions"
              :ariaLabel="t('movies.filters.genre')"
              :disabled="currentFilterState === 'loading' || currentFilterState === 'error'"
              @update:model-value="updateStringValue($event, setGenre)"
            />
          </label>

          <label class="movies-list__filter-field">
            <span>{{ t("movies.filters.country") }}</span>
            <Select
              ref="countrySelect"
              class="movies-list__filter-select"
              :model-value="activeCountry"
              :options="countryOptions"
              :ariaLabel="t('movies.filters.country')"
              :disabled="currentFilterState === 'loading' || currentFilterState === 'error'"
              @update:model-value="updateStringValue($event, setCountry)"
            />
          </label>

          <label class="movies-list__filter-field">
            <span>{{ t("movies.filters.sort") }}</span>
            <Select
              class="movies-list__filter-select"
              :model-value="activeSort"
              :options="sortOptions"
              :ariaLabel="t('movies.filters.sort')"
              @update:model-value="updateStringValue($event, setSort)"
            />
          </label>
        </div>
        <Alert
          v-if="!isSearchList && currentFilterState === 'error'"
          color="yellow"
          variant="surface"
          role="status"
        >
          {{ t("movies.error.filters") }}
        </Alert>
      </header>

      <section ref="resultsElement" class="movies-list__results" aria-live="polite">
        <div v-if="loadingInitial" class="movies-list__loading">
          <Spinner size="lg" :label="t('movies.loading.movies')" />
        </div>
        <Alert v-else-if="state === 'error'" color="red" variant="surface" role="alert">
          {{ t("movies.error.listTitles") }}
        </Alert>

        <EmptyState
          v-else-if="state === 'ready' && items.length === 0"
          :title="t('movies.empty.noTitles.title')"
          :description="t('movies.empty.noTitles.description')"
        />

        <template v-else>
          <ul class="movies-list__grid">
            <li v-for="movie in items" :key="movie.id" class="movies-list__item">
              <MovieCard
                :movie="movie"
                @blur="closeTrailerPreview"
                @focus="showTrailerPreviewFromFocus(movie, $event)"
                @pointerenter="showTrailerPreviewFromPointer(movie, $event)"
                @pointerleave="closeTrailerPreview"
                @pointermove="moveTrailerPreview(movie, $event)"
                @open="openDetail"
              />
            </li>
          </ul>

          <div class="movies-list__footer">
            <Button
              v-if="canLoadMore || loadingMore"
              class="movies-list__load-more"
              size="sm"
              :loading="loadingMore"
              :aria-label="loadingMore ? t('movies.action.loadMore') : undefined"
              @click="loadMore"
            >
              {{ loadingMore ? "" : t("movies.action.loadMore") }}
            </Button>
          </div>
        </template>
      </section>
    </div>

    <MovieTrailerHoverPreview
      :anchor-mode="trailerPreviewAnchorMode"
      :disabled="!trailerPreviewEnabled"
      :movie="trailerPreviewMovie"
      :reference="trailerPreviewReference"
      :trailer-cache="trailerPreviewCache"
      @preview-enter="keepTrailerPreviewOpen"
      @preview-leave="closeTrailerPreview"
    />
  </ScrollArea>
</template>

<style scoped lang="scss" src="../styles/list-view.scss"></style>
