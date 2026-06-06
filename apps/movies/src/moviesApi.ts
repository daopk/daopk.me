export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export type MoviesViewName = "home" | "list" | "detail" | "episode" | "person";
export type MovieMediaType = "movie" | "tv";
export type MoviesSearchMedia = "all" | MovieMediaType;
export type MoviesCountryCode = "CN" | "FR" | "GB" | "IN" | "JP" | "KR" | "TH" | "US" | "VN";
export type MoviesCountryFilter = "all" | MoviesCountryCode;
export type MoviesListKind =
  | "trending-movie"
  | "trending-tv"
  | "popular-movie"
  | "popular-tv"
  | "now-playing"
  | "airing-today";

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
  readonly country?: MoviesCountryCode;
  readonly kind?: MoviesListKind;
  readonly keyword?: string;
  readonly media?: MoviesSearchMedia;
  readonly page?: number;
  readonly limit?: number;
}

export interface MoviesRowConfig {
  readonly id: string;
  readonly title: string;
  readonly query: MoviesListQuery;
}

export const HOME_DISCOVERY_ROWS: readonly MoviesRowConfig[] = [
  { id: "trending-movies", title: "Trending Movies", query: { kind: "trending-movie" } },
  { id: "trending-tv", title: "Trending TV", query: { kind: "trending-tv" } },
  { id: "now-playing", title: "Now Playing", query: { kind: "now-playing" } },
  { id: "popular-movies", title: "Popular Movies", query: { kind: "popular-movie" } },
  { id: "popular-tv", title: "Popular TV", query: { kind: "popular-tv" } },
  { id: "airing-today", title: "Airing Today", query: { kind: "airing-today" } },
];

export const LIST_KIND_LABELS: Record<MoviesListKind, string> = {
  "airing-today": "Airing Today",
  "now-playing": "Now Playing",
  "popular-movie": "Popular Movies",
  "popular-tv": "Popular TV",
  "trending-movie": "Trending Movies",
  "trending-tv": "Trending TV",
};

export const SEARCH_MEDIA_LABELS: Record<MoviesSearchMedia, string> = {
  all: "All",
  movie: "Movies",
  tv: "TV",
};

export const COUNTRY_FILTER_LABELS: Record<MoviesCountryFilter, string> = {
  all: "All countries",
  CN: "China",
  FR: "France",
  GB: "United Kingdom",
  IN: "India",
  JP: "Japan",
  KR: "Korea",
  TH: "Thailand",
  US: "United States",
  VN: "Vietnam",
};

export const COUNTRY_FILTER_OPTIONS: ReadonlyArray<{
  readonly label: string;
  readonly value: MoviesCountryFilter;
}> = (Object.entries(COUNTRY_FILTER_LABELS) as Array<[MoviesCountryFilter, string]>).map(
  ([value, label]) => ({ label, value }),
);

const DEFAULT_PAGE = 1;
export const DEFAULT_MOVIES_LIST_LIMIT = 32;
const DEFAULT_PAGINATION: MoviesPagination = {
  totalItems: 0,
  totalItemsPerPage: 0,
  currentPage: 1,
  totalPages: 1,
};

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

function slugFromText(value: string, fallback = "untitled"): string {
  const slug = value
    .replace(/\u0110/g, "D")
    .replace(/\u0111/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug.length > 0 ? slug : fallback;
}

function yearFromDate(value: string): number | null {
  const match = /^([1-9]\d{3})-\d{2}-\d{2}$/.exec(value);
  return match === null ? null : Number(match[1]);
}

function mediaTypeFromValue(value: unknown): MovieMediaType | null {
  return value === "movie" || value === "tv" ? value : null;
}

export function countryCodeFromFilter(value: MoviesCountryFilter): MoviesCountryCode | undefined {
  return value === "all" ? undefined : value;
}

export function countryFilterFromCode(value: MoviesCountryCode | undefined): MoviesCountryFilter {
  return value ?? "all";
}

export function countryLabelForCode(value: MoviesCountryCode | undefined): string {
  return value === undefined ? "" : COUNTRY_FILTER_LABELS[value];
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
    id: asNonEmptyString(entry.id) ?? slugFromText(name),
    name,
    slug: asNonEmptyString(entry.slug) ?? slugFromText(name),
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
    asNonEmptyString(entry.id) ?? (tmdbId === null ? slugFromText(name) : `person-${tmdbId}`);

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
  if (/^https:\/\//.test(path)) {
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

  const slug = asNonEmptyString(entry.slug) ?? slugFromText(name, `tmdb-${tmdbId}`);
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

  const slug = asNonEmptyString(payload.slug) ?? slugFromText(name, `person-${tmdbId}`);

  return {
    biography: asString(payload.biography),
    birthday: asString(payload.birthday),
    canonicalPath: asNonEmptyString(payload.canonicalPath) ?? `/person/${tmdbId}-${slug}`,
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
  const keyword = query.keyword?.trim();

  if (keyword !== undefined && keyword.length > 0) {
    const url = publicApiSearchUrl("/public/movies/search");
    url.searchParams.set("query", keyword);
    url.searchParams.set("media", query.media ?? "all");
    url.searchParams.set("page", String(page));
    if (query.country !== undefined) {
      url.searchParams.set("country", query.country);
    }
    return urlToFetchString(url);
  }

  const url = publicApiSearchUrl("/public/movies/list");
  url.searchParams.set("kind", query.kind ?? "trending-movie");
  url.searchParams.set("page", String(page));
  if (query.country !== undefined) {
    url.searchParams.set("country", query.country);
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
  const response = await fetch(url, {
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
    { kind: "trending-movie", limit: options.limit, page: options.page },
    { signal: options.signal },
  );
}

export async function fetchMoviesList(
  query: MoviesListQuery,
  options: { signal?: AbortSignal } = {},
): Promise<MoviesListResult> {
  const page = Math.max(1, query.page ?? DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(64, query.limit ?? DEFAULT_MOVIES_LIST_LIMIT));
  const payload = await fetchJson(buildMoviesListUrl({ ...query, page, limit }), {
    signal: options.signal,
  });
  const result = moviesListFromPayload(payload, { page, limit });
  return {
    items: result.items.slice(0, limit),
    pagination: {
      ...result.pagination,
      totalItemsPerPage: limit,
    },
  };
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
  const country = countryLabelForCode(query.country);
  const suffix = country.length > 0 ? ` · ${country}` : "";
  if (keyword !== undefined && keyword.length > 0) {
    const media = query.media ?? "all";
    const title =
      media === "all" ? `Search: ${keyword}` : `Search ${SEARCH_MEDIA_LABELS[media]}: ${keyword}`;
    return `${title}${suffix}`;
  }
  if (query.kind !== undefined) {
    return `${LIST_KIND_LABELS[query.kind]}${suffix}`;
  }
  return `Movies${suffix}`;
}

function publicApiSearchUrl(pathname: string): URL {
  return new URL(publicApiUrl(pathname), "https://daopk.local");
}

function urlToFetchString(url: URL): string {
  return url.origin === "https://daopk.local" ? `${url.pathname}${url.search}` : url.toString();
}
