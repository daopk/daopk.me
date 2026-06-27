<script setup lang="ts">
import { toRef } from "vue";

import { EmptyState, ScrollArea, Spinner, StatusBanner } from "@daopk/kit";
import { Search } from "@daopk/icons";
import { Button } from "@daopk/ui";

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
  openList: (query) => {
    emit("open-list", query);
  },
  query: toRef(props, "query"),
});
</script>

<template>
  <ScrollArea class="movies-list" safe-area>
    <div class="movies-list__content">
      <header class="movies-list__header">
        <h1>{{ title }}</h1>
        <div
          v-if="isSearchList"
          class="movies-list__search-panel"
          :aria-label="t('movies.search.results.ariaLabel')"
        >
          <form
            class="movies-list__search-form"
            role="search"
            @submit.prevent="submitSearchKeyword"
          >
            <div class="movies-list__search-input-shell">
              <Search class="movies-list__search-input-icon" aria-hidden="true" />
              <input
                v-model="searchDraft"
                type="search"
                :aria-label="t('movies.search.keyword.ariaLabel')"
                :placeholder="t('movies.search.titlesPlaceholder')"
                autocomplete="off"
                @search="submitSearchKeyword"
              />
            </div>
          </form>
          <div class="movies-list__tabs" :aria-label="t('movies.search.mediaType.ariaLabel')">
            <Button
              v-for="option in searchMediaOptions"
              :key="option.value"
              size="md"
              :variant="activeSearchMedia === option.value ? 'primary' : 'secondary'"
              @click="$emit('open-list', mediaQuery(option.value))"
            >
              {{ option.label }}
            </Button>
          </div>
        </div>
        <div
          v-else
          class="movies-list__filters"
          :aria-label="t('movies.filters.catalog.ariaLabel')"
        >
          <label class="movies-list__filter-field">
            <span>{{ t("movies.filters.type") }}</span>
            <select
              :value="catalogMedia"
              :aria-label="t('movies.filters.type')"
              @change="setCatalogMedia(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="option in catalogMediaSelectOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="movies-list__filter-field">
            <span>{{ t("movies.filters.genre") }}</span>
            <select
              ref="genreSelect"
              :value="activeGenreValue"
              :aria-label="t('movies.filters.genre')"
              :disabled="currentFilterState === 'loading' || currentFilterState === 'error'"
              @change="setGenre(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t("movies.filters.allGenres") }}</option>
              <option
                v-for="genre in currentFilters?.genres ?? []"
                :key="genre.id"
                :value="genre.id"
              >
                {{ genreLabel(genre, t) }}
              </option>
            </select>
          </label>

          <label class="movies-list__filter-field">
            <span>{{ t("movies.filters.country") }}</span>
            <select
              ref="countrySelect"
              :value="activeCountry"
              :aria-label="t('movies.filters.country')"
              :disabled="currentFilterState === 'loading' || currentFilterState === 'error'"
              @change="setCountry(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t("movies.filters.allCountries") }}</option>
              <option v-for="country in popularCountries" :key="country.code" :value="country.code">
                {{ countryLabel(country, t) }}
              </option>
            </select>
          </label>

          <label class="movies-list__filter-field">
            <span>{{ t("movies.filters.sort") }}</span>
            <select
              :value="activeSort"
              :aria-label="t('movies.filters.sort')"
              @change="setSort(($event.target as HTMLSelectElement).value)"
            >
              <option value="popular">{{ sortLabel("popular", t) }}</option>
              <option value="newest">{{ sortLabel("newest", t) }}</option>
              <option value="top-rated">{{ sortLabel("top-rated", t) }}</option>
            </select>
          </label>
        </div>
        <StatusBanner v-if="!isSearchList && currentFilterState === 'error'" tone="warning">
          {{ t("movies.error.filters") }}
        </StatusBanner>
      </header>

      <section
        class="movies-list__results"
        :aria-busy="loadingInitial ? 'true' : 'false'"
        aria-live="polite"
      >
        <div v-if="loadingInitial" class="movies-list__loading">
          <Spinner size="lg" :label="t('movies.loading.movies')" />
        </div>
        <StatusBanner v-else-if="state === 'error'" tone="error" role="alert">
          {{ t("movies.error.listTitles") }}
        </StatusBanner>

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
                @open="$emit('open-detail', $event)"
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
