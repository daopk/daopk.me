import type { TranslationParams } from "@daopk/sdk";

import type {
  MoviesFilterCountry,
  MoviesFilterGenre,
  MoviesFilterSortOption,
  MoviesListKind,
  MoviesListPeriod,
  MoviesListQuery,
  MoviesSearchMedia,
  MoviesListSort,
  MoviesRowConfig,
  MoviesRowGroupConfig,
} from "../moviesApi";
import type { MoviesTranslationKey } from "./index";
import type { MoviesTranslate } from "./useMoviesI18n";

type OptionalTranslate = MoviesTranslate | undefined;
type MediaLabelVariant = "short" | "singular" | "plural" | "title";

const COUNTRY_NAME_KEYS: Readonly<Record<string, MoviesTranslationKey | undefined>> = {
  CN: "movies.country.CN",
  DE: "movies.country.DE",
  FR: "movies.country.FR",
  GB: "movies.country.GB",
  HK: "movies.country.HK",
  IN: "movies.country.IN",
  JP: "movies.country.JP",
  KR: "movies.country.KR",
  TH: "movies.country.TH",
  TW: "movies.country.TW",
  US: "movies.country.US",
  VN: "movies.country.VN",
};

const GENRE_NAME_KEYS: Readonly<Record<number, MoviesTranslationKey | undefined>> = {
  12: "movies.genre.12",
  14: "movies.genre.14",
  16: "movies.genre.16",
  18: "movies.genre.18",
  27: "movies.genre.27",
  28: "movies.genre.28",
  35: "movies.genre.35",
  36: "movies.genre.36",
  37: "movies.genre.37",
  53: "movies.genre.53",
  80: "movies.genre.80",
  99: "movies.genre.99",
  878: "movies.genre.878",
  9648: "movies.genre.9648",
  10402: "movies.genre.10402",
  10749: "movies.genre.10749",
  10751: "movies.genre.10751",
  10752: "movies.genre.10752",
  10759: "movies.genre.10759",
  10762: "movies.genre.10762",
  10763: "movies.genre.10763",
  10764: "movies.genre.10764",
  10765: "movies.genre.10765",
  10766: "movies.genre.10766",
  10767: "movies.genre.10767",
  10768: "movies.genre.10768",
  10770: "movies.genre.10770",
};

const SORT_LABEL_KEYS = {
  newest: "movies.sort.newest",
  popular: "movies.sort.popular",
  "top-rated": "movies.sort.topRated",
} as const satisfies Record<MoviesListSort, MoviesTranslationKey>;

const SORT_FALLBACKS = {
  newest: "Newest",
  popular: "Popular",
  "top-rated": "Top Rated",
} as const satisfies Record<MoviesListSort, string>;

const HOME_ROW_TITLE_KEYS: Readonly<Record<string, MoviesTranslationKey | undefined>> = {
  "action-movies": "movies.home.row.action",
  "animation-movies": "movies.home.row.animation",
  "china-all-titles": "movies.home.row.china",
  "comedy-movies": "movies.home.row.comedy",
  "science-fiction-movies": "movies.home.row.scienceFiction",
  "south-korea-all-titles": "movies.home.row.southKorea",
  "trending-movies": "movies.home.row.trendingMovies",
  "trending-tv": "movies.home.row.trendingTv",
  "united-kingdom-all-titles": "movies.home.row.unitedKingdom",
  "united-states-all-titles": "movies.home.row.unitedStates",
};

function formatFallback(template: string, params: TranslationParams = {}): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function moviesText(
  t: OptionalTranslate,
  key: MoviesTranslationKey,
  fallback: string,
  params?: TranslationParams,
): string {
  const translated = t?.(key, params);
  if (translated === undefined || translated === key) {
    return formatFallback(fallback, params);
  }
  return translated;
}

export function mediaLabel(
  media: MoviesSearchMedia,
  t?: OptionalTranslate,
  variant: MediaLabelVariant = "plural",
): string {
  if (media === "all") {
    return variant === "title"
      ? moviesText(t, "movies.media.allTitles", "All Titles")
      : moviesText(t, "movies.media.all", "All");
  }

  if (media === "tv") {
    return variant === "short" || variant === "singular"
      ? moviesText(t, "movies.media.tv", "TV")
      : moviesText(t, "movies.media.tvShows", "TV Shows");
  }

  return variant === "singular"
    ? moviesText(t, "movies.media.movie", "Movie")
    : moviesText(t, "movies.media.movies", "Movies");
}

export function countryLabel(
  country: MoviesFilterCountry | { readonly code: string; readonly name?: string },
  t?: OptionalTranslate,
): string {
  const code = country.code.trim().toUpperCase();
  const key = COUNTRY_NAME_KEYS[code];
  return key === undefined ? (country.name ?? code) : moviesText(t, key, country.name ?? code);
}

export function genreLabel(
  genre: MoviesFilterGenre | { readonly id: number; readonly name?: string },
  t?: OptionalTranslate,
): string {
  const key = GENRE_NAME_KEYS[genre.id];
  return key === undefined
    ? (genre.name ?? String(genre.id))
    : moviesText(t, key, genre.name ?? "");
}

export function sortLabel(sort: MoviesListSort, t?: OptionalTranslate): string {
  return moviesText(t, SORT_LABEL_KEYS[sort], SORT_FALLBACKS[sort]);
}

export function sortOptionLabel(option: MoviesFilterSortOption, t?: OptionalTranslate): string {
  return sortLabel(option.value, t);
}

export function catalogMediaOptions(t?: OptionalTranslate): readonly {
  readonly label: string;
  readonly value: MoviesSearchMedia;
}[] {
  return [
    { label: mediaLabel("all", t), value: "all" },
    { label: mediaLabel("movie", t), value: "movie" },
    { label: mediaLabel("tv", t), value: "tv" },
  ];
}

export function searchMediaTabs(t?: OptionalTranslate): readonly {
  readonly label: string;
  readonly value: MoviesSearchMedia;
}[] {
  return [
    { label: mediaLabel("all", t), value: "all" },
    { label: mediaLabel("movie", t), value: "movie" },
    { label: mediaLabel("tv", t, "short"), value: "tv" },
  ];
}

export function periodLabel(period: MoviesListPeriod, t?: OptionalTranslate): string {
  return period === "day"
    ? moviesText(t, "movies.period.day", "Day")
    : moviesText(t, "movies.period.week", "Week");
}

export function listKindLabel(kind: MoviesListKind, t?: OptionalTranslate): string {
  return kind === "trending-tv"
    ? moviesText(t, "movies.kind.trendingTv", "Trending TV")
    : moviesText(t, "movies.kind.trendingMovie", "Trending Movies");
}

export function homeGroupTitle(
  group: Pick<MoviesRowGroupConfig, "id" | "title">,
  t?: OptionalTranslate,
): string {
  if (group.id === "countries") {
    return moviesText(t, "movies.home.group.countries", group.title);
  }
  if (group.id === "genres") {
    return moviesText(t, "movies.home.group.genres", group.title);
  }
  return moviesText(t, "movies.home.group.trending", group.title);
}

export function homeRowTitle(row: MoviesRowConfig, t?: OptionalTranslate): string {
  const titleKey = HOME_ROW_TITLE_KEYS[row.id];
  if (titleKey !== undefined) {
    return moviesText(t, titleKey, row.title);
  }

  if (row.query.kind === "trending-movie") {
    return mediaLabel("movie", t);
  }
  if (row.query.kind === "trending-tv") {
    return mediaLabel("tv", t, "short");
  }
  if (row.query.country !== undefined) {
    return countryLabel({ code: row.query.country, name: row.query.countryName ?? row.title }, t);
  }
  if (row.query.genre !== undefined) {
    return genreLabel({ id: row.query.genre, name: row.query.genreName ?? row.title }, t);
  }
  return row.title;
}

export function homePeriodOptions(
  group: MoviesRowGroupConfig,
  t?: OptionalTranslate,
): readonly { readonly label: string; readonly value: MoviesListPeriod }[] {
  return (
    group.periodOptions?.map((option) => ({
      label: periodLabel(option.value, t),
      value: option.value,
    })) ?? []
  );
}

export function rowListLabel(
  group: MoviesRowGroupConfig,
  row: MoviesRowConfig,
  t?: OptionalTranslate,
): string {
  return `${homeGroupTitle(group, t)} ${homeRowTitle(row, t)}`;
}

function queryCountryLabel(query: MoviesListQuery, t?: OptionalTranslate): string {
  const code = query.country?.trim().toUpperCase();
  const fallback = query.countryName ?? code ?? "";
  return code === undefined || code.length === 0 ? "" : countryLabel({ code, name: fallback }, t);
}

function queryGenreLabel(query: MoviesListQuery, t?: OptionalTranslate): string {
  return query.genre === undefined
    ? (query.genreName?.trim() ?? "")
    : genreLabel({ id: query.genre, name: query.genreName }, t);
}

function periodLabelForQuery(query: MoviesListQuery, t?: OptionalTranslate): string {
  if (query.kind === "trending-movie" || query.kind === "trending-tv") {
    return periodLabel(query.period === "day" ? "day" : "week", t);
  }

  return "";
}

export function localizedListTitleForQuery(query: MoviesListQuery, t?: OptionalTranslate): string {
  const keyword = query.keyword?.trim();
  if (keyword !== undefined && keyword.length > 0) {
    const media = query.media ?? "all";
    return media === "all"
      ? moviesText(t, "movies.list.searchTitle", "Search: {keyword}", { keyword })
      : moviesText(t, "movies.list.searchMediaTitle", "Search {media}: {keyword}", {
          keyword,
          media: mediaLabel(media, t),
        });
  }

  if (query.kind !== undefined) {
    const period = periodLabelForQuery(query, t);
    const kind = listKindLabel(query.kind, t);
    return period.length > 0 ? `${kind} · ${period}` : kind;
  }

  const title = mediaLabel(
    query.media === "all" || query.media === "tv" ? query.media : "movie",
    t,
    "title",
  );
  const filters = [queryGenreLabel(query, t), queryCountryLabel(query, t)]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return filters.length > 0 ? `${title} · ${filters.join(" · ")}` : title;
}
