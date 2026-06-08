import {
  DEFAULT_MOVIES_LIST_LIMIT,
  type MovieEpisodeTarget,
  type MovieMediaType,
  type MoviePersonCredit,
  type MovieSummary,
  type MoviesListQuery,
} from "./moviesApi";
import { movieSlugFromText } from "./utils/movieSlug";

export type MoviesView =
  | { readonly name: "home" }
  | { readonly name: "list"; readonly query: MoviesListQuery }
  | {
      readonly mediaType: MovieMediaType;
      readonly name: "detail";
      readonly slug: string;
      readonly tmdbId: number;
    }
  | {
      readonly episodeNumber: number;
      readonly name: "episode";
      readonly seasonNumber: number;
      readonly slug: string;
      readonly tmdbId: number;
    }
  | { readonly name: "person"; readonly slug: string; readonly tmdbId: number }
  | { readonly autoplay?: boolean; readonly name: "watch"; readonly target: MoviesWatchTarget };

export type MoviesWatchTarget =
  | {
      readonly kind: "movie";
      readonly slug: string;
      readonly tmdbId: number;
    }
  | {
      readonly episodeNumber: number;
      readonly kind: "episode";
      readonly seasonNumber: number;
      readonly slug: string;
      readonly tmdbId: number;
    };

export type MoviesDeepLink =
  | {
      readonly mediaType: MovieMediaType;
      readonly name: "detail";
      readonly slug?: string;
      readonly tmdbId: number;
    }
  | {
      readonly episodeNumber: number;
      readonly name: "episode";
      readonly seasonNumber: number;
      readonly slug?: string;
      readonly tmdbId: number;
    }
  | { readonly name: "person"; readonly slug?: string; readonly tmdbId: number };

export function normalizeMoviesListQuery(query: MoviesListQuery): MoviesListQuery {
  return {
    ...query,
    limit: query.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
  };
}

export function createMoviesHomeView(): MoviesView {
  return { name: "home" };
}

export function createMoviesListView(query: MoviesListQuery): MoviesView {
  return { name: "list", query: normalizeMoviesListQuery(query) };
}

export function createMoviesSearchView(keyword: string): MoviesView {
  return createMoviesListView({ keyword, limit: DEFAULT_MOVIES_LIST_LIMIT, media: "all" });
}

export function movieDetailViewFromSummary(movie: MovieSummary): MoviesView {
  return {
    mediaType: movie.mediaType,
    name: "detail",
    slug: movie.slug,
    tmdbId: movie.tmdbId,
  };
}

export function movieEpisodeViewFromTarget(request: MovieEpisodeTarget): MoviesView {
  return {
    episodeNumber: request.episodeNumber,
    name: "episode",
    seasonNumber: request.seasonNumber,
    slug: request.slug,
    tmdbId: request.tmdbId,
  };
}

export function movieWatchViewFromSummary(
  movie: MovieSummary,
  options: { readonly autoplay?: boolean } = {},
): MoviesView {
  return {
    ...(options.autoplay === true ? { autoplay: true } : {}),
    name: "watch",
    target: {
      kind: "movie",
      slug: movie.slug,
      tmdbId: movie.tmdbId,
    },
  };
}

export function movieEpisodeWatchViewFromTarget(
  request: MovieEpisodeTarget,
  options: { readonly autoplay?: boolean } = {},
): MoviesView {
  return {
    ...(options.autoplay === true ? { autoplay: true } : {}),
    name: "watch",
    target: {
      episodeNumber: request.episodeNumber,
      kind: "episode",
      seasonNumber: request.seasonNumber,
      slug: request.slug,
      tmdbId: request.tmdbId,
    },
  };
}

export function moviePersonViewFromCredit(person: MoviePersonCredit): MoviesView | null {
  if (person.tmdbId === null) {
    return null;
  }

  return {
    name: "person",
    slug: movieSlugFromText(person.name, `person-${person.tmdbId}`),
    tmdbId: person.tmdbId,
  };
}

export function moviesViewFromDeepLink(intent: MoviesDeepLink): MoviesView {
  if (intent.name === "detail") {
    return {
      mediaType: intent.mediaType,
      name: "detail",
      slug: intent.slug ?? `tmdb-${intent.tmdbId}`,
      tmdbId: intent.tmdbId,
    };
  }

  if (intent.name === "episode") {
    return {
      episodeNumber: intent.episodeNumber,
      name: "episode",
      seasonNumber: intent.seasonNumber,
      slug: intent.slug ?? `tmdb-${intent.tmdbId}`,
      tmdbId: intent.tmdbId,
    };
  }

  return {
    name: "person",
    slug: intent.slug ?? `person-${intent.tmdbId}`,
    tmdbId: intent.tmdbId,
  };
}

export function moviesPathForView(view: MoviesView): string {
  if (view.name === "detail") {
    return `/${view.mediaType}/${view.tmdbId}-${pathSegment(view.slug)}`;
  }

  if (view.name === "watch") {
    if (view.target.kind === "movie") {
      return `/movie/${view.target.tmdbId}-${pathSegment(view.target.slug)}`;
    }

    return `/tv/${view.target.tmdbId}-${pathSegment(view.target.slug)}/season/${view.target.seasonNumber}/episode/${view.target.episodeNumber}`;
  }

  if (view.name === "person") {
    return `/person/${view.tmdbId}-${pathSegment(view.slug)}`;
  }

  if (view.name === "episode") {
    return `/tv/${view.tmdbId}-${pathSegment(view.slug)}/season/${view.seasonNumber}/episode/${view.episodeNumber}`;
  }

  return "/apps/movies";
}

export function moviesDeepLinkFromInitialState(
  args: Readonly<Record<string, unknown>> | undefined,
  pathname: string | null,
): MoviesDeepLink | null {
  const launchIntent = moviesDeepLinkFromLaunchArgs(args);
  return launchIntent ?? (pathname === null ? null : moviesDeepLinkFromPathname(pathname));
}

export function moviesDeepLinkFromLaunchArgs(
  args: Readonly<Record<string, unknown>> | undefined,
): MoviesDeepLink | null {
  const personTmdbId = positiveIntegerArg(args?.personTmdbId);
  if (personTmdbId !== null) {
    const slug = stringArg(args?.slug);
    return { name: "person", tmdbId: personTmdbId, ...(slug === null ? {} : { slug }) };
  }

  const episodeIntent = episodeDeepLinkFromLaunchArgs(args);
  if (episodeIntent !== null) {
    return episodeIntent;
  }

  const detailIntent = detailDeepLinkFromLaunchArgs(args);
  if (detailIntent !== null) {
    return detailIntent;
  }

  const path = stringArg(args?.path);
  return path === null ? null : moviesDeepLinkFromPathname(path);
}

export function moviesDeepLinkFromPathname(pathname: string): MoviesDeepLink | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2 && segments.length !== 6) {
    return null;
  }

  const mediaType = mediaTypeArg(segments[0]);
  const idSlug = decodePathSegment(segments[1]);
  if (idSlug === null) {
    return null;
  }

  const match = /^([1-9]\d*)-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/.exec(idSlug);
  if (match === null) {
    return null;
  }

  if (segments.length === 6) {
    if (mediaType !== "tv" || segments[2] !== "season" || segments[4] !== "episode") {
      return null;
    }

    const seasonNumber = nonNegativeIntegerArg(decodePathSegment(segments[3]));
    const episodeNumber = positiveIntegerArg(decodePathSegment(segments[5]));
    if (seasonNumber === null || episodeNumber === null) {
      return null;
    }

    return {
      episodeNumber,
      name: "episode",
      seasonNumber,
      slug: match[2],
      tmdbId: Number(match[1]),
    };
  }

  if (mediaType !== null) {
    return {
      mediaType,
      name: "detail",
      slug: match[2],
      tmdbId: Number(match[1]),
    };
  }

  if (segments[0] === "person") {
    return {
      name: "person",
      slug: match[2],
      tmdbId: Number(match[1]),
    };
  }

  return null;
}

function episodeDeepLinkFromLaunchArgs(
  args: Readonly<Record<string, unknown>> | undefined,
): MoviesDeepLink | null {
  const mediaType = mediaTypeArg(args?.mediaType);
  const tmdbId = positiveIntegerArg(args?.tmdbId);
  const seasonNumber = nonNegativeIntegerArg(args?.seasonNumber);
  const episodeNumber = positiveIntegerArg(args?.episodeNumber);
  if (mediaType !== "tv" || tmdbId === null || seasonNumber === null || episodeNumber === null) {
    return null;
  }

  const slug = stringArg(args?.slug);
  return {
    episodeNumber,
    name: "episode",
    seasonNumber,
    tmdbId,
    ...(slug === null ? {} : { slug }),
  };
}

function detailDeepLinkFromLaunchArgs(
  args: Readonly<Record<string, unknown>> | undefined,
): MoviesDeepLink | null {
  const mediaType = mediaTypeArg(args?.mediaType);
  const tmdbId = positiveIntegerArg(args?.tmdbId);
  if (mediaType === null || tmdbId === null) {
    return null;
  }

  const slug = stringArg(args?.slug);
  return {
    mediaType,
    name: "detail",
    tmdbId,
    ...(slug === null ? {} : { slug }),
  };
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function stringArg(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function mediaTypeArg(value: unknown): MovieMediaType | null {
  return value === "movie" || value === "tv" ? value : null;
}

function positiveIntegerArg(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isInteger(number) && Number(number) > 0 ? Number(number) : null;
}

function nonNegativeIntegerArg(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isInteger(number) && Number(number) >= 0 ? Number(number) : null;
}

function decodePathSegment(segment: string | undefined): string | null {
  if (segment === undefined) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
}
