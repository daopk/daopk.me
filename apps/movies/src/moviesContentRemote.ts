import type { SupportedLocale } from "@daopk/sdk";

import {
  fetchMovieDetail,
  fetchMovieEpisode,
  fetchMoviePerson,
  fetchMovieSeason,
  fetchMovieTrailer,
  type MovieDetail,
  type MovieEpisodeDetail,
  type MovieMediaType,
  type MoviePersonDetail,
  type MovieSeasonDetail,
  type MovieTrailerResult,
} from "./moviesApi";

export interface MoviesContentRemoteOptions {
  readonly locale: SupportedLocale;
  readonly signal: AbortSignal;
}

export interface MoviesContentRemote {
  fetchDetail(
    mediaType: MovieMediaType,
    tmdbId: number,
    options: MoviesContentRemoteOptions,
  ): Promise<MovieDetail>;
  fetchEpisode(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number,
    options: MoviesContentRemoteOptions,
  ): Promise<MovieEpisodeDetail>;
  fetchPerson(tmdbId: number, options: MoviesContentRemoteOptions): Promise<MoviePersonDetail>;
  fetchSeason(
    tmdbId: number,
    seasonNumber: number,
    options: MoviesContentRemoteOptions,
  ): Promise<MovieSeasonDetail>;
  fetchTrailer(
    mediaType: MovieMediaType,
    tmdbId: number,
    options: MoviesContentRemoteOptions,
  ): Promise<MovieTrailerResult>;
}

export const moviesContentHttpAdapter: MoviesContentRemote = {
  fetchDetail: fetchMovieDetail,
  fetchEpisode: fetchMovieEpisode,
  fetchPerson: fetchMoviePerson,
  fetchSeason: fetchMovieSeason,
  fetchTrailer: fetchMovieTrailer,
};

interface InMemoryDetail {
  readonly mediaType: MovieMediaType;
  readonly tmdbId: number;
  readonly value: MovieDetail;
}

interface InMemoryEpisode {
  readonly episodeNumber: number;
  readonly seasonNumber: number;
  readonly tmdbId: number;
  readonly value: MovieEpisodeDetail;
}

interface InMemoryPerson {
  readonly tmdbId: number;
  readonly value: MoviePersonDetail;
}

interface InMemorySeason {
  readonly seasonNumber: number;
  readonly tmdbId: number;
  readonly value: MovieSeasonDetail;
}

interface InMemoryTrailer {
  readonly mediaType: MovieMediaType;
  readonly tmdbId: number;
  readonly value: MovieTrailerResult;
}

export interface InMemoryMoviesContent {
  readonly details?: readonly InMemoryDetail[];
  readonly episodes?: readonly InMemoryEpisode[];
  readonly people?: readonly InMemoryPerson[];
  readonly seasons?: readonly InMemorySeason[];
  readonly trailers?: readonly InMemoryTrailer[];
}

export function createInMemoryMoviesContentAdapter(
  content: InMemoryMoviesContent,
): MoviesContentRemote {
  return {
    async fetchDetail(mediaType, tmdbId, options) {
      assertActive(options.signal);
      return findContent(
        content.details,
        (entry) => entry.mediaType === mediaType && entry.tmdbId === tmdbId,
        "detail",
      ).value;
    },
    async fetchEpisode(tmdbId, seasonNumber, episodeNumber, options) {
      assertActive(options.signal);
      return findContent(
        content.episodes,
        (entry) =>
          entry.tmdbId === tmdbId &&
          entry.seasonNumber === seasonNumber &&
          entry.episodeNumber === episodeNumber,
        "episode",
      ).value;
    },
    async fetchPerson(tmdbId, options) {
      assertActive(options.signal);
      return findContent(content.people, (entry) => entry.tmdbId === tmdbId, "person").value;
    },
    async fetchSeason(tmdbId, seasonNumber, options) {
      assertActive(options.signal);
      return findContent(
        content.seasons,
        (entry) => entry.tmdbId === tmdbId && entry.seasonNumber === seasonNumber,
        "season",
      ).value;
    },
    async fetchTrailer(mediaType, tmdbId, options) {
      assertActive(options.signal);
      return findContent(
        content.trailers,
        (entry) => entry.mediaType === mediaType && entry.tmdbId === tmdbId,
        "trailer",
      ).value;
    },
  };
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("The request was aborted.", "AbortError");
  }
}

function findContent<T>(
  entries: readonly T[] | undefined,
  matches: (entry: T) => boolean,
  kind: string,
): T {
  const entry = entries?.find(matches);
  if (entry === undefined) {
    throw new Error(`In-memory Movies ${kind} content was not found.`);
  }
  return entry;
}
