import {
  appIntent,
  decodePathSegment,
  type AppUrlIntent,
  type AppUrlIntentMetadata,
} from "./intentShared";

const TMDB_ID_SLUG_PATTERN = /^([1-9]\d*)-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Parses `/movie/...`, `/tv/...`, and `/tmdb/person/...` paths into a movies intent. */
export function parseMoviesUrlIntent(
  canonicalPath: string,
  segments: readonly string[],
  urlIntent?: AppUrlIntentMetadata,
): AppUrlIntent {
  const section = segments[0];
  if (section === "movie" || section === "tv") {
    const path = validMoviesMediaPath(canonicalPath, segments);
    return appIntent("movies", path === null ? undefined : { path }, urlIntent);
  }

  if (section === "tmdb" && segments[1] === "person") {
    const path = validMoviesPersonPath(canonicalPath, segments);
    return appIntent("movies", path === null ? undefined : { path }, urlIntent);
  }

  return { kind: "none" };
}

function validMoviesPersonPath(pathname: string, segments: readonly string[]): string | null {
  if (segments.length !== 3 || segments[0] !== "tmdb" || segments[1] !== "person") {
    return null;
  }

  const idSlug = decodePathSegment(segments[2]);
  if (idSlug === null || TMDB_ID_SLUG_PATTERN.exec(idSlug) === null) {
    return null;
  }

  return pathname;
}

function validMoviesMediaPath(pathname: string, segments: readonly string[]): string | null {
  const section = segments[0];
  if (segments.length === 2) {
    const idSlug = decodePathSegment(segments[1]);
    return idSlug !== null && TMDB_ID_SLUG_PATTERN.exec(idSlug) !== null ? pathname : null;
  }

  if (segments.length === 4 && section === "tv") {
    const idSlug = decodePathSegment(segments[1]);
    const seasonNumber = decodePathSegment(segments[3] ?? "");
    return idSlug !== null &&
      TMDB_ID_SLUG_PATTERN.exec(idSlug) !== null &&
      segments[2] === "season" &&
      seasonNumber !== null &&
      /^(?:0|[1-9]\d*)$/.exec(seasonNumber) !== null
      ? pathname
      : null;
  }

  if (segments.length !== 6 || section !== "tv") {
    return null;
  }

  const idSlug = decodePathSegment(segments[1]);
  const seasonNumber = decodePathSegment(segments[3] ?? "");
  const episodeNumber = decodePathSegment(segments[5] ?? "");
  return idSlug !== null &&
    TMDB_ID_SLUG_PATTERN.exec(idSlug) !== null &&
    segments[2] === "season" &&
    segments[4] === "episode" &&
    seasonNumber !== null &&
    episodeNumber !== null &&
    /^(?:0|[1-9]\d*)$/.exec(seasonNumber) !== null &&
    /^[1-9]\d*$/.exec(episodeNumber) !== null
    ? pathname
    : null;
}
