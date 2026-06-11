import { browserPreferredLocale, type SupportedLocale } from "@daopk/sdk";

import { movieSlugFromText } from "./utils/movieSlug";

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export type MoviesViewName = "home" | "list" | "detail" | "episode" | "person";
export type MovieMediaType = "movie" | "tv";
export type MoviesSearchMedia = "all" | MovieMediaType;
export type MoviesListPeriod = "day" | "week";
export type MoviesListSort = "popular" | "newest" | "top-rated";
export type MoviesListKind = "trending-movie" | "trending-tv";

export interface MovieTaxonomyItem {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface MovieSummary {
  readonly backdropUrl: string;
  readonly canonicalPath: string;
  readonly genres: readonly MovieTaxonomyItem[];
  readonly id: string;
  readonly mediaType: MovieMediaType;
  readonly name: string;
  readonly originName: string;
  readonly overview: string;
  readonly posterUrl: string;
  readonly rating: number | null;
  readonly releaseDate: string;
  readonly slug: string;
  readonly thumbUrl: string;
  readonly tmdbId: number;
  readonly year: number | null;
}

export interface MovieFact {
  readonly label: string;
  readonly value: string;
}

export interface MoviePersonCredit {
  readonly episodeCount: number | null;
  readonly id: string;
  readonly name: string;
  readonly profileUrl: string;
  readonly role: string;
  readonly tmdbId: number | null;
}

export interface MoviePersonDetail {
  readonly biography: string;
  readonly birthday: string;
  readonly canonicalPath: string;
  readonly credits: readonly MovieSummary[];
  readonly deathday: string;
  readonly facts: readonly MovieFact[];
  readonly id: string;
  readonly knownFor: readonly MovieSummary[];
  readonly knownForDepartment: string;
  readonly name: string;
  readonly placeOfBirth: string;
  readonly profileUrl: string;
  readonly slug: string;
  readonly tmdbId: number;
}

export interface MoviePlaySource {
  readonly embedUrl: string;
  readonly filename: string;
  readonly m3u8Url: string;
  readonly name: string;
  readonly serverName: string;
  readonly slug: string;
}

export interface MoviePlayInfo {
  readonly slug: string;
  readonly sources: readonly MoviePlaySource[];
}

export interface MovieSeason {
  readonly airDate: string;
  readonly episodeCount: number | null;
  readonly id: string;
  readonly name: string;
  readonly overview: string;
  readonly posterUrl: string;
  readonly seasonNumber: number;
  readonly year: number | null;
}

export interface MovieSeasonEpisode {
  readonly airDate: string;
  readonly episodeNumber: number;
  readonly id: string;
  readonly name: string;
  readonly overview: string;
  readonly play: MoviePlayInfo | null;
  readonly rating: number | null;
  readonly runtime: number | null;
  readonly seasonNumber: number;
  readonly stillUrl: string;
  readonly tmdbId: number | null;
}

export interface MovieSeasonDetail extends MovieSeason {
  readonly episodes: readonly MovieSeasonEpisode[];
}

export interface MovieEpisodeTarget {
  readonly episodeNumber: number;
  readonly seasonNumber: number;
  readonly slug: string;
  readonly tmdbId: number;
}

export interface MovieEpisodeDetail {
  readonly episode: MovieSeasonEpisode;
  readonly season: MovieSeasonDetail;
  readonly series: MovieDetail;
}

export interface MovieCollection {
  readonly backdropUrl: string;
  readonly id: string;
  readonly name: string;
  readonly overview: string;
  readonly parts: readonly MovieSummary[];
  readonly posterUrl: string;
  readonly tmdbId: number;
}

export interface MovieDetail extends MovieSummary {
  readonly cast: readonly MoviePersonCredit[];
  readonly collection: MovieCollection | null;
  readonly content: string;
  readonly crew: readonly MoviePersonCredit[];
  readonly status: string;
  readonly episodeTotal: string;
  readonly facts: readonly MovieFact[];
  readonly play: MoviePlayInfo | null;
  readonly runtime: number | null;
  readonly seasons: readonly MovieSeason[];
}

export interface MoviesPagination {
  readonly totalItems: number;
  readonly totalItemsPerPage: number;
  readonly currentPage: number;
  readonly totalPages: number;
}

export interface MoviesListResult {
  readonly items: readonly MovieSummary[];
  readonly pagination: MoviesPagination;
}

export interface MoviesListQuery {
  readonly country?: string;
  readonly countryName?: string;
  readonly filterFocus?: "country" | "genre";
  readonly genre?: number;
  readonly genreName?: string;
  readonly kind?: MoviesListKind;
  readonly keyword?: string;
  readonly limit?: number;
  readonly media?: MoviesSearchMedia;
  readonly page?: number;
  readonly period?: MoviesListPeriod;
  readonly sort?: MoviesListSort;
}

export interface MoviesFilterGenre {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
}

export interface MoviesFilterCountry {
  readonly code: string;
  readonly name: string;
}

export interface MoviesFilterSortOption {
  readonly label: string;
  readonly value: MoviesListSort;
}

export interface MoviesFiltersResult {
  readonly countries: readonly MoviesFilterCountry[];
  readonly genres: readonly MoviesFilterGenre[];
  readonly media: MovieMediaType;
  readonly sortOptions: readonly MoviesFilterSortOption[];
}

export interface MoviesRowConfig {
  readonly id: string;
  readonly title: string;
  readonly query: MoviesListQuery;
}

export interface MoviesPeriodOption {
  readonly label: string;
  readonly value: MoviesListPeriod;
}

export interface MoviesRowGroupConfig {
  readonly defaultPeriod?: MoviesListPeriod;
  readonly id: "countries" | "genres" | "trending";
  readonly periodOptions?: readonly MoviesPeriodOption[];
  readonly rows: readonly MoviesRowConfig[];
  readonly title: string;
}

function staticGenre(id: number, name: string): MoviesFilterGenre {
  return { id, name, slug: movieSlugFromText(name) };
}

const STATIC_FILTER_COUNTRIES: readonly MoviesFilterCountry[] = [
  { code: "VN", name: "Vietnam" },
  { code: "US", name: "United States of America" },
  { code: "KR", name: "South Korea" },
  { code: "JP", name: "Japan" },
  { code: "CN", name: "China" },
  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "IN", name: "India" },
  { code: "TH", name: "Thailand" },
  { code: "HK", name: "Hong Kong" },
  { code: "TW", name: "Taiwan" },
];

const STATIC_FILTER_SORT_OPTIONS: readonly MoviesFilterSortOption[] = [
  { label: "Popular", value: "popular" },
  { label: "Newest", value: "newest" },
  { label: "Top Rated", value: "top-rated" },
];

export const STATIC_MOVIES_FILTERS: Readonly<Record<MovieMediaType, MoviesFiltersResult>> = {
  movie: {
    countries: STATIC_FILTER_COUNTRIES,
    genres: [
      staticGenre(28, "Action"),
      staticGenre(12, "Adventure"),
      staticGenre(16, "Animation"),
      staticGenre(35, "Comedy"),
      staticGenre(80, "Crime"),
      staticGenre(99, "Documentary"),
      staticGenre(18, "Drama"),
      staticGenre(10751, "Family"),
      staticGenre(14, "Fantasy"),
      staticGenre(36, "History"),
      staticGenre(27, "Horror"),
      staticGenre(10402, "Music"),
      staticGenre(9648, "Mystery"),
      staticGenre(10749, "Romance"),
      staticGenre(878, "Science Fiction"),
      staticGenre(10770, "TV Movie"),
      staticGenre(53, "Thriller"),
      staticGenre(10752, "War"),
      staticGenre(37, "Western"),
    ],
    media: "movie",
    sortOptions: STATIC_FILTER_SORT_OPTIONS,
  },
  tv: {
    countries: STATIC_FILTER_COUNTRIES,
    genres: [
      staticGenre(10759, "Action & Adventure"),
      staticGenre(16, "Animation"),
      staticGenre(35, "Comedy"),
      staticGenre(80, "Crime"),
      staticGenre(99, "Documentary"),
      staticGenre(18, "Drama"),
      staticGenre(10751, "Family"),
      staticGenre(10762, "Kids"),
      staticGenre(9648, "Mystery"),
      staticGenre(10763, "News"),
      staticGenre(10764, "Reality"),
      staticGenre(10765, "Sci-Fi & Fantasy"),
      staticGenre(10766, "Soap"),
      staticGenre(10767, "Talk"),
      staticGenre(10768, "War & Politics"),
      staticGenre(37, "Western"),
    ],
    media: "tv",
    sortOptions: STATIC_FILTER_SORT_OPTIONS,
  },
};

export const HOME_DISCOVERY_GROUPS: readonly MoviesRowGroupConfig[] = [
  {
    defaultPeriod: "week",
    id: "trending",
    periodOptions: [
      { label: "Day", value: "day" },
      { label: "Week", value: "week" },
    ],
    rows: [
      { id: "trending-movies", title: "Movies", query: { kind: "trending-movie" } },
      { id: "trending-tv", title: "TV", query: { kind: "trending-tv" } },
    ],
    title: "Trending",
  },
  {
    id: "countries",
    rows: [
      {
        id: "south-korea-all-titles",
        title: "South Korea",
        query: {
          country: "KR",
          countryName: "South Korea",
          media: "all",
          sort: "top-rated",
        },
      },
      {
        id: "china-all-titles",
        title: "China",
        query: {
          country: "CN",
          countryName: "China",
          media: "all",
          sort: "top-rated",
        },
      },
      {
        id: "united-states-all-titles",
        title: "United States",
        query: {
          country: "US",
          countryName: "United States of America",
          media: "all",
          sort: "top-rated",
        },
      },
      {
        id: "united-kingdom-all-titles",
        title: "United Kingdom",
        query: {
          country: "GB",
          countryName: "United Kingdom",
          media: "all",
          sort: "top-rated",
        },
      },
    ],
    title: "Countries",
  },
  {
    id: "genres",
    rows: [
      {
        id: "action-movies",
        title: "Action",
        query: {
          genre: 28,
          genreName: "Action",
          media: "movie",
          sort: "top-rated",
        },
      },
      {
        id: "comedy-movies",
        title: "Comedy",
        query: {
          genre: 35,
          genreName: "Comedy",
          media: "movie",
          sort: "top-rated",
        },
      },
      {
        id: "animation-movies",
        title: "Animation",
        query: {
          genre: 16,
          genreName: "Animation",
          media: "movie",
          sort: "top-rated",
        },
      },
      {
        id: "science-fiction-movies",
        title: "Science Fiction",
        query: {
          genre: 878,
          genreName: "Science Fiction",
          media: "movie",
          sort: "top-rated",
        },
      },
    ],
    title: "Genres",
  },
];

export const LIST_KIND_LABELS: Record<MoviesListKind, string> = {
  "trending-movie": "Trending Movies",
  "trending-tv": "Trending TV",
};

export const SEARCH_MEDIA_LABELS: Record<MoviesSearchMedia, string> = {
  all: "All",
  movie: "Movies",
  tv: "TV",
};

const DEFAULT_PAGE = 1;
export const DEFAULT_MOVIES_LIST_LIMIT = 24;
const MAX_MOVIES_LIST_LIMIT = 100;
const MOVIES_API_LANGUAGE_BY_LOCALE = {
  en: "en-US",
  vi: "vi-VN",
} as const satisfies Record<SupportedLocale, string>;
const DEFAULT_PAGINATION: MoviesPagination = {
  totalItems: 0,
  totalItemsPerPage: 0,
  currentPage: 1,
  totalPages: 1,
};

let currentMoviesApiLocale: SupportedLocale | null = null;

export function setMoviesApiLocale(locale: SupportedLocale): void {
  currentMoviesApiLocale = locale;
}

export function moviesApiLanguageForLocale(locale: SupportedLocale): string {
  return MOVIES_API_LANGUAGE_BY_LOCALE[locale];
}

function currentMoviesApiLanguage(): string {
  return moviesApiLanguageForLocale(currentMoviesApiLocale ?? browserPreferredLocale());
}

function publicApiUrl(pathname: string): string {
  const configured = import.meta.env.VITE_PUBLIC_API_ORIGIN;
  const origin =
    configured === undefined || configured.length === 0 ? "" : configured.replace(/\/+$/, "");
  return `${origin}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNonEmptyString(value: unknown): string | null {
  const text = asString(value).trim();
  return text.length > 0 ? text : null;
}

function asHttpsUrl(value: unknown): string | null {
  const text = asNonEmptyString(value);
  if (text === null) {
    return null;
  }

  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function asPositiveInteger(value: unknown): number | null {
  const number = asInteger(value);
  return number !== null && number > 0 ? number : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  const number = asInteger(value);
  return number !== null && number >= 0 ? number : null;
}

function yearFromDate(value: string): number | null {
  const match = /^([1-9]\d{3})-\d{2}-\d{2}$/.exec(value);
  return match === null ? null : Number(match[1]);
}

function mediaTypeFromValue(value: unknown): MovieMediaType | null {
  return value === "movie" || value === "tv" ? value : null;
}

function taxonomyFromEntry(entry: unknown): MovieTaxonomyItem | null {
  if (!isRecord(entry)) {
    return null;
  }

  const name = asNonEmptyString(entry.name);
  if (name === null) {
    return null;
  }

  return {
    id: asNonEmptyString(entry.id) ?? movieSlugFromText(name),
    name,
    slug: asNonEmptyString(entry.slug) ?? movieSlugFromText(name),
  };
}

function taxonomyList(value: unknown): readonly MovieTaxonomyItem[] {
  return Array.isArray(value)
    ? value.map(taxonomyFromEntry).filter((entry): entry is MovieTaxonomyItem => entry !== null)
    : [];
}

function factFromEntry(entry: unknown): MovieFact | null {
  if (!isRecord(entry)) {
    return null;
  }

  const label = asNonEmptyString(entry.label);
  const value = asNonEmptyString(entry.value);
  return label === null || value === null ? null : { label, value };
}

function factList(value: unknown): readonly MovieFact[] {
  return Array.isArray(value)
    ? value.map(factFromEntry).filter((entry): entry is MovieFact => entry !== null)
    : [];
}

function personCreditFromEntry(entry: unknown): MoviePersonCredit | null {
  if (!isRecord(entry)) {
    return null;
  }

  const name = asNonEmptyString(entry.name);
  if (name === null) {
    return null;
  }
  const tmdbId = asPositiveInteger(entry.tmdbId);
  const id =
    asNonEmptyString(entry.id) ?? (tmdbId === null ? movieSlugFromText(name) : `person-${tmdbId}`);

  return {
    episodeCount: asPositiveInteger(entry.episodeCount),
    id,
    name,
    profileUrl: asString(entry.profileUrl),
    role: asString(entry.role),
    tmdbId,
  };
}

function personCreditList(value: unknown): readonly MoviePersonCredit[] {
  return Array.isArray(value)
    ? value.map(personCreditFromEntry).filter((entry): entry is MoviePersonCredit => entry !== null)
    : [];
}

function movieSummaryList(value: unknown): readonly MovieSummary[] {
  return Array.isArray(value)
    ? value.map(movieSummaryFromEntry).filter((entry): entry is MovieSummary => entry !== null)
    : [];
}

function playSourceFromEntry(entry: unknown): MoviePlaySource | null {
  if (!isRecord(entry)) {
    return null;
  }

  const m3u8Url = asHttpsUrl(entry.m3u8Url);
  if (m3u8Url === null) {
    return null;
  }

  return {
    embedUrl: asString(entry.embedUrl),
    filename: asString(entry.filename),
    m3u8Url,
    name: asString(entry.name),
    serverName: asString(entry.serverName),
    slug: asString(entry.slug),
  };
}

function playInfoFromPayload(payload: unknown): MoviePlayInfo | null {
  if (!isRecord(payload)) {
    return null;
  }

  const sources = Array.isArray(payload.sources)
    ? payload.sources
        .map(playSourceFromEntry)
        .filter((entry): entry is MoviePlaySource => entry !== null)
    : [];
  if (sources.length === 0) {
    return null;
  }

  return {
    slug: asString(payload.slug),
    sources,
  };
}

function seasonFromEntry(entry: unknown): MovieSeason | null {
  if (!isRecord(entry)) {
    return null;
  }

  const seasonNumber = asNonNegativeInteger(entry.seasonNumber);
  const name = asNonEmptyString(entry.name);
  if (seasonNumber === null || name === null) {
    return null;
  }
  const airDate = asString(entry.airDate);

  return {
    airDate,
    episodeCount: asPositiveInteger(entry.episodeCount),
    id: asNonEmptyString(entry.id) ?? `season-${seasonNumber}`,
    name,
    overview: asString(entry.overview),
    posterUrl: asString(entry.posterUrl),
    seasonNumber,
    year: asInteger(entry.year) ?? yearFromDate(airDate),
  };
}

function seasonList(value: unknown): readonly MovieSeason[] {
  return Array.isArray(value)
    ? value.map(seasonFromEntry).filter((entry): entry is MovieSeason => entry !== null)
    : [];
}

function seasonEpisodeFromEntry(entry: unknown): MovieSeasonEpisode | null {
  if (!isRecord(entry)) {
    return null;
  }

  const episodeNumber = asPositiveInteger(entry.episodeNumber);
  const seasonNumber = asNonNegativeInteger(entry.seasonNumber);
  const name = asNonEmptyString(entry.name);
  if (episodeNumber === null || seasonNumber === null || name === null) {
    return null;
  }

  const tmdbId = asPositiveInteger(entry.tmdbId);

  return {
    airDate: asString(entry.airDate),
    episodeNumber,
    id:
      asNonEmptyString(entry.id) ??
      (tmdbId === null ? `season-${seasonNumber}-episode-${episodeNumber}` : `episode-${tmdbId}`),
    name,
    overview: asString(entry.overview),
    play: playInfoFromPayload(entry.play),
    rating: asNumber(entry.rating),
    runtime: asNumber(entry.runtime),
    seasonNumber,
    stillUrl: asString(entry.stillUrl),
    tmdbId,
  };
}

function seasonEpisodeList(value: unknown): readonly MovieSeasonEpisode[] {
  return Array.isArray(value)
    ? value
        .map(seasonEpisodeFromEntry)
        .filter((entry): entry is MovieSeasonEpisode => entry !== null)
    : [];
}

export function tmdbImageUrl(value: unknown, size = "w500"): string {
  const path = asNonEmptyString(value);
  if (path === null) {
    return "";
  }
  if (path.startsWith("https://")) {
    return path;
  }
  if (!/^\/[A-Za-z0-9_.-]+$/.test(path)) {
    return "";
  }
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function movieSummaryFromEntry(entry: unknown): MovieSummary | null {
  if (!isRecord(entry)) {
    return null;
  }

  const mediaType = mediaTypeFromValue(entry.mediaType);
  const tmdbId = asPositiveInteger(entry.tmdbId);
  const name = asNonEmptyString(entry.name);
  if (mediaType === null || tmdbId === null || name === null) {
    return null;
  }

  const slug = asNonEmptyString(entry.slug) ?? movieSlugFromText(name, `tmdb-${tmdbId}`);
  const canonicalPath = asNonEmptyString(entry.canonicalPath) ?? `/${mediaType}/${tmdbId}-${slug}`;
  const posterUrl = asString(entry.posterUrl);
  const backdropUrl = asString(entry.backdropUrl);
  const releaseDate = asString(entry.releaseDate);

  return {
    backdropUrl,
    canonicalPath,
    genres: taxonomyList(entry.genres),
    id: asNonEmptyString(entry.id) ?? `${mediaType}-${tmdbId}`,
    mediaType,
    name,
    originName: asString(entry.originName),
    overview: asString(entry.overview),
    posterUrl,
    rating: asNumber(entry.rating),
    releaseDate,
    slug,
    thumbUrl: asString(entry.thumbUrl) || backdropUrl || posterUrl,
    tmdbId,
    year: asInteger(entry.year) ?? yearFromDate(releaseDate),
  };
}

function collectionFromPayload(payload: unknown): MovieCollection | null {
  if (!isRecord(payload)) {
    return null;
  }

  const tmdbId = asPositiveInteger(payload.tmdbId);
  const name = asNonEmptyString(payload.name);
  if (tmdbId === null || name === null) {
    return null;
  }

  const parts = Array.isArray(payload.parts)
    ? payload.parts
        .map(movieSummaryFromEntry)
        .filter((entry): entry is MovieSummary => entry !== null)
    : [];

  return {
    backdropUrl: asString(payload.backdropUrl),
    id: asNonEmptyString(payload.id) ?? `collection-${tmdbId}`,
    name,
    overview: asString(payload.overview),
    parts,
    posterUrl: asString(payload.posterUrl),
    tmdbId,
  };
}

export function movieDetailFromPayload(payload: unknown): MovieDetail | null {
  const summary = movieSummaryFromEntry(payload);
  if (summary === null || !isRecord(payload)) {
    return null;
  }

  return {
    ...summary,
    cast: personCreditList(payload.cast),
    collection: collectionFromPayload(payload.collection),
    content: asString(payload.content) || summary.overview,
    crew: personCreditList(payload.crew),
    episodeTotal: asString(payload.episodeTotal),
    facts: factList(payload.facts),
    play: playInfoFromPayload(payload.play),
    runtime: asNumber(payload.runtime),
    seasons: seasonList(payload.seasons),
    status: asString(payload.status),
  };
}

export function moviePersonFromPayload(payload: unknown): MoviePersonDetail | null {
  if (!isRecord(payload)) {
    return null;
  }

  const tmdbId = asPositiveInteger(payload.tmdbId);
  const name = asNonEmptyString(payload.name);
  if (tmdbId === null || name === null) {
    return null;
  }

  const slug = asNonEmptyString(payload.slug) ?? movieSlugFromText(name, `person-${tmdbId}`);

  return {
    biography: asString(payload.biography),
    birthday: asString(payload.birthday),
    canonicalPath: asNonEmptyString(payload.canonicalPath) ?? `/tmdb/person/${tmdbId}-${slug}`,
    credits: movieSummaryList(payload.credits),
    deathday: asString(payload.deathday),
    facts: factList(payload.facts),
    id: asNonEmptyString(payload.id) ?? `person-${tmdbId}`,
    knownFor: movieSummaryList(payload.knownFor),
    knownForDepartment: asString(payload.knownForDepartment),
    name,
    placeOfBirth: asString(payload.placeOfBirth),
    profileUrl: asString(payload.profileUrl),
    slug,
    tmdbId,
  };
}

export function movieSeasonFromPayload(payload: unknown): MovieSeasonDetail | null {
  const season = seasonFromEntry(payload);
  if (season === null || !isRecord(payload)) {
    return null;
  }

  return {
    ...season,
    episodes: seasonEpisodeList(payload.episodes),
  };
}

export function movieEpisodeDetailFromParts(
  series: MovieDetail,
  season: MovieSeasonDetail,
  episodeNumber: number,
): MovieEpisodeDetail | null {
  const episode =
    Number.isSafeInteger(episodeNumber) && episodeNumber > 0
      ? season.episodes.find((entry) => entry.episodeNumber === episodeNumber)
      : undefined;
  return episode === undefined ? null : { episode, season, series };
}

function paginationFromRecord(record: unknown, page: number, limit: number): MoviesPagination {
  if (!isRecord(record)) {
    return {
      ...DEFAULT_PAGINATION,
      currentPage: page,
      totalItemsPerPage: limit,
    };
  }

  return {
    totalItems: asInteger(record.totalItems) ?? 0,
    totalItemsPerPage: asInteger(record.totalItemsPerPage) ?? limit,
    currentPage: asInteger(record.currentPage) ?? page,
    totalPages: asInteger(record.totalPages) ?? 1,
  };
}

export function moviesListFromPayload(
  payload: unknown,
  fallback: { page: number; limit: number },
): MoviesListResult {
  if (!isRecord(payload)) {
    return {
      items: [],
      pagination: paginationFromRecord(undefined, fallback.page, fallback.limit),
    };
  }

  const items = Array.isArray(payload.items)
    ? payload.items.map(movieSummaryFromEntry).filter((item): item is MovieSummary => item !== null)
    : [];

  return {
    items,
    pagination: paginationFromRecord(payload.pagination, fallback.page, fallback.limit),
  };
}

export function buildMoviesListUrl(query: MoviesListQuery = {}): string {
  const page = Math.max(1, query.page ?? DEFAULT_PAGE);
  const limit = Math.max(
    1,
    Math.min(MAX_MOVIES_LIST_LIMIT, query.limit ?? DEFAULT_MOVIES_LIST_LIMIT),
  );
  const keyword = query.keyword?.trim();

  if (keyword !== undefined && keyword.length > 0) {
    const url = publicApiSearchUrl("/public/movies/search");
    url.searchParams.set("query", keyword);
    url.searchParams.set("media", query.media ?? "all");
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));
    return urlToFetchString(url);
  }

  const url = publicApiSearchUrl("/public/movies/list");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  if (query.kind !== undefined) {
    url.searchParams.set("kind", query.kind);
  } else {
    url.searchParams.set(
      "media",
      query.media === "all" || query.media === "tv" ? query.media : "movie",
    );
  }

  if (query.kind !== undefined && query.period !== undefined) {
    url.searchParams.set("period", query.period);
  }
  if (query.kind === undefined && query.genre !== undefined) {
    url.searchParams.set("genre", String(query.genre));
  }
  if (query.kind === undefined && query.country !== undefined && query.country.trim().length > 0) {
    url.searchParams.set("country", query.country.trim().toUpperCase());
  }
  if (query.kind === undefined && query.sort !== undefined) {
    url.searchParams.set("sort", query.sort);
  }
  return urlToFetchString(url);
}

export function buildMovieSeasonUrl(tmdbId: number, seasonNumber: number): string {
  return publicApiUrl(
    `/public/movies/season/${encodeURIComponent(String(tmdbId))}/${encodeURIComponent(
      String(seasonNumber),
    )}`,
  );
}

export function buildMoviePersonUrl(tmdbId: number): string {
  return publicApiUrl(`/public/movies/person/${encodeURIComponent(String(tmdbId))}`);
}

async function fetchJson(url: string, options: { signal?: AbortSignal } = {}): Promise<unknown> {
  const response = await fetch(urlWithMoviesApiLanguage(url), {
    signal: options.signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Movies request failed (${response.status}).`);
  }
  return response.json();
}

export async function fetchLatestMovies(
  options: { page?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<MoviesListResult> {
  return fetchMoviesList(
    { kind: "trending-movie", limit: options.limit, page: options.page, period: "week" },
    { signal: options.signal },
  );
}

export async function fetchMoviesList(
  query: MoviesListQuery,
  options: { signal?: AbortSignal } = {},
): Promise<MoviesListResult> {
  const page = Math.max(1, query.page ?? DEFAULT_PAGE);
  const limit = Math.max(
    1,
    Math.min(MAX_MOVIES_LIST_LIMIT, query.limit ?? DEFAULT_MOVIES_LIST_LIMIT),
  );

  if (isCatalogAllListQuery(query)) {
    return fetchCombinedMoviesList({ ...query, limit, page }, options);
  }

  const payload = await fetchJson(buildMoviesListUrl({ ...query, page, limit }), {
    signal: options.signal,
  });
  const result = moviesListFromPayload(payload, { page, limit });
  return {
    items: result.items.slice(0, limit),
    pagination: result.pagination,
  };
}

function isCatalogAllListQuery(query: MoviesListQuery): boolean {
  const keyword = query.keyword?.trim();
  return (
    query.kind === undefined &&
    query.media === "all" &&
    (keyword === undefined || keyword.length === 0)
  );
}

async function fetchCombinedMoviesList(
  query: MoviesListQuery & { readonly limit: number; readonly page: number },
  options: { signal?: AbortSignal },
): Promise<MoviesListResult> {
  const movieLimit = Math.max(1, Math.ceil(query.limit / 2));
  const tvLimit = Math.max(1, query.limit - movieLimit);
  const [movieResult, tvResult] = await Promise.all([
    fetchMoviesList({ ...query, limit: movieLimit, media: "movie" }, options),
    fetchMoviesList({ ...query, limit: tvLimit, media: "tv" }, options),
  ]);
  const items = combinedMoviesListItems(movieResult.items, tvResult.items, query.sort).slice(
    0,
    query.limit,
  );

  return {
    items,
    pagination: {
      currentPage: query.page,
      totalItems: movieResult.pagination.totalItems + tvResult.pagination.totalItems,
      totalItemsPerPage: items.length,
      totalPages: Math.max(movieResult.pagination.totalPages, tvResult.pagination.totalPages),
    },
  };
}

function combinedMoviesListItems(
  movieItems: readonly MovieSummary[],
  tvItems: readonly MovieSummary[],
  sort: MoviesListSort | undefined,
): readonly MovieSummary[] {
  const items = [...movieItems, ...tvItems];
  if (sort === "newest") {
    return items.sort((a, b) => releaseTimestamp(b) - releaseTimestamp(a));
  }
  if (sort === "top-rated") {
    return items.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }

  return interleaveMoviesListItems(movieItems, tvItems);
}

function interleaveMoviesListItems(
  movieItems: readonly MovieSummary[],
  tvItems: readonly MovieSummary[],
): readonly MovieSummary[] {
  const items: MovieSummary[] = [];
  const length = Math.max(movieItems.length, tvItems.length);
  for (let index = 0; index < length; index += 1) {
    const movie = movieItems[index];
    const tv = tvItems[index];
    if (movie !== undefined) {
      items.push(movie);
    }
    if (tv !== undefined) {
      items.push(tv);
    }
  }
  return items;
}

function releaseTimestamp(movie: MovieSummary): number {
  const timestamp = Date.parse(movie.releaseDate);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export async function fetchMoviesFilters(
  media: MovieMediaType = "movie",
  _options: { signal?: AbortSignal } = {},
): Promise<MoviesFiltersResult> {
  return STATIC_MOVIES_FILTERS[media];
}

export async function fetchMovieDetail(
  mediaType: MovieMediaType,
  tmdbId: number,
  options: { signal?: AbortSignal } = {},
): Promise<MovieDetail> {
  const payload = await fetchJson(
    publicApiUrl(`/public/movies/detail/${mediaType}/${encodeURIComponent(String(tmdbId))}`),
    { signal: options.signal },
  );
  const detail = movieDetailFromPayload(payload);
  if (detail === null) {
    throw new Error("Movie detail response was not usable.");
  }
  return detail;
}

export async function fetchMoviePerson(
  tmdbId: number,
  options: { signal?: AbortSignal } = {},
): Promise<MoviePersonDetail> {
  const payload = await fetchJson(buildMoviePersonUrl(tmdbId), {
    signal: options.signal,
  });
  const person = moviePersonFromPayload(payload);
  if (person === null) {
    throw new Error("Movie person response was not usable.");
  }
  return person;
}

export async function fetchMovieSeason(
  tmdbId: number,
  seasonNumber: number,
  options: { signal?: AbortSignal } = {},
): Promise<MovieSeasonDetail> {
  const payload = await fetchJson(buildMovieSeasonUrl(tmdbId, seasonNumber), {
    signal: options.signal,
  });
  const season = movieSeasonFromPayload(payload);
  if (season === null) {
    throw new Error("Movie season response was not usable.");
  }
  return season;
}

export async function fetchMovieEpisode(
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  options: { signal?: AbortSignal } = {},
): Promise<MovieEpisodeDetail> {
  const [series, season] = await Promise.all([
    fetchMovieDetail("tv", tmdbId, { signal: options.signal }),
    fetchMovieSeason(tmdbId, seasonNumber, { signal: options.signal }),
  ]);
  const episode = movieEpisodeDetailFromParts(series, season, episodeNumber);
  if (episode === null) {
    throw new Error("Movie episode response was not usable.");
  }
  return episode;
}

export function listTitleForQuery(query: MoviesListQuery): string {
  const keyword = query.keyword?.trim();
  if (keyword !== undefined && keyword.length > 0) {
    const media = query.media ?? "all";
    return media === "all"
      ? `Search: ${keyword}`
      : `Search ${SEARCH_MEDIA_LABELS[media]}: ${keyword}`;
  }
  if (query.kind !== undefined) {
    const period = periodLabelForQuery(query);
    return period.length > 0
      ? `${LIST_KIND_LABELS[query.kind]} · ${period}`
      : LIST_KIND_LABELS[query.kind];
  }
  const title = query.media === "all" ? "All Titles" : query.media === "tv" ? "TV Shows" : "Movies";
  const filters = [query.genreName, query.countryName ?? query.country]
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);
  return filters.length > 0 ? `${title} · ${filters.join(" · ")}` : title;
}

function periodLabelForQuery(query: MoviesListQuery): string {
  if (query.kind === "trending-movie" || query.kind === "trending-tv") {
    return query.period === "day" ? "Day" : "Week";
  }

  return "";
}

function publicApiSearchUrl(pathname: string): URL {
  return new URL(publicApiUrl(pathname), "https://daopk.local");
}

function urlWithMoviesApiLanguage(urlValue: string): string {
  const url = new URL(urlValue, "https://daopk.local");
  url.searchParams.set("language", currentMoviesApiLanguage());
  return urlToFetchString(url);
}

function urlToFetchString(url: URL): string {
  return url.origin === "https://daopk.local" ? `${url.pathname}${url.search}` : url.toString();
}
