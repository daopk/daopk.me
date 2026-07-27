import type { SupportedLocale } from "@daopk/sdk";
import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { createMoviesContent, type MoviePersonContentRequest } from "./moviesContent";
import {
  createInMemoryMoviesContentAdapter,
  type MoviesContentRemote,
} from "./moviesContentRemote";
import {
  HOME_DISCOVERY_GROUPS,
  type MovieDetail,
  type MoviePersonDetail,
  type MovieSummary,
  type MovieTrailerResult,
  type MoviesFiltersResult,
  type MoviesListPeriod,
  type MoviesListQuery,
  type MoviesListResult,
} from "./moviesApi";
import type { MoviesContinueWatchingRecord } from "./moviesWatchContinuity";

describe("Movies content", () => {
  it("assembles detail content behind one interface with an in-memory adapter", async () => {
    const detail = movieDetail(550, "Fight Club");
    const trailer: MovieTrailerResult = { trailer: { key: "SUXWAEX2jlg" } };
    const module = createMoviesContent(
      createInMemoryMoviesContentAdapter({
        details: [{ mediaType: "movie", tmdbId: 550, value: detail }],
        trailers: [{ mediaType: "movie", tmdbId: 550, value: trailer }],
      }),
    );
    const locale = ref<SupportedLocale>("en");
    const scope = effectScope();
    const resource = scope.run(() =>
      module.use(() => ({ kind: "detail", mediaType: "movie", tmdbId: 550 }), locale),
    );

    expect(resource?.state.value).toBe("loading");
    await settleContent();

    expect(resource?.state.value).toBe("ready");
    expect(resource?.content.value).toEqual({
      detail,
      kind: "detail",
      trailerKey: "SUXWAEX2jlg",
    });
    scope.stop();
  });

  it("does not let a stale failure overwrite a newer request", async () => {
    const first = deferred<MoviePersonDetail>();
    const second = deferred<MoviePersonDetail>();
    const signals: AbortSignal[] = [];
    const baseAdapter = createInMemoryMoviesContentAdapter({});
    const remote: MoviesContentRemote = {
      ...baseAdapter,
      fetchPerson: vi.fn((_, options) => {
        signals.push(options.signal);
        return signals.length === 1 ? first.promise : second.promise;
      }),
    };
    const module = createMoviesContent(remote);
    const locale = ref<SupportedLocale>("en");
    const request = ref<MoviePersonContentRequest>({
      kind: "person",
      tmdbId: 1,
    });
    const scope = effectScope();
    const resource = scope.run(() => module.use(() => request.value, locale));

    request.value = { kind: "person", tmdbId: 2 };
    await nextTick();

    expect(signals[0]?.aborted).toBe(true);
    expect(resource?.state.value).toBe("loading");

    first.reject(new Error("Stale request failed."));
    await settleContent();

    expect(resource?.state.value).toBe("loading");
    expect(resource?.content.value).toBeNull();

    const currentPerson = moviePerson(2, "Current Person");
    second.resolve(currentPerson);
    await settleContent();

    expect(resource?.state.value).toBe("ready");
    expect(resource?.content.value).toEqual({
      kind: "person",
      person: currentPerson,
    });
    scope.stop();
  });

  it("reloads for locale changes and aborts when its scope is disposed", async () => {
    const requests: Array<{
      readonly locale: SupportedLocale;
      readonly signal: AbortSignal;
    }> = [];
    const pending = [deferred<MoviePersonDetail>(), deferred<MoviePersonDetail>()];
    const baseAdapter = createInMemoryMoviesContentAdapter({});
    const remote: MoviesContentRemote = {
      ...baseAdapter,
      fetchPerson: vi.fn((_, options) => {
        requests.push(options);
        return pending[requests.length - 1]!.promise;
      }),
    };
    const module = createMoviesContent(remote);
    const locale = ref<SupportedLocale>("en");
    const scope = effectScope();
    const resource = scope.run(() => module.use(() => ({ kind: "person", tmdbId: 1 }), locale));

    locale.value = "vi";
    await nextTick();

    expect(requests.map((request) => request.locale)).toEqual(["en", "vi"]);
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(resource?.state.value).toBe("loading");

    scope.stop();

    expect(requests[1]?.signal.aborted).toBe(true);
    pending[1]?.resolve(moviePerson(1, "Ignored Person"));
    await settleContent();
    expect(resource?.content.value).toBeNull();
  });

  it("owns catalog filters and pagination behind one interface", async () => {
    const firstMovie = movieDetail(550, "Fight Club");
    const secondMovie = movieDetail(551, "Page Two");
    const movieFilters = filters("movie", 28, "Action");
    const tvFilters = filters("tv", 10759, "Action & Adventure");
    const module = createMoviesContent(
      createInMemoryMoviesContentAdapter({
        filters: [
          { mediaType: "movie", value: movieFilters },
          { mediaType: "tv", value: tvFilters },
        ],
        lists: [
          {
            query: { limit: 1, media: "all", page: 1 },
            value: list([firstMovie], 1, 2),
          },
          {
            query: { limit: 1, media: "all", page: 2 },
            value: list([secondMovie], 2, 2),
          },
        ],
      }),
    );
    const locale = ref<SupportedLocale>("en");
    const scope = effectScope();
    const resource = scope.run(() => module.useCatalog(() => ({ limit: 1, media: "all" }), locale));

    expect(resource?.state.value).toBe("loading");
    expect(resource?.filterState.value).toBe("loading");
    await settleContent();

    expect(resource?.state.value).toBe("ready");
    expect(resource?.filterState.value).toBe("ready");
    expect(resource?.content.value.items).toEqual([firstMovie]);
    expect(resource?.content.value.filters?.genres).toEqual([
      movieFilters.genres[0],
      tvFilters.genres[0],
    ]);
    expect(resource?.canLoadMore.value).toBe(true);

    await resource?.loadMore();
    await settleContent();

    expect(resource?.content.value.items).toEqual([firstMovie, secondMovie]);
    expect(resource?.canLoadMore.value).toBe(false);
    scope.stop();
  });

  it("does not let a stale catalog result overwrite a newer query", async () => {
    const first = deferred<MoviesListResult>();
    const second = deferred<MoviesListResult>();
    const signals: AbortSignal[] = [];
    const baseAdapter = createInMemoryMoviesContentAdapter({});
    const remote: MoviesContentRemote = {
      ...baseAdapter,
      fetchList: vi.fn((_, options) => {
        signals.push(options.signal);
        return signals.length === 1 ? first.promise : second.promise;
      }),
    };
    const module = createMoviesContent(remote);
    const locale = ref<SupportedLocale>("en");
    const keyword = ref("first");
    const scope = effectScope();
    const resource = scope.run(() =>
      module.useCatalog(() => ({ keyword: keyword.value, media: "all" }), locale),
    );

    keyword.value = "second";
    await nextTick();

    expect(signals[0]?.aborted).toBe(true);
    first.resolve(list([movieDetail(550, "Stale")]));
    await settleContent();
    expect(resource?.state.value).toBe("loading");
    expect(resource?.content.value.items).toEqual([]);

    const currentMovie = movieDetail(551, "Current");
    second.resolve(list([currentMovie]));
    await settleContent();
    expect(resource?.state.value).toBe("ready");
    expect(resource?.content.value.items).toEqual([currentMovie]);
    scope.stop();
  });

  it("keeps ready catalog filters when only list criteria change", async () => {
    const movieFilters = filters("movie", 28, "Action");
    const pendingFilters = deferred<MoviesFiltersResult>();
    const firstMovie = movieDetail(550, "Popular");
    const secondMovie = movieDetail(551, "Newest");
    const baseAdapter = createInMemoryMoviesContentAdapter({
      lists: [
        {
          query: { limit: 1, media: "movie", page: 1, sort: "popular" },
          value: list([firstMovie]),
        },
        {
          query: { limit: 1, media: "movie", page: 1, sort: "newest" },
          value: list([secondMovie]),
        },
      ],
    });
    let initialFiltersLoaded = false;
    const remote: MoviesContentRemote = {
      ...baseAdapter,
      fetchFilters: () => {
        if (!initialFiltersLoaded) {
          initialFiltersLoaded = true;
          return Promise.resolve(movieFilters);
        }
        return pendingFilters.promise;
      },
    };
    const module = createMoviesContent(remote);
    const locale = ref<SupportedLocale>("en");
    const query = ref<MoviesListQuery>({ limit: 1, media: "movie", sort: "popular" });
    const scope = effectScope();
    const resource = scope.run(() => module.useCatalog(() => query.value, locale));

    await settleContent();
    expect(resource?.filterState.value).toBe("ready");
    expect(resource?.content.value.filters).toEqual(movieFilters);

    query.value = { limit: 1, media: "movie", sort: "newest" };
    await nextTick();

    expect(resource?.filterState.value).toBe("ready");
    expect(resource?.content.value.filters).toEqual(movieFilters);
    scope.stop();
  });

  it("assembles Home rows and Continue Watching behind one interface", async () => {
    const featured = movieDetail(550, "Fight Club");
    const rowMovie = movieDetail(551, "Discovery");
    const period = ref<MoviesListPeriod>("week");
    const records: readonly MoviesContinueWatchingRecord[] = [
      {
        progress: { currentTime: 50, duration: 100, updatedAt: 1 },
        target: { kind: "movie", slug: "fight-club", tmdbId: 550 },
      },
    ];
    const module = createMoviesContent(
      createInMemoryMoviesContentAdapter({
        details: [{ mediaType: "movie", tmdbId: 550, value: featured }],
        lists: [
          {
            query: { kind: "trending-movie", limit: 6, period: "week" },
            value: list([featured]),
          },
          ...HOME_DISCOVERY_GROUPS.flatMap((group) =>
            group.rows.map((row) => ({
              query: {
                ...row.query,
                limit: 12,
                ...(group.id === "trending" ? { period: period.value } : {}),
              },
              value: list([rowMovie]),
            })),
          ),
        ],
      }),
    );
    const locale = ref<SupportedLocale>("en");
    const scope = effectScope();
    const resource = scope.run(() =>
      module.useHome(
        () => period.value,
        () => records,
        locale,
      ),
    );

    expect(resource?.state.value).toBe("loading");
    await settleContent();

    expect(resource?.state.value).toBe("ready");
    expect(resource?.content.value.featured).toEqual([featured]);
    expect(resource?.content.value.rows[HOME_DISCOVERY_GROUPS[0]!.rows[0]!.id]).toEqual([rowMovie]);
    expect(resource?.content.value.continueWatchingItems).toEqual([
      expect.objectContaining({
        id: "movie-550",
        progressPercent: 50,
        title: "Fight Club",
      }),
    ]);
    scope.stop();
  });

  it("reconciles cached Continue Watching items before refreshing them", async () => {
    const removedMovie = movieDetail(550, "Fight Club");
    const survivingMovie = movieDetail(551, "Survivor");
    const rowMovie = movieDetail(552, "Discovery");
    const survivorRefresh = deferred<MovieDetail>();
    const records = ref<readonly MoviesContinueWatchingRecord[]>([
      {
        progress: { currentTime: 25, duration: 100, updatedAt: 2 },
        target: { kind: "movie", slug: "fight-club", tmdbId: 550 },
      },
      {
        progress: { currentTime: 50, duration: 100, updatedAt: 1 },
        target: { kind: "movie", slug: "survivor", tmdbId: 551 },
      },
    ]);
    let survivorRequests = 0;
    const baseAdapter = createInMemoryMoviesContentAdapter({
      lists: [
        {
          query: { kind: "trending-movie", limit: 6, period: "week" },
          value: list([removedMovie]),
        },
        ...HOME_DISCOVERY_GROUPS.flatMap((group) =>
          group.rows.map((row) => ({
            query: {
              ...row.query,
              limit: 12,
              ...(group.id === "trending" ? { period: "week" as const } : {}),
            },
            value: list([rowMovie]),
          })),
        ),
      ],
    });
    const remote: MoviesContentRemote = {
      ...baseAdapter,
      fetchDetail: vi.fn((_, tmdbId) => {
        if (tmdbId === removedMovie.tmdbId) {
          return Promise.resolve(removedMovie);
        }
        survivorRequests += 1;
        return survivorRequests === 1 ? Promise.resolve(survivingMovie) : survivorRefresh.promise;
      }),
    };
    const module = createMoviesContent(remote);
    const locale = ref<SupportedLocale>("en");
    const scope = effectScope();
    const resource = scope.run(() =>
      module.useHome(
        () => "week",
        () => records.value,
        locale,
      ),
    );

    await settleContent();
    expect(resource?.content.value.continueWatchingItems.map((item) => item.title)).toEqual([
      "Fight Club",
      "Survivor",
    ]);

    records.value = [records.value[1]!];
    resource?.refreshContinueWatching();

    expect(resource?.content.value.continueWatchingItems.map((item) => item.title)).toEqual([
      "Survivor",
    ]);

    survivorRefresh.reject(new Error("Offline"));
    await settleContent();
    expect(resource?.content.value.continueWatchingItems.map((item) => item.title)).toEqual([
      "Survivor",
    ]);
    scope.stop();
  });
});

async function settleContent(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly reject: (error: unknown) => void;
  readonly resolve: (value: T) => void;
} {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    reject = nextReject;
    resolve = nextResolve;
  });
  return { promise, reject, resolve };
}

function movieDetail(tmdbId: number, name: string): MovieDetail {
  return {
    backdropUrl: "",
    canonicalPath: `/movie/${tmdbId}`,
    cast: [],
    collection: null,
    content: "",
    crew: [],
    episodeTotal: "",
    facts: [],
    genres: [],
    id: `movie-${tmdbId}`,
    mediaType: "movie",
    name,
    originName: name,
    overview: "",
    play: null,
    posterUrl: "",
    rating: null,
    releaseDate: "",
    runtime: null,
    seasons: [],
    slug: name.toLowerCase().replaceAll(" ", "-"),
    status: "",
    thumbUrl: "",
    tmdbId,
    year: null,
  };
}

function moviePerson(tmdbId: number, name: string): MoviePersonDetail {
  return {
    biography: "",
    birthday: "",
    canonicalPath: `/person/${tmdbId}`,
    credits: [],
    deathday: "",
    facts: [],
    id: `person-${tmdbId}`,
    knownFor: [],
    knownForDepartment: "",
    name,
    placeOfBirth: "",
    profileUrl: "",
    slug: name.toLowerCase().replaceAll(" ", "-"),
    tmdbId,
  };
}

function list(items: readonly MovieSummary[], currentPage = 1, totalPages = 1): MoviesListResult {
  return {
    items,
    pagination: {
      currentPage,
      totalItems: items.length * totalPages,
      totalItemsPerPage: items.length,
      totalPages,
    },
  };
}

function filters(media: "movie" | "tv", genreId: number, genreName: string): MoviesFiltersResult {
  return {
    countries: [{ code: "VN", name: "Vietnam" }],
    genres: [{ id: genreId, name: genreName, slug: genreName.toLowerCase().replaceAll(" ", "-") }],
    media,
    sortOptions: [{ label: "Popular", value: "popular" }],
  };
}
