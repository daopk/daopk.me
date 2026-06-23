import { computed, nextTick, onUnmounted, ref, watch, type Ref } from "vue";

import {
  catalogMediaOptions,
  localizedListTitleForQuery,
  searchMediaTabs as localizedSearchMediaTabs,
} from "../i18n/labels";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import {
  DEFAULT_MOVIES_LIST_LIMIT,
  fetchMoviesFilters,
  fetchMoviesList,
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

export interface UseMoviesListViewBindings {
  readonly activeCountry: Ref<string>;
  readonly activeGenreValue: Ref<string>;
  readonly activeSearchMedia: Ref<MoviesSearchMedia>;
  readonly activeSort: Ref<MoviesListSort>;
  readonly canLoadMore: Ref<boolean>;
  readonly catalogMedia: Ref<MoviesSearchMedia>;
  readonly catalogMediaSelectOptions: Ref<ReturnType<typeof catalogMediaOptions>>;
  readonly countrySelect: Ref<HTMLSelectElement | null>;
  readonly currentFilters: Ref<MoviesFiltersResult | null>;
  readonly currentFilterState: Ref<FilterLoadState>;
  readonly genreSelect: Ref<HTMLSelectElement | null>;
  readonly isSearchList: Ref<boolean>;
  readonly items: Ref<readonly MovieSummary[]>;
  readonly loadingInitial: Ref<boolean>;
  readonly loadingMore: Ref<boolean>;
  readonly popularCountries: Ref<MoviesFiltersResult["countries"]>;
  readonly searchDraft: Ref<string>;
  readonly searchMediaOptions: Ref<ReturnType<typeof localizedSearchMediaTabs>>;
  readonly state: Ref<LoadState>;
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
  const { locale, t } = useMoviesI18n();
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

  const title = computed(() => localizedListTitleForQuery(query.value, t));
  const searchKeyword = computed(() => query.value.keyword?.trim() ?? "");
  const searchDraft = ref(searchKeyword.value);
  const activeSearchMedia = computed(() => query.value.media ?? "all");
  const searchMediaOptions = computed(() => localizedSearchMediaTabs(t));
  const catalogMediaSelectOptions = computed(() => catalogMediaOptions(t));
  const isSearchList = computed(() => searchKeyword.value.length > 0);
  const catalogMedia = computed<MoviesSearchMedia>(() => catalogMediaForQuery(query.value));
  const combinedFilters = computed<MoviesFiltersResult | null>(() =>
    combineFilters(filtersByMedia.value.movie, filtersByMedia.value.tv),
  );
  const currentFilters = computed(() =>
    catalogMedia.value === "all" ? combinedFilters.value : filtersByMedia.value[catalogMedia.value],
  );
  const currentFilterState = computed<FilterLoadState>(() =>
    filterStateForCatalogMedia(catalogMedia.value),
  );
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

  watch(
    () => [query.value, locale.value] as const,
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
        {
          ...query.value,
          limit: query.value.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
          page: 1,
        },
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
          ...query.value,
          limit: query.value.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
          page: pagination.value.currentPage + 1,
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
      genreSelect.value?.focus({ preventScroll: true });
    } else {
      countrySelect.value?.focus({ preventScroll: true });
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

  function uniqueBy<T>(entries: readonly T[], keyForItem: (item: T) => string): readonly T[] {
    const seen = new Set<string>();
    return entries.filter((item) => {
      const key = keyForItem(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  return {
    activeCountry,
    activeGenreValue,
    activeSearchMedia,
    activeSort,
    canLoadMore,
    catalogMedia,
    catalogMediaSelectOptions,
    countrySelect,
    currentFilters,
    currentFilterState,
    genreSelect,
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
