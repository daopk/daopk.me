import type { SupportedLocale } from "@daopk/sdk";
import {
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
  MovieDetail,
  MovieEpisodeDetail,
  MovieMediaType,
  MoviePersonDetail,
  MovieSeasonDetail,
} from "./moviesApi";
import {
  moviesContentHttpAdapter,
  type MoviesContentRemote,
  type MoviesContentRemoteOptions,
} from "./moviesContentRemote";
import type { MoviesWatchTarget } from "./moviesWatchContinuity";

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

export interface MoviesContentModule {
  use<Request extends MoviesContentRequest>(
    request: () => Request | null,
    locale: Readonly<Ref<SupportedLocale>>,
  ): MoviesContentResource<Request>;
}

export function createMoviesContent(remote: MoviesContentRemote): MoviesContentModule {
  return {
    use<Request extends MoviesContentRequest>(
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
