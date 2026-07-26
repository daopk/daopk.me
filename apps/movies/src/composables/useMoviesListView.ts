import { computed, nextTick, ref, useTemplateRef, watch, type Ref } from "vue";

import {
  catalogMediaOptions,
  localizedListTitleForQuery,
  searchMediaTabs as localizedSearchMediaTabs,
} from "../i18n/labels";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import { useMoviesCatalogContent, type MoviesContentState } from "../moviesContent";
import {
  DEFAULT_MOVIES_LIST_LIMIT,
  type MovieSummary,
  type MoviesFiltersResult,
  type MoviesListQuery,
  type MoviesListSort,
  type MoviesSearchMedia,
} from "../moviesApi";

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

interface UseMoviesListViewOptions {
  readonly openList: (query: MoviesListQuery) => void;
  readonly query: Readonly<Ref<MoviesListQuery>>;
}

interface SelectHandle {
  focus(): void;
}

export interface UseMoviesListViewBindings {
  readonly activeCountry: Ref<string>;
  readonly activeGenreValue: Ref<string>;
  readonly activeSearchMedia: Ref<MoviesSearchMedia>;
  readonly activeSort: Ref<MoviesListSort>;
  readonly canLoadMore: Readonly<Ref<boolean>>;
  readonly catalogMedia: Ref<MoviesSearchMedia>;
  readonly catalogMediaSelectOptions: Ref<ReturnType<typeof catalogMediaOptions>>;
  readonly currentFilters: Ref<MoviesFiltersResult | null>;
  readonly currentFilterState: Readonly<Ref<MoviesContentState>>;
  readonly isSearchList: Ref<boolean>;
  readonly items: Ref<readonly MovieSummary[]>;
  readonly loadingInitial: Ref<boolean>;
  readonly loadingMore: Ref<boolean>;
  readonly popularCountries: Ref<MoviesFiltersResult["countries"]>;
  readonly searchDraft: Ref<string>;
  readonly searchMediaOptions: Ref<ReturnType<typeof localizedSearchMediaTabs>>;
  readonly state: Readonly<Ref<MoviesContentState>>;
  readonly t: ReturnType<typeof useMoviesI18n>["t"];
  readonly title: Ref<string>;
  loadMore(): Promise<void>;
  mediaQuery(media: MoviesSearchMedia): MoviesListQuery;
  setCatalogMedia(value: string): void;
  setCountry(value: string): void;
  setGenre(value: string): void;
  setSort(value: string): void;
  submitSearchKeyword(): void;
}

export function useMoviesListView({
  openList,
  query,
}: UseMoviesListViewOptions): UseMoviesListViewBindings {
  const { t } = useMoviesI18n();
  const resource = useMoviesCatalogContent(() => query.value);
  const items = computed(() => resource.content.value.items);
  const currentFilters = computed(() => resource.content.value.filters);
  const { canLoadMore, filterState: currentFilterState, loadMore, state } = resource;
  const genreSelect = useTemplateRef<SelectHandle>("genreSelect");
  const countrySelect = useTemplateRef<SelectHandle>("countrySelect");

  const title = computed(() => localizedListTitleForQuery(query.value, t));
  const searchKeyword = computed(() => query.value.keyword?.trim() ?? "");
  const searchDraft = ref(searchKeyword.value);
  const activeSearchMedia = computed(() => query.value.media ?? "all");
  const searchMediaOptions = computed(() => localizedSearchMediaTabs(t));
  const catalogMediaSelectOptions = computed(() => catalogMediaOptions(t));
  const isSearchList = computed(() => searchKeyword.value.length > 0);
  const catalogMedia = computed<MoviesSearchMedia>(() => catalogMediaForQuery(query.value));
  const activeGenreValue = computed(() => (query.value.genre ?? "").toString());
  const activeCountry = computed(() => query.value.country ?? "");
  const activeSort = computed<MoviesListSort>(() => query.value.sort ?? "popular");
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
  const loadingMore = computed(() => state.value === "loading" && items.value.length > 0);
  watch(
    () => query.value.filterFocus,
    (filterFocus) => {
      if (!isSearchList.value) {
        void focusRequestedFilter(filterFocus);
      }
    },
    { immediate: true },
  );

  watch(
    () => query.value.keyword,
    (keyword) => {
      searchDraft.value = keyword?.trim() ?? "";
    },
  );

  function mediaQuery(media: MoviesSearchMedia): MoviesListQuery {
    if (isSearchList.value) {
      return searchQuery(searchDraft.value.trim() || searchKeyword.value, media);
    }

    return { ...query.value, media, page: 1 };
  }

  function searchQuery(
    keyword: string,
    media: MoviesSearchMedia = activeSearchMedia.value,
  ): MoviesListQuery {
    return {
      keyword,
      limit: query.value.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
      media,
      page: 1,
    };
  }

  function submitSearchKeyword(): void {
    const keyword = searchDraft.value.trim();
    if (keyword.length === 0) {
      return;
    }

    openList(searchQuery(keyword));
  }

  function catalogQuery(next: Partial<MoviesListQuery> = {}): MoviesListQuery {
    return {
      ...(query.value.country === undefined ? {} : { country: query.value.country }),
      ...(query.value.countryName === undefined ? {} : { countryName: query.value.countryName }),
      ...(query.value.genre === undefined ? {} : { genre: query.value.genre }),
      ...(query.value.genreName === undefined ? {} : { genreName: query.value.genreName }),
      limit: query.value.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
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
      ...nextQuery
    } = catalogQuery({ media: value });
    openList(nextQuery);
  }

  function setGenre(value: string): void {
    const genreId = Number(value);
    if (!Number.isSafeInteger(genreId) || genreId <= 0) {
      const {
        genre: _genre,
        genreName: _genreName,
        filterFocus: _filterFocus,
        ...nextQuery
      } = catalogQuery();
      openList(nextQuery);
      return;
    }

    const genre = currentFilters.value?.genres.find((entry) => entry.id === genreId);
    openList(
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
        ...nextQuery
      } = catalogQuery();
      openList(nextQuery);
      return;
    }

    const country = currentFilters.value?.countries.find((entry) => entry.code === value);
    openList(
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
    openList(catalogQuery({ sort: value }));
  }

  async function focusRequestedFilter(filterFocus: MoviesListQuery["filterFocus"]): Promise<void> {
    if (filterFocus === undefined) {
      return;
    }
    await nextTick();
    if (filterFocus === "genre") {
      genreSelect.value?.focus();
    } else {
      countrySelect.value?.focus();
    }
  }

  function isCatalogMedia(value: string): value is MoviesSearchMedia {
    return value === "all" || value === "movie" || value === "tv";
  }

  function catalogMediaForQuery(currentQuery: MoviesListQuery): MoviesSearchMedia {
    if (
      currentQuery.media === "all" ||
      currentQuery.media === "movie" ||
      currentQuery.media === "tv"
    ) {
      return currentQuery.media;
    }
    return currentQuery.kind === "trending-tv" ? "tv" : "movie";
  }

  return {
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
  };
}
