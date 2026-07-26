import type { SupportedLocale } from "@daopk/sdk";
import {
  computed,
  onScopeDispose,
  readonly,
  shallowReadonly,
  shallowRef,
  watch,
  type Ref,
  type ShallowRef,
} from "vue";

import { useMoviesI18n } from "./i18n/useMoviesI18n";
import type {
  MovieEpisodeTarget,
  MovieDetail,
  MovieEpisodeDetail,
  MovieMediaType,
  MoviePersonDetail,
  MovieSeasonDetail,
  MovieSummary,
  MoviesFiltersResult,
  MoviesListPeriod,
  MoviesListQuery,
  MoviesPagination,
  MoviesSearchMedia,
} from "./moviesApi";
import { DEFAULT_MOVIES_LIST_LIMIT, HOME_DISCOVERY_GROUPS } from "./moviesApi";
import {
  moviesContentHttpAdapter,
  type MoviesContentRemote,
  type MoviesContentRemoteOptions,
} from "./moviesContentRemote";
import type {
  MoviesContinueWatchingRecord,
  MoviesWatchProgress,
  MoviesWatchTarget,
} from "./moviesWatchContinuity";

export type MoviesContentState = "idle" | "loading" | "ready" | "error";

export interface MovieDetailContentRequest {
  readonly kind: "detail";
  readonly mediaType: MovieMediaType;
  readonly tmdbId: number;
}

export interface MovieSeasonContentRequest {
  readonly kind: "season";
  readonly seasonNumber: number;
  readonly tmdbId: number;
}

export interface MovieEpisodeContentRequest {
  readonly episodeNumber: number;
  readonly kind: "episode";
  readonly seasonNumber: number;
  readonly tmdbId: number;
}

export interface MoviePersonContentRequest {
  readonly kind: "person";
  readonly tmdbId: number;
}

export interface MovieSeasonEpisodesContentRequest {
  readonly kind: "season-episodes";
  readonly seasonNumber: number;
  readonly tmdbId: number;
}

export interface MoviePlaybackContentRequest {
  readonly kind: "playback";
  readonly target: MoviesWatchTarget;
}

export type MoviesContentRequest =
  | MovieDetailContentRequest
  | MovieEpisodeContentRequest
  | MoviePersonContentRequest
  | MoviePlaybackContentRequest
  | MovieSeasonContentRequest
  | MovieSeasonEpisodesContentRequest;

export interface MovieDetailContent {
  readonly detail: MovieDetail;
  readonly kind: "detail";
  readonly trailerKey: string | null;
}

export interface MovieSeasonContent {
  readonly detail: MovieDetail;
  readonly kind: "season";
  readonly season: MovieSeasonDetail;
}

export interface MovieEpisodeContent {
  readonly detail: MovieEpisodeDetail;
  readonly kind: "episode";
}

export interface MoviePersonContent {
  readonly kind: "person";
  readonly person: MoviePersonDetail;
}

export interface MovieSeasonEpisodesContent {
  readonly kind: "season-episodes";
  readonly season: MovieSeasonDetail;
}

export interface MoviePlaybackContent {
  readonly episodeDetail: MovieEpisodeDetail | null;
  readonly kind: "playback";
  readonly movieDetail: MovieDetail | null;
}

export type MoviesContent =
  | MovieDetailContent
  | MovieEpisodeContent
  | MoviePersonContent
  | MoviePlaybackContent
  | MovieSeasonContent
  | MovieSeasonEpisodesContent;

export type MoviesContentFor<Request extends MoviesContentRequest> =
  Request extends MovieDetailContentRequest
    ? MovieDetailContent
    : Request extends MovieSeasonContentRequest
      ? MovieSeasonContent
      : Request extends MovieEpisodeContentRequest
        ? MovieEpisodeContent
        : Request extends MoviePersonContentRequest
          ? MoviePersonContent
          : Request extends MovieSeasonEpisodesContentRequest
            ? MovieSeasonEpisodesContent
            : MoviePlaybackContent;

export interface MoviesContentResource<Request extends MoviesContentRequest> {
  readonly content: Readonly<ShallowRef<MoviesContentFor<Request> | null>>;
  readonly state: Readonly<Ref<MoviesContentState>>;
}

interface ContinueWatchingMovieTarget {
  readonly kind: "movie";
  readonly movie: MovieSummary;
}

interface ContinueWatchingEpisodeTarget {
  readonly episode: MovieEpisodeTarget;
  readonly kind: "episode";
}

export interface MoviesContinueWatchingItem {
  readonly id: string;
  readonly imageUrl: string;
  readonly progress: MoviesWatchProgress;
  readonly progressPercent: number;
  readonly subtitle: string;
  readonly target: ContinueWatchingMovieTarget | ContinueWatchingEpisodeTarget;
  readonly title: string;
}

export interface MoviesHomeContent {
  readonly continueWatchingItems: readonly MoviesContinueWatchingItem[];
  readonly featured: readonly MovieSummary[];
  readonly rows: Readonly<Record<string, readonly MovieSummary[]>>;
}

export interface MoviesHomeContentResource {
  readonly content: Readonly<ShallowRef<MoviesHomeContent>>;
  readonly state: Readonly<Ref<MoviesContentState>>;
  refreshContinueWatching(): void;
}

export interface MoviesCatalogContent {
  readonly filters: MoviesFiltersResult | null;
  readonly items: readonly MovieSummary[];
}

export interface MoviesCatalogContentResource {
  readonly canLoadMore: Readonly<Ref<boolean>>;
  readonly content: Readonly<ShallowRef<MoviesCatalogContent>>;
  readonly filterState: Readonly<Ref<MoviesContentState>>;
  readonly state: Readonly<Ref<MoviesContentState>>;
  loadMore(): Promise<void>;
}

export interface MoviesContentModule {
  use<Request extends MoviesContentRequest>(
    request: () => Request | null,
    locale: Readonly<Ref<SupportedLocale>>,
  ): MoviesContentResource<Request>;
  useCatalog(
    query: () => MoviesListQuery,
    locale: Readonly<Ref<SupportedLocale>>,
  ): MoviesCatalogContentResource;
  useHome(
    trendingPeriod: () => MoviesListPeriod,
    continueWatchingRecords: () => readonly MoviesContinueWatchingRecord[],
    locale: Readonly<Ref<SupportedLocale>>,
  ): MoviesHomeContentResource;
}

export function createMoviesContent(remote: MoviesContentRemote): MoviesContentModule {
  return {
    use<Request extends MoviesContentRequest>(
      request: () => Request | null,
      locale: Readonly<Ref<SupportedLocale>>,
    ): MoviesContentResource<Request> {
      return createMoviesContentResource(remote, request, locale);
    },
    useCatalog(query, locale) {
      return createMoviesCatalogContentResource(remote, query, locale);
    },
    useHome(trendingPeriod, continueWatchingRecords, locale) {
      return createMoviesHomeContentResource(
        remote,
        trendingPeriod,
        continueWatchingRecords,
        locale,
      );
    },
  };
}

const moviesContent = createMoviesContent(moviesContentHttpAdapter);

export function useMoviesContent<Request extends MoviesContentRequest>(
  request: () => Request | null,
): MoviesContentResource<Request> {
  const { locale } = useMoviesI18n();
  return moviesContent.use(request, locale);
}

export function useMoviesCatalogContent(
  query: () => MoviesListQuery,
): MoviesCatalogContentResource {
  const { locale } = useMoviesI18n();
  return moviesContent.useCatalog(query, locale);
}

export function useMoviesHomeContent(
  trendingPeriod: () => MoviesListPeriod,
  continueWatchingRecords: () => readonly MoviesContinueWatchingRecord[],
): MoviesHomeContentResource {
  const { locale } = useMoviesI18n();
  return moviesContent.useHome(trendingPeriod, continueWatchingRecords, locale);
}

function createMoviesContentResource<Request extends MoviesContentRequest>(
  remote: MoviesContentRemote,
  request: () => Request | null,
  locale: Readonly<Ref<SupportedLocale>>,
): MoviesContentResource<Request> {
  const content = shallowRef<MoviesContentFor<Request> | null>(null);
  const state = shallowRef<MoviesContentState>("idle");
  let activeController: AbortController | null = null;
  let revision = 0;

  watch(
    () => [request(), locale.value] as const,
    ([nextRequest, nextLocale]) => {
      revision += 1;
      const currentRevision = revision;
      activeController?.abort();
      activeController = null;
      content.value = null;

      if (nextRequest === null) {
        state.value = "idle";
        return;
      }

      const controller = new AbortController();
      activeController = controller;
      state.value = "loading";
      void loadMoviesContent(remote, nextRequest, {
        locale: nextLocale,
        signal: controller.signal,
      }).then(
        (nextContent) => {
          if (currentRevision !== revision || controller.signal.aborted) {
            return;
          }
          content.value = nextContent as MoviesContentFor<Request>;
          state.value = "ready";
        },
        () => {
          if (currentRevision !== revision || controller.signal.aborted) {
            return;
          }
          state.value = "error";
        },
      );
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    revision += 1;
    activeController?.abort();
  });

  return {
    content: shallowReadonly(content),
    state: readonly(state),
  };
}

function createMoviesHomeContentResource(
  remote: MoviesContentRemote,
  trendingPeriod: () => MoviesListPeriod,
  continueWatchingRecords: () => readonly MoviesContinueWatchingRecord[],
  locale: Readonly<Ref<SupportedLocale>>,
): MoviesHomeContentResource {
  const content = shallowRef<MoviesHomeContent>({
    continueWatchingItems: [],
    featured: [],
    rows: {},
  });
  const state = shallowRef<MoviesContentState>("idle");
  let homeController: AbortController | null = null;
  let homeRevision = 0;
  let continueWatchingController: AbortController | null = null;
  let continueWatchingRevision = 0;

  watch(
    () => [trendingPeriod(), locale.value] as const,
    ([nextPeriod, nextLocale]) => {
      homeRevision += 1;
      const currentRevision = homeRevision;
      homeController?.abort();
      const controller = new AbortController();
      homeController = controller;
      state.value = "loading";

      void loadMoviesHomeCatalog(remote, nextPeriod, {
        locale: nextLocale,
        signal: controller.signal,
      }).then(
        (nextContent) => {
          if (currentRevision !== homeRevision || controller.signal.aborted) {
            return;
          }
          content.value = {
            ...content.value,
            featured: nextContent.featured,
            rows: nextContent.rows,
          };
          state.value = "ready";
        },
        () => {
          if (currentRevision !== homeRevision || controller.signal.aborted) {
            return;
          }
          state.value = "error";
        },
      );
    },
    { immediate: true },
  );

  watch(locale, refreshContinueWatching, { immediate: true });

  function refreshContinueWatching(): void {
    continueWatchingRevision += 1;
    const currentRevision = continueWatchingRevision;
    continueWatchingController?.abort();
    const controller = new AbortController();
    continueWatchingController = controller;
    const records = continueWatchingRecords();

    if (records.length === 0) {
      content.value = { ...content.value, continueWatchingItems: [] };
      return;
    }

    void loadContinueWatchingContent(remote, records, {
      locale: locale.value,
      signal: controller.signal,
    }).then((items) => {
      if (currentRevision !== continueWatchingRevision || controller.signal.aborted) {
        return;
      }
      content.value = { ...content.value, continueWatchingItems: items };
    });
  }

  onScopeDispose(() => {
    homeRevision += 1;
    continueWatchingRevision += 1;
    homeController?.abort();
    continueWatchingController?.abort();
  });

  return {
    content: shallowReadonly(content),
    refreshContinueWatching,
    state: readonly(state),
  };
}

function createMoviesCatalogContentResource(
  remote: MoviesContentRemote,
  query: () => MoviesListQuery,
  locale: Readonly<Ref<SupportedLocale>>,
): MoviesCatalogContentResource {
  const content = shallowRef<MoviesCatalogContent>({ filters: null, items: [] });
  const state = shallowRef<MoviesContentState>("idle");
  const filterState = shallowRef<MoviesContentState>("idle");
  const pagination = shallowRef<MoviesPagination | null>(null);
  let activeQuery: MoviesListQuery | null = null;
  let listController: AbortController | null = null;
  let listRevision = 0;
  let filtersController: AbortController | null = null;
  let filtersRevision = 0;

  const canLoadMore = computed(
    () =>
      state.value !== "loading" &&
      pagination.value !== null &&
      pagination.value.currentPage < pagination.value.totalPages,
  );

  watch(
    () => [query(), locale.value] as const,
    ([nextQuery, nextLocale]) => {
      void loadFirstPage({ ...nextQuery }, nextLocale);
    },
    { deep: true, immediate: true },
  );

  watch(
    () => [filtersMediaForQuery(query()), locale.value] as const,
    ([media, nextLocale]) => {
      filtersRevision += 1;
      const currentRevision = filtersRevision;
      filtersController?.abort();
      filtersController = null;
      content.value = { ...content.value, filters: null };

      if (media === null) {
        filterState.value = "idle";
        return;
      }

      const controller = new AbortController();
      filtersController = controller;
      filterState.value = "loading";
      const mediaTypes: readonly MovieMediaType[] = media === "all" ? ["movie", "tv"] : [media];

      void Promise.all(
        mediaTypes.map((mediaType) =>
          remote.fetchFilters(mediaType, {
            locale: nextLocale,
            signal: controller.signal,
          }),
        ),
      ).then(
        (filters) => {
          if (currentRevision !== filtersRevision || controller.signal.aborted) {
            return;
          }
          content.value = {
            ...content.value,
            filters:
              media === "all"
                ? combineMoviesFilters(filters[0] ?? null, filters[1] ?? null)
                : (filters[0] ?? null),
          };
          filterState.value = "ready";
        },
        () => {
          if (currentRevision !== filtersRevision || controller.signal.aborted) {
            return;
          }
          filterState.value = "error";
        },
      );
    },
    { immediate: true },
  );

  async function loadFirstPage(nextQuery: MoviesListQuery, nextLocale: SupportedLocale) {
    listRevision += 1;
    const currentRevision = listRevision;
    listController?.abort();
    const controller = new AbortController();
    listController = controller;
    activeQuery = nextQuery;
    pagination.value = null;
    content.value = { ...content.value, items: [] };
    state.value = "loading";

    try {
      const result = await remote.fetchList(
        {
          ...nextQuery,
          limit: nextQuery.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
          page: 1,
        },
        { locale: nextLocale, signal: controller.signal },
      );
      if (currentRevision !== listRevision || controller.signal.aborted) {
        return;
      }
      content.value = { ...content.value, items: result.items };
      pagination.value = result.pagination;
      state.value = "ready";
    } catch {
      if (currentRevision !== listRevision || controller.signal.aborted) {
        return;
      }
      state.value = "error";
    }
  }

  async function loadMore(): Promise<void> {
    if (!canLoadMore.value || activeQuery === null || pagination.value === null) {
      return;
    }

    listRevision += 1;
    const currentRevision = listRevision;
    listController?.abort();
    const controller = new AbortController();
    listController = controller;
    const nextPage = pagination.value.currentPage + 1;
    const nextQuery = activeQuery;
    const nextLocale = locale.value;
    state.value = "loading";

    try {
      const result = await remote.fetchList(
        {
          ...nextQuery,
          limit: nextQuery.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
          page: nextPage,
        },
        { locale: nextLocale, signal: controller.signal },
      );
      if (currentRevision !== listRevision || controller.signal.aborted) {
        return;
      }
      content.value = {
        ...content.value,
        items: [...content.value.items, ...result.items],
      };
      pagination.value = result.pagination;
      state.value = "ready";
    } catch {
      if (currentRevision !== listRevision || controller.signal.aborted) {
        return;
      }
      state.value = "error";
    }
  }

  onScopeDispose(() => {
    listRevision += 1;
    filtersRevision += 1;
    listController?.abort();
    filtersController?.abort();
  });

  return {
    canLoadMore: readonly(canLoadMore),
    content: shallowReadonly(content),
    filterState: readonly(filterState),
    loadMore,
    state: readonly(state),
  };
}

async function loadMoviesHomeCatalog(
  remote: MoviesContentRemote,
  trendingPeriod: MoviesListPeriod,
  options: MoviesContentRemoteOptions,
): Promise<Pick<MoviesHomeContent, "featured" | "rows">> {
  const rowRequests = HOME_DISCOVERY_GROUPS.flatMap((group) =>
    group.rows.map((row) => ({
      id: row.id,
      query: group.id === "trending" ? { ...row.query, period: trendingPeriod } : row.query,
    })),
  );
  const [heroResult, ...rowResults] = await Promise.all([
    remote.fetchList({ kind: "trending-movie", limit: 6, period: "week" }, options),
    ...rowRequests.map(({ query }) => remote.fetchList({ ...query, limit: 12 }, options)),
  ]);

  return {
    featured: heroResult.items,
    rows: rowRequests.reduce<Record<string, readonly MovieSummary[]>>((rows, request, index) => {
      rows[request.id] = rowResults[index]?.items ?? [];
      return rows;
    }, {}),
  };
}

async function loadContinueWatchingContent(
  remote: MoviesContentRemote,
  records: readonly MoviesContinueWatchingRecord[],
  options: MoviesContentRemoteOptions,
): Promise<readonly MoviesContinueWatchingItem[]> {
  const uniqueRecords = uniqueContinueWatchingRecords(records);
  const items = await Promise.all(
    uniqueRecords.map(async (record) => {
      try {
        return await hydrateContinueWatchingRecord(remote, record, options);
      } catch {
        return null;
      }
    }),
  );
  return items.filter((item): item is MoviesContinueWatchingItem => item !== null);
}

const CONTINUE_WATCHING_LIMIT = 10;

function uniqueContinueWatchingRecords(
  records: readonly MoviesContinueWatchingRecord[],
): readonly MoviesContinueWatchingRecord[] {
  const seen = new Set<string>();
  const uniqueRecords: MoviesContinueWatchingRecord[] = [];

  for (const record of records) {
    const groupKey = continueWatchingRecordGroupKey(record);
    if (seen.has(groupKey)) {
      continue;
    }

    seen.add(groupKey);
    uniqueRecords.push(record);
    if (uniqueRecords.length >= CONTINUE_WATCHING_LIMIT) {
      break;
    }
  }

  return uniqueRecords;
}

async function hydrateContinueWatchingRecord(
  remote: MoviesContentRemote,
  record: MoviesContinueWatchingRecord,
  options: MoviesContentRemoteOptions,
): Promise<MoviesContinueWatchingItem> {
  if (record.target.kind === "movie") {
    const movie = await remote.fetchDetail("movie", record.target.tmdbId, options);
    return {
      id: `movie-${record.target.tmdbId}`,
      imageUrl: movie.backdropUrl || movie.thumbUrl || movie.posterUrl,
      progress: record.progress,
      progressPercent: continueProgressPercent(record.progress),
      subtitle: [movie.originName, movie.year]
        .filter(
          (item): item is string | number => item !== "" && item !== null && item !== undefined,
        )
        .join(" · "),
      target: { kind: "movie", movie },
      title: movie.name,
    };
  }

  const episodeDetail = await remote.fetchEpisode(
    record.target.tmdbId,
    record.target.seasonNumber,
    record.target.episodeNumber,
    options,
  );
  const episodeTarget: MovieEpisodeTarget = {
    episodeNumber: episodeDetail.episode.episodeNumber,
    seasonNumber: episodeDetail.episode.seasonNumber,
    slug: episodeDetail.series.slug,
    tmdbId: episodeDetail.series.tmdbId,
  };

  return {
    id: `tv-${record.target.tmdbId}-s${record.target.seasonNumber}-e${record.target.episodeNumber}`,
    imageUrl:
      episodeDetail.episode.stillUrl ||
      episodeDetail.series.backdropUrl ||
      episodeDetail.series.thumbUrl ||
      episodeDetail.series.posterUrl,
    progress: record.progress,
    progressPercent: continueProgressPercent(record.progress),
    subtitle: [
      `S${episodeTarget.seasonNumber} E${episodeTarget.episodeNumber}`,
      episodeDetail.episode.name,
    ]
      .filter(Boolean)
      .join(" · "),
    target: { episode: episodeTarget, kind: "episode" },
    title: episodeDetail.series.name,
  };
}

function continueProgressPercent(progress: MoviesWatchProgress): number {
  if (!Number.isFinite(progress.currentTime) || !Number.isFinite(progress.duration)) {
    return 0;
  }

  return Math.round(Math.min(1, Math.max(0, progress.currentTime / progress.duration)) * 100);
}

function continueWatchingRecordGroupKey(record: MoviesContinueWatchingRecord): string {
  return record.target.kind === "movie"
    ? `movie:${record.target.tmdbId}`
    : `tv:${record.target.tmdbId}`;
}

function filtersMediaForQuery(query: MoviesListQuery): MoviesSearchMedia | null {
  return (query.keyword?.trim().length ?? 0) > 0 ? null : catalogMediaForQuery(query);
}

function catalogMediaForQuery(query: MoviesListQuery): MoviesSearchMedia {
  if (query.media === "all" || query.media === "movie" || query.media === "tv") {
    return query.media;
  }
  return query.kind === "trending-tv" ? "tv" : "movie";
}

function combineMoviesFilters(
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

async function loadMoviesContent(
  remote: MoviesContentRemote,
  request: MoviesContentRequest,
  options: MoviesContentRemoteOptions,
): Promise<MoviesContent> {
  switch (request.kind) {
    case "detail": {
      const [detail, trailer] = await Promise.all([
        remote.fetchDetail(request.mediaType, request.tmdbId, options),
        remote.fetchTrailer(request.mediaType, request.tmdbId, options).catch(() => ({
          trailer: null,
        })),
      ]);
      return {
        detail,
        kind: "detail",
        trailerKey: trailer.trailer?.key ?? null,
      };
    }
    case "season": {
      const [detail, season] = await Promise.all([
        remote.fetchDetail("tv", request.tmdbId, options),
        remote.fetchSeason(request.tmdbId, request.seasonNumber, options),
      ]);
      return { detail, kind: "season", season };
    }
    case "episode":
      return {
        detail: await remote.fetchEpisode(
          request.tmdbId,
          request.seasonNumber,
          request.episodeNumber,
          options,
        ),
        kind: "episode",
      };
    case "person":
      return {
        kind: "person",
        person: await remote.fetchPerson(request.tmdbId, options),
      };
    case "season-episodes":
      return {
        kind: "season-episodes",
        season: await remote.fetchSeason(request.tmdbId, request.seasonNumber, options),
      };
    case "playback":
      return loadPlaybackContent(remote, request.target, options);
  }
}

async function loadPlaybackContent(
  remote: MoviesContentRemote,
  target: MoviesWatchTarget,
  options: MoviesContentRemoteOptions,
): Promise<MoviePlaybackContent> {
  if (target.kind === "movie") {
    return {
      episodeDetail: null,
      kind: "playback",
      movieDetail: await remote.fetchDetail("movie", target.tmdbId, options),
    };
  }

  return {
    episodeDetail: await remote.fetchEpisode(
      target.tmdbId,
      target.seasonNumber,
      target.episodeNumber,
      options,
    ),
    kind: "playback",
    movieDetail: null,
  };
}
